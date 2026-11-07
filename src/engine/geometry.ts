import type { Matrix, Pt, Rect, Stroke } from './types.ts'

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Small deterministic PRNG so textured brushes replay identically. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function pointsBounds(points: { x: number; y: number }[]): Rect {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of points) {
    if (p.x < x0) x0 = p.x
    if (p.y < y0) y0 = p.y
    if (p.x > x1) x1 = p.x
    if (p.y > y1) y1 = p.y
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export function padRect(r: Rect, pad: number): Rect {
  return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 }
}

export function unionRect(a: Rect | null, b: Rect): Rect {
  if (!a) return b
  const x0 = Math.min(a.x, b.x)
  const y0 = Math.min(a.y, b.y)
  const x1 = Math.max(a.x + a.w, b.x + b.w)
  const y1 = Math.max(a.y + a.h, b.y + b.h)
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export function rectsIntersect(a: Rect, b: Rect) {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y
}

export function rectContains(r: Rect, x: number, y: number) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}

export function normRect(x0: number, y0: number, x1: number, y1: number): Rect {
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) }
}

export function pointInPolygon(x: number, y: number, poly: { x: number; y: number }[]) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** Bounds of everything a stroke can touch, including brush radius. */
export function strokeBounds(s: Stroke): Rect {
  if (s.tool === 'bitmap' && s.bitmap) return { x: s.bitmap.x, y: s.bitmap.y, w: s.bitmap.dw ?? s.bitmap.w, h: s.bitmap.dh ?? s.bitmap.h }
  const b = pointsBounds(s.points)
  return padRect(b, s.size * 0.75 + 2)
}

/** Ellipse as a closed polyline so every stroke is just points (easy to transform). */
export function ellipsePoints(cx: number, cy: number, rx: number, ry: number, p = 1, n = 72): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * Math.PI * 2
    out.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry, p })
  }
  return out
}

export function rectPoints(x0: number, y0: number, x1: number, y1: number, p = 1): Pt[] {
  return [
    { x: x0, y: y0, p },
    { x: x1, y: y0, p },
    { x: x1, y: y1, p },
    { x: x0, y: y1, p },
  ]
}

/** Builds the point list for a drag-defined shape. `constrain` = shift key. */
export function shapePointsFromDrag(
  tool: 'line' | 'rect' | 'ellipse',
  a: { x: number; y: number },
  b: { x: number; y: number },
  constrain: boolean,
  fromCenter = false,
): Pt[] {
  let { x: x1, y: y1 } = b
  if (tool === 'line') {
    if (constrain) {
      const ang = Math.atan2(y1 - a.y, x1 - a.x)
      const snap = Math.round(ang / (Math.PI / 12)) * (Math.PI / 12)
      const len = dist(a, b)
      x1 = a.x + Math.cos(snap) * len
      y1 = a.y + Math.sin(snap) * len
    }
    return [
      { x: a.x, y: a.y, p: 1 },
      { x: x1, y: y1, p: 1 },
    ]
  }
  if (constrain) {
    const dx = x1 - a.x
    const dy = y1 - a.y
    const m = Math.max(Math.abs(dx), Math.abs(dy))
    x1 = a.x + Math.sign(dx || 1) * m
    y1 = a.y + Math.sign(dy || 1) * m
  }
  const x0 = fromCenter ? a.x - (x1 - a.x) : a.x
  const y0 = fromCenter ? a.y - (y1 - a.y) : a.y
  if (tool === 'rect') return rectPoints(x0, y0, x1, y1)
  return ellipsePoints((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2)
}

/**
 * Stroke stabilizer: the pen "pulls" the line behind it like a string.
 * strength 0 = raw input, 1 = very heavy smoothing.
 */
export class Stabilizer {
  private cur: Pt | null = null
  private readonly k: number
  constructor(strength: number) {
    // map 0..1 to a follow factor 1..0.08
    this.k = 1 - clamp(strength, 0, 1) * 0.92
  }
  push(raw: Pt): Pt {
    if (!this.cur || this.k >= 0.999) {
      this.cur = { ...raw }
      return this.cur
    }
    this.cur = {
      x: this.cur.x + (raw.x - this.cur.x) * this.k,
      y: this.cur.y + (raw.y - this.cur.y) * this.k,
      p: this.cur.p + (raw.p - this.cur.p) * Math.max(this.k, 0.35),
    }
    return { ...this.cur }
  }
  /** Catch the line up to the real pen position at lift-off. */
  finish(raw: Pt): Pt[] {
    if (!this.cur || this.k >= 0.999) return []
    const out: Pt[] = []
    let guard = 0
    while (dist(this.cur, raw) > 0.75 && guard < 40) {
      out.push(this.push(raw))
      guard += 1
    }
    return out
  }
}

export interface Dab {
  x: number
  y: number
  p: number
  /** distance along the path */
  d: number
}

/**
 * Smooths the raw point list into a curve (quadratic through midpoints) and
 * walks it, emitting a dab every `step` px with interpolated pressure.
 */
export function sampleDabs(points: Pt[], step: number): { dabs: Dab[]; length: number } {
  const n = points.length
  if (n === 0) return { dabs: [], length: 0 }
  if (n === 1) return { dabs: [{ x: points[0].x, y: points[0].y, p: points[0].p, d: 0 }], length: 0 }

  const dense: Pt[] = [points[0]]
  const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, p: (a.p + b.p) / 2 })
  if (n === 2) {
    dense.push(points[1])
  } else {
    let start = mid(points[0], points[1])
    dense.push(start)
    for (let i = 1; i < n - 1; i += 1) {
      const ctrl = points[i]
      const end = mid(points[i], points[i + 1])
      const len = dist(start, ctrl) + dist(ctrl, end)
      const segs = Math.max(2, Math.ceil(len / 3))
      for (let s = 1; s <= segs; s += 1) {
        const t = s / segs
        const u = 1 - t
        dense.push({
          x: u * u * start.x + 2 * u * t * ctrl.x + t * t * end.x,
          y: u * u * start.y + 2 * u * t * ctrl.y + t * t * end.y,
          p: u * u * start.p + 2 * u * t * ctrl.p + t * t * end.p,
        })
      }
      start = end
    }
    dense.push(points[n - 1])
  }

  const dabs: Dab[] = [{ x: dense[0].x, y: dense[0].y, p: dense[0].p, d: 0 }]
  let carry = 0
  let travelled = 0
  for (let i = 1; i < dense.length; i += 1) {
    const a = dense[i - 1]
    const b = dense[i]
    const seg = dist(a, b)
    if (seg === 0) continue
    let at = step - carry
    while (at <= seg) {
      const t = at / seg
      dabs.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), p: lerp(a.p, b.p, t), d: travelled + at })
      at += step
    }
    carry = seg - (at - step)
    travelled += seg
  }
  return { dabs, length: travelled }
}

