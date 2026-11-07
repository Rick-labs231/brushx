/**
 * Snapshot history. Projects are immutable and share unchanged strokes, so a
 * snapshot only costs the few object references that actually changed.
 */
export interface History<T> {
  past: T[]
  future: T[]
}

export const HISTORY_LIMIT = 150

export const emptyHistory = <T>(): History<T> => ({ past: [], future: [] })

export function record<T>(h: History<T>, before: T): History<T> {
  const past = [...h.past, before]
  if (past.length > HISTORY_LIMIT) past.shift()
  return { past, future: [] }
}

export function undo<T>(h: History<T>, present: T): { history: History<T>; value: T } | null {
  if (h.past.length === 0) return null
  const value = h.past[h.past.length - 1]
  return { value, history: { past: h.past.slice(0, -1), future: [present, ...h.future] } }
}

export function redo<T>(h: History<T>, present: T): { history: History<T>; value: T } | null {
  if (h.future.length === 0) return null
  const value = h.future[0]
  return { value, history: { past: [...h.past, present], future: h.future.slice(1) } }
}
