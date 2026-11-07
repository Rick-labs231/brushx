// Curve (bezier) pen. Each anchor has a point and a handle; the outgoing
// handle is (x + hx, y + hy) and the incoming one is its mirror, so dragging
// while placing a point gives a smooth curve through it.
import type { Pt } from './types.ts'

export interface Anchor { x: number; y: number; hx: number; hy: number }

const STEPS = 24

function cubic(a: number, b: number, c: number, d: number, t: number) {
  const u = 1 - t
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d
}

/** Samples the whole path into a polyline. */
export function flattenBezier(anchors: Anchor[], closed: boolean): Pt[] {
  const out: Pt[] = []
  if (anchors.length === 0) return out
  if (anchors.length === 1) return [{ x: anchors[0].x, y: anchors[0].y, p: 1 }]
  const count = closed ? anchors.length : anchors.length - 1
  for (let i = 0; i < count; i += 1) {
    const a = anchors[i]
    const b = anchors[(i + 1) % anchors.length]
    const straight = a.hx === 0 && a.hy === 0 && b.hx === 0 && b.hy === 0
    const steps = straight ? 1 : STEPS
    for (let s = i === 0 ? 0 : 1; s <= steps; s += 1) {
      const t = s / steps
      out.push({
        x: cubic(a.x, a.x + a.hx, b.x - b.hx, b.x, t),
        y: cubic(a.y, a.y + a.hy, b.y - b.hy, b.y, t),
        p: 1,
      })
    }
  }
  return out
}
