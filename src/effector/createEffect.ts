import type {Unit} from './index.h'
import type {Effect} from './unit.h'
import {calc, run} from './step'
import {getForkPage, getGraph, getMeta, getParent, setMeta} from './getter'
import {own} from './own'
import {createNode} from './createNode'
import {launch, setForkPage, forkPage, isWatch, Stack} from './kernel'
import {createStore, createEvent} from './createUnit'
import {createDefer} from './defer'
import {isObject, isFunction} from './is'
import {assert} from './throw'
import {EFFECT} from './tag'
import {add} from './collection'

export function createEffect<Params, Done, Fail = Error>(
  nameOrConfig: any,
  maybeConfig?: any,
): Effect<Params, Done, Fail> {
  const instance = createEvent(
    isFunction(nameOrConfig) ? {handler: nameOrConfig} : nameOrConfig,
    maybeConfig,
  ) as unknown as Effect<Params, Done, Fail>
  const node = getGraph(instance)
  setMeta(node, 'op', (instance.kind = EFFECT))
  //@ts-expect-error
  instance.use = (fn: Function) => {
    assert(isFunction(fn), '.use argument should be a function')
    runner.scope.handler = fn
    return instance
  }
  instance.use.getCurrent = () => runner.scope.handler
  const anyway = (instance.finally = createEvent({
    named: 'finally',
    derived: true,
  }))
  const done = (instance.done = (anyway as any).filterMap({
    named: 'done',
    fn({
      status,
      params,
      result,
    }: {
      status: 'done' | 'fail'
      params: Params
      result: Done
      error: Fail
    }) {
      if (status === 'done') return {params, result}
    },
  }))
  const fail = (instance.fail = (anyway as any).filterMap({
    named: 'fail',
    fn({
      status,
      params,
      error,
    }: {
      status: 'done' | 'fail'
      params: Params
      result: Done
      error: Fail
    }) {
      if (status === 'fail') return {params, error}
    },
  }))
  const doneData = (instance.doneData = done.map({
    named: 'doneData',
    fn: ({result}: {result: Done}) => result,
  }))
  const failData = (instance.failData = fail.map({
    named: 'failData',
    fn: ({error}: {error: Fail}) => error,
  }))

  const runner = createNode({
    scope: {
      handlerId: getMeta(node, 'sid'),
      handler:
        instance.defaultConfig.handler ||
        (() => assert(false, `no handler used in ${instance.getType()}`)),
    },
    node: [
      calc(
        (upd, scope_, stack) => {
          const scope: {handlerId: string; handler: Function} = scope_ as any
          let handler = scope.handler
          if (getForkPage(stack)) {
            const handler_ = getForkPage(stack)!.handlers[scope.handlerId]
            if (handler_) handler = handler_
          }
          upd.handler = handler
          return upd
        },
        false,
        true,
      ),
      calc(
        ({params, req, handler, args = [params]}, _, stack) => {
          const onResolve = onSettled(params, req, true, anyway, stack)
          const onReject = onSettled(params, req, false, anyway, stack)
          const [ok, result] = runFn(handler, onReject, args)
          if (ok) {
            if (isObject(result) && isFunction(result.then)) {
              result.then(onResolve, onReject)
            } else {
              onResolve(result)
            }
          }
        },
        false,
        true,
      ),
    ],
    meta: {op: 'fx', fx: 'runner'},
  })
  node.scope.runner = runner
  add(
    node.seq,
    calc(
      (params, {runner}, stack) => {
        const upd = getParent(stack)
          ? {params, req: {rs(data: Done) {}, rj(data: Fail) {}}}
          : /** empty stack means that this node was launched directly */
            params
        launch({
          target: runner,
          params: upd,
          defer: true,
          scope: getForkPage(stack),
        })
        return upd.params
      },
      false,
      true,
    ),
  )
  //@ts-expect-error
  instance.create = (params: Params) => {
    const req = createDefer()
    const payload = {params, req}
    if (forkPage) {
      if (!isWatch) {
        const savedFork = forkPage
        req.req
          .finally(() => {
            setForkPage(savedFork)
          })
          .catch(() => {})
      }
      launch({target: instance, params: payload, scope: forkPage})
    } else {
      launch(instance, payload)
    }
    return req.req
  }

  const inFlight = (instance.inFlight = createStore(0, {
    serialize: 'ignore',
  })
    .on(instance, x => x + 1)
    .on(anyway, x => x - 1)
    .map({
      // @ts-expect-error
      fn: x => x,
      named: 'inFlight',
    }))
  setMeta(anyway, 'needFxCounter', 'dec')
  setMeta(instance, 'needFxCounter', true)
  const pending = (instance.pending = inFlight.map({
    //@ts-expect-error
    fn: amount => amount > 0,
    named: 'pending',
  }))

  own(instance, [anyway, done, fail, doneData, failData, pending, inFlight])
  return instance
}
export const runFn = (
  fn: Function,
  onReject: (data: any) => void,
  args: any[],
): [boolean, any] => {
  try {
    return [true, fn(...args)]
  } catch (err) {
    onReject(err)
    return [false, null]
  }
}

export const onSettled =
  (
    params: any,
    req: {
      rs(_: any): void
      rj(_: any): void
    },
    ok: boolean,
    anyway: Unit,
    stack: Stack,
  ) =>
  (data: any) =>
    launch({
      target: [anyway, sidechain],
      params: [
        ok
          ? {status: 'done', params, result: data}
          : {status: 'fail', params, error: data},
        {value: data, fn: ok ? req.rs : req.rj},
      ],
      defer: true,
      page: stack.page,
      scope: getForkPage(stack),
    })

const sidechain = createNode({
  node: [run({fn: ({fn, value}) => fn(value)})],
  meta: {op: 'fx', fx: 'sidechain'},
})
