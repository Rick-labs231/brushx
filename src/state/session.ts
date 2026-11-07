import type { Anchor } from '../engine/bezier.ts'
import type { Pt, Rect, Stroke } from '../engine/types.ts'

/**
 * Live, non-reactive state for the gesture in progress. It changes on every
 * pointer move, so it lives outside React and the stage redraws from it
 * directly via requestAnimationFrame.
 */
export const session = {
  draft: [] as Stroke[],
  draftLayerId: null as string | null,
  polygon: null as Pt[] | null,
  bezier: null as Anchor[] | null,
  crop: null as Rect | null,
  cursor: null as { x: number; y: number } | null, // art space
  cursorScreen: null as { x: number; y: number } | null,
  marquee: null as Rect | null,
  lasso: null as Pt[] | null,
  moveOffset: null as { dx: number; dy: number } | null,
  moveBase: null as Stroke[] | null,
  moveStrokes: null as Stroke[] | null,
  spaceHeld: false,
  panning: false,
}

const listeners = new Set<() => void>()

export function onSession(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function pokeSession() {
  listeners.forEach((l) => l())
}

export function clearGesture() {
  session.draft = []
  session.draftLayerId = null
  session.marquee = null
  session.crop = null
  session.lasso = null
  session.moveOffset = null
  session.moveBase = null
  session.moveStrokes = null
  pokeSession()
}
