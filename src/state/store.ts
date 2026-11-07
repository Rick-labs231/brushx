import { useSyncExternalStore } from 'react'

/** Minimal external store (zustand-style) — no dependency needed. */
export interface Store<T> {
  getState: () => T
  setState: (patch: Partial<T> | ((s: T) => Partial<T>)) => void
  subscribe: (fn: () => void) => () => void
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    getState: () => state,
    setState: (patch) => {
      const next = typeof patch === 'function' ? patch(state) : patch
      state = { ...state, ...next }
      listeners.forEach((l) => l())
    },
    subscribe: (fn) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
  }
}

/** Select a slice. The selector must return a stable value (primitive or existing reference). */
export function useStoreSelector<T extends object, S>(store: Store<T>, selector: (s: T) => S): S {
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()))
}
