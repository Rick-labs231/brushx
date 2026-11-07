// Template guides are construction blueprints, not finished art (Brand Bible 11.14).
// Coordinates live in a unit box: x,y in -0.5..0.5, y pointing down, scaled by
// min(canvas width, canvas height).

export type V = [number, number]

export type GuideShape =
  | { k: 'line'; pts: V[] }
  | { k: 'ellipse'; c: V; r: V }
  | { k: 'curve'; p: [V, V, V] } // quadratic bezier

export const line = (...pts: V[]): GuideShape => ({ k: 'line', pts })
export const ell = (cx: number, cy: number, rx: number, ry: number): GuideShape => ({ k: 'ellipse', c: [cx, cy], r: [rx, ry] })
export const circ = (cx: number, cy: number, r: number): GuideShape => ell(cx, cy, r, r)
export const curve = (a: V, b: V, c: V): GuideShape => ({ k: 'curve', p: [a, b, c] })
export const box = (x: number, y: number, w: number, h: number): GuideShape => line([x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y])
export const poly = (...pts: V[]): GuideShape => line(...pts, pts[0])
/** Short tick marks for joints. */
export const joint = (x: number, y: number): GuideShape => circ(x, y, 0.009)

export function quadAt(p: [V, V, V], t: number): V {
  const u = 1 - t
  return [u * u * p[0][0] + 2 * u * t * p[1][0] + t * t * p[2][0], u * u * p[0][1] + 2 * u * t * p[1][1] + t * t * p[2][1]]
}

/** Every shape as polylines, for turning a guide into real strokes. */
export function shapeToPolylines(s: GuideShape): V[][] {
  if (s.k === 'line') return [s.pts]
  if (s.k === 'curve') return [Array.from({ length: 17 }, (_, i) => quadAt(s.p, i / 16))]
  const n = 40
  return [Array.from({ length: n + 1 }, (_, i): V => [s.c[0] + Math.cos((i / n) * Math.PI * 2) * s.r[0], s.c[1] + Math.sin((i / n) * Math.PI * 2) * s.r[1]])]
}

export function shapesBounds(shapes: GuideShape[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const s of shapes) for (const pl of shapeToPolylines(s)) for (const [x, y] of pl) {
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  return { x0, y0, x1, y1 }
}
