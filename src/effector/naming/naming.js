//@flow

import type {Store, Event, Effect} from '../unit.h'
import {type CompositeName, createName} from './compositeName'
import {is} from '../stdlib'

export function getDisplayName(unit: {
  compositeName?: CompositeName,
  domainName?: CompositeName,
  /*::+*/ id: string,
  /*::...*/
}) {
  if (unit.compositeName) {
    return unit.compositeName.fullName
  }
  if (unit.domainName) {
    return unit.domainName.fullName
  }
  return unit.id
}

export function unitObjectName(
  objOrArr:
    | $ReadOnlyArray<
        Store<any> | Event<any> | Effect<any, any, any> | any | null,
      >
    | {
        [key: string]:
          | Store<any>
          | Event<any>
          | Effect<any, any, any>
          | any
          | null,
        ...,
      },
  method: string = 'combine',
) {
  let name = method + '('
  let comma = ''
  let i = 0
  //$todo
  for (const key in objOrArr) {
    //$todo
    const unit = objOrArr[key]
    if (unit != null) {
      name += comma
      //$todo
      name += is.unit(unit) ? getDisplayName(unit) : unit.toString()
    }
    i += 1
    /* inlined max object names constant */
    if (i === 25) break
    comma = ', '
  }
  name += ')'
  return name
}

export function setStoreName<State>(store: Store<State>, rawName: string) {
  const compositeName = createName(rawName, store.domainName)
  store.shortName = rawName
  if (!store.compositeName) {
    store.compositeName = compositeName
    return
  }
  //$todo
  store.compositeName.path = compositeName.path
  //$todo
  store.compositeName.shortName = compositeName.shortName
  //$todo
  store.compositeName.fullName = compositeName.fullName
}