export function matrixTranslate(dx: number, dy: number): Matrix {
  return { a: 1, b: 0, c: 0, d: 1, e: dx, f: dy }
}

/** Rotation + uniform scale + optional flips about a centre point. */
export function matrixAbout(cx: number, cy: number, o: { rotate?: number; scale?: number; flipX?: boolean; flipY?: boolean }): Matrix {
  const r = o.rotate ?? 0
  const s = o.scale ?? 1
  const sx = s * (o.flipX ? -1 : 1)
  const sy = s * (o.flipY ? -1 : 1)
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  // M = T(c) * R * S * T(-c)
  const a = cos * sx
  const b = sin * sx
  const c = -sin * sy
  const d = cos * sy
  return { a, b, c, d, e: cx - (a * cx + c * cy), f: cy - (b * cx + d * cy) }
}

export function isTranslation(m: Matrix) {
  return Math.abs(m.a - 1) < 1e-9 && Math.abs(m.d - 1) < 1e-9 && Math.abs(m.b) < 1e-9 && Math.abs(m.c) < 1e-9
}

export function transformStroke(s: Stroke, m: Matrix): Stroke {
  if (s.tool === 'bitmap' && s.bitmap) {
    if (!isTranslation(m)) return s
    return { ...s, bitmap: { ...s.bitmap, x: s.bitmap.x + m.e, y: s.bitmap.y + m.f } }
  }
  if (s.tool === 'fill') return s
  const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c))
  return {
    ...s,
    size: s.size * scale,
    points: s.points.map((p) => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f, p: p.p })),
  }
}

export function mirrorStroke(s: Stroke, axisX: number, id: string): Stroke {
  return { ...s, id, seed: s.seed + 1, points: s.points.map((p) => ({ ...p, x: axisX * 2 - p.x })) }
}

/** Distance from point to a polyline (used for click-selecting strokes). */
export function distToPolyline(px: number, py: number, pts: { x: number; y: number }[], closed: boolean) {
  if (pts.length === 1) return Math.hypot(px - pts[0].x, py - pts[0].y)
  let best = Infinity
  const count = closed ? pts.length : pts.length - 1
  for (let i = 0; i < count; i += 1) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const l2 = dx * dx + dy * dy
    const t = l2 === 0 ? 0 : clamp(((px - a.x) * dx + (py - a.y) * dy) / l2, 0, 1)
    const d = Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy))
    if (d < best) best = d
  }
  return best
}

/** Strokes with at least half their points inside a freehand lasso. Fills are skipped. */
export function strokeIdsInPolygon(strokes: Stroke[], poly: { x: number; y: number }[]): string[] {
  if (poly.length < 3) return []
  const b = pointsBounds(poly)
  return strokes
    .filter((st) => {
      if (st.tool === 'fill') return false
      const pts = st.tool === 'bitmap' && st.bitmap ? [{ x: st.bitmap.x + (st.bitmap.dw ?? st.bitmap.w) / 2, y: st.bitmap.y + (st.bitmap.dh ?? st.bitmap.h) / 2 }] : st.points
      if (pts.length === 0) return false
      const hits = pts.filter((p) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h && pointInPolygon(p.x, p.y, poly)).length
      return hits / pts.length >= 0.5
    })
    .map((st) => st.id)
}
