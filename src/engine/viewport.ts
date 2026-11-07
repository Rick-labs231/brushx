import { clamp } from './geometry.ts'
import type { Matrix, Viewport } from './types.ts'

export const MIN_ZOOM = 0.05
export const MAX_ZOOM = 32

export interface Dims {
  stageW: number
  stageH: number
  artW: number
  artH: number
}

/** screen = stageCentre + pan + zoom * R(rot) * (art - artCentre) */
export function viewportMatrix(vp: Viewport, d: Dims): Matrix {
  const cos = Math.cos(vp.rot) * vp.zoom
  const sin = Math.sin(vp.rot) * vp.zoom
  const a = cos
  const b = sin
  const c = -sin
  const dd = cos
  const cx = d.artW / 2
  const cy = d.artH / 2
  return { a, b, c, d: dd, e: d.stageW / 2 + vp.panX - (a * cx + c * cy), f: d.stageH / 2 + vp.panY - (b * cx + dd * cy) }
}

export function toScreen(vp: Viewport, d: Dims, x: number, y: number) {
  const m = viewportMatrix(vp, d)
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }
}

export function toArt(vp: Viewport, d: Dims, sx: number, sy: number) {
  const m = viewportMatrix(vp, d)
  const det = m.a * m.d - m.b * m.c
  const dx = sx - m.e
  const dy = sy - m.f
  return { x: (m.d * dx - m.c * dy) / det, y: (-m.b * dx + m.a * dy) / det }
}

/** Fit the artboard in the stage with a margin, no rotation. */
export function fitViewport(d: Dims, margin = 48): Viewport {
  const zoom = clamp(Math.min((d.stageW - margin * 2) / d.artW, (d.stageH - margin * 2) / d.artH), MIN_ZOOM, 1.5)
  return { panX: 0, panY: 0, zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : 1, rot: 0 }
}

/** Keeps the art point `art` under the screen point `screen`. */
export function anchorAt(vp: Viewport, d: Dims, art: { x: number; y: number }, screen: { x: number; y: number }): Viewport {
  const cur = toScreen(vp, d, art.x, art.y)
  return { ...vp, panX: vp.panX + (screen.x - cur.x), panY: vp.panY + (screen.y - cur.y) }
}

export function zoomAt(vp: Viewport, d: Dims, factor: number, screen: { x: number; y: number }): Viewport {
  const art = toArt(vp, d, screen.x, screen.y)
  const next = { ...vp, zoom: clamp(vp.zoom * factor, MIN_ZOOM, MAX_ZOOM) }
  return anchorAt(next, d, art, screen)
}

export function rotateAt(vp: Viewport, d: Dims, delta: number, screen: { x: number; y: number }): Viewport {
  const art = toArt(vp, d, screen.x, screen.y)
  return anchorAt({ ...vp, rot: vp.rot + delta }, d, art, screen)
}

export interface Touch2 {
  mid: { x: number; y: number }
  dist: number
  angle: number
}

export function touchInfo(a: { x: number; y: number }, b: { x: number; y: number }): Touch2 {
  return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: Math.hypot(b.x - a.x, b.y - a.y) || 1, angle: Math.atan2(b.y - a.y, b.x - a.x) }
}

/** Two-finger pan + pinch-zoom + twist, anchored at the starting midpoint. */
export function gestureViewport(start: Viewport, d: Dims, from: Touch2, to: Touch2): Viewport {
  const art = toArt(start, d, from.mid.x, from.mid.y)
  const next: Viewport = {
    ...start,
    zoom: clamp(start.zoom * (to.dist / from.dist), MIN_ZOOM, MAX_ZOOM),
    rot: start.rot + (to.angle - from.angle),
  }
  return anchorAt(next, d, art, to.mid)
}
