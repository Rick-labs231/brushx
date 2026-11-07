import { fitViewport, rotateAt, zoomAt, type Dims } from '../engine/viewport.ts'
import { patch } from '../state/actions.ts'
import { store } from '../state/app.ts'

export function stageDims(): Dims | null {
  const el = document.querySelector('.stage')
  const p = store.getState().project
  if (!el || !p) return null
  const r = el.getBoundingClientRect()
  return { stageW: r.width, stageH: r.height, artW: p.width, artH: p.height }
}

export function fitView() {
  const d = stageDims()
  if (d) patch({ viewport: fitViewport(d) })
}

export function zoomBy(factor: number) {
  const d = stageDims()
  if (d) patch({ viewport: zoomAt(store.getState().viewport, d, factor, { x: d.stageW / 2, y: d.stageH / 2 }) })
}

export function rotateBy(radians: number) {
  const d = stageDims()
  if (d) patch({ viewport: rotateAt(store.getState().viewport, d, radians, { x: d.stageW / 2, y: d.stageH / 2 }) })
}
