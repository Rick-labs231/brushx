import { flattenBezier } from '../engine/bezier.ts'
import { newStroke } from '../engine/brushes.ts'
import type { Stroke, ToolId } from '../engine/types.ts'
import { withMirror } from '../ui/stageRender.ts'
import { store } from './app.ts'
import { activeLayer, commitStrokes } from './actions.ts'
import { clearGesture, pokeSession, session } from './session.ts'
import { toast } from './toast.ts'

let lastWarn = 0
function warn(text: string) {
  const now = Date.now()
  if (now - lastWarn < 1800) return
  lastWarn = now
  toast(text, 'info')
}

/** True when the active layer can take paint; otherwise says why (once). */
export function canDraw(): boolean {
  const layer = activeLayer(store.getState())
  if (!layer) {
    warn('Pick a layer to draw on.')
    return false
  }
  if (!layer.visible) {
    warn('This layer is hidden. Show it to draw on it.')
    return false
  }
  if (layer.locked) {
    warn('This layer is locked. Unlock it to draw on it.')
    return false
  }
  return true
}

export function strokeForTool(tool: ToolId): Stroke {
  const s = store.getState()
  return newStroke(tool, s.toolSettings[tool], { color: s.color, shapeFill: s.shapeFill, tolerance: s.fillTolerance })
}

/** Commit whatever is in the live draft (with mirror images if symmetry is on). */
export function commitDraft() {
  const s = store.getState()
  const drafts = session.draft
  const project = s.project
  if (project && drafts.length) commitStrokes(withMirror(drafts, s.symmetry, project.width))
  clearGesture()
}

export function finishPolygon() {
  const pts = session.polygon
  session.polygon = null
  if (pts && pts.length >= 3) {
    const stroke = { ...strokeForTool('polygon'), points: pts }
    const s = store.getState()
    if (s.project && canDraw()) commitStrokes(withMirror([stroke], s.symmetry, s.project.width))
  }
  pokeSession()
}

export function cancelPolygon() {
  session.polygon = null
  pokeSession()
}

/** Turns the curve being drawn into a stroke on the current layer. */
export function finishBezier(closed = false) {
  const anchors = session.bezier
  session.bezier = null
  if (anchors && anchors.length >= 2) {
    const stroke = { ...strokeForTool('polygon'), points: flattenBezier(anchors, closed), closed }
    const s = store.getState()
    if (s.project && canDraw()) commitStrokes(withMirror([stroke], s.symmetry, s.project.width))
  }
  pokeSession()
}

export function cancelBezier() {
  session.bezier = null
  pokeSession()
}
