import { matrixTranslate, transformStroke } from './geometry.ts'
import { uid } from './ids.ts'
import type { Stroke } from './types.ts'

/** What goes on the clipboard: eraser strokes stay behind, since pasting them would erase other art. */
export function copyableStrokes(strokes: Stroke[]): Stroke[] {
  return strokes.filter((s) => s.tool !== 'eraser')
}

/** Fresh copies with new ids, optionally shifted. The originals are never touched. */
export function cloneStrokes(strokes: Stroke[], dx = 0, dy = 0): Stroke[] {
  const m = matrixTranslate(dx, dy)
  return strokes.map((s) => ({ ...(dx || dy ? transformStroke(s, m) : s), id: uid() }))
}
