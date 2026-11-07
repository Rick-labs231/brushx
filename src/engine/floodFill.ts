import type { Rect } from './types.ts'

export interface FloodResult {
  mask: Uint8Array
  bounds: Rect
}

/**
 * Scanline flood fill over RGBA pixels. Pure (no canvas) so it is unit-testable
 * and portable. `tol` is the max per-channel difference (0-255) to still count
 * as the same region. Fully transparent pixels always match each other.
 */
export function floodMask(data: Uint8ClampedArray, w: number, h: number, sx: number, sy: number, tol: number): FloodResult | null {
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null
  const mask = new Uint8Array(w * h)
  const o0 = (sy * w + sx) * 4
  const tr = data[o0]
  const tg = data[o0 + 1]
  const tb = data[o0 + 2]
  const ta = data[o0 + 3]

  const match = (i: number) => {
    const o = i * 4
    const a = data[o + 3]
    if (ta === 0 && a === 0) return true
    return Math.abs(data[o] - tr) <= tol && Math.abs(data[o + 1] - tg) <= tol && Math.abs(data[o + 2] - tb) <= tol && Math.abs(a - ta) <= tol
  }

  let x0 = sx
  let x1 = sx
  let y0 = sy
  let y1 = sy
  const stack: number[] = [sx, sy]
  while (stack.length) {
    const y = stack.pop() as number
    let x = stack.pop() as number
    let i = y * w + x
    if (mask[i] || !match(i)) continue
    // walk left
    while (x > 0 && !mask[i - 1] && match(i - 1)) {
      x -= 1
      i -= 1
    }
    let spanUp = false
    let spanDown = false
    while (x < w && !mask[i] && match(i)) {
      mask[i] = 1
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
      if (y > 0) {
        const up = match(i - w) && !mask[i - w]
        if (up && !spanUp) {
          stack.push(x, y - 1)
          spanUp = true
        } else if (!up) spanUp = false
      }
      if (y < h - 1) {
        const down = match(i + w) && !mask[i + w]
        if (down && !spanDown) {
          stack.push(x, y + 1)
          spanDown = true
        } else if (!down) spanDown = false
      }
      x += 1
      i += 1
    }
  }
  return { mask, bounds: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } }
}

/**
 * Grows the mask by `r` pixels (4-neighbourhood) so the fill tucks under
 * anti-aliased line edges instead of leaving a pale halo.
 */
export function dilateMask(res: FloodResult, w: number, h: number, r = 1): FloodResult {
  let cur = res.mask
  let b = res.bounds
  for (let step = 0; step < r; step += 1) {
    const next = new Uint8Array(cur)
    const bx0 = Math.max(0, b.x - 1)
    const by0 = Math.max(0, b.y - 1)
    const bx1 = Math.min(w - 1, b.x + b.w)
    const by1 = Math.min(h - 1, b.y + b.h)
    for (let y = by0; y <= by1; y += 1) {
      for (let x = bx0; x <= bx1; x += 1) {
        const i = y * w + x
        if (cur[i]) continue
        if ((x > 0 && cur[i - 1]) || (x < w - 1 && cur[i + 1]) || (y > 0 && cur[i - w]) || (y < h - 1 && cur[i + w])) next[i] = 1
      }
    }
    cur = next
    b = { x: bx0, y: by0, w: bx1 - bx0 + 1, h: by1 - by0 + 1 }
  }
  return { mask: cur, bounds: b }
}

/** Paints the masked area into a tightly cropped RGBA buffer. */
export function maskToRgba(res: FloodResult, w: number, rgb: [number, number, number]): Uint8ClampedArray {
  const { bounds: b, mask } = res
  const out = new Uint8ClampedArray(b.w * b.h * 4)
  for (let y = 0; y < b.h; y += 1) {
    for (let x = 0; x < b.w; x += 1) {
      if (!mask[(b.y + y) * w + (b.x + x)]) continue
      const o = (y * b.w + x) * 4
      out[o] = rgb[0]
      out[o + 1] = rgb[1]
      out[o + 2] = rgb[2]
      out[o + 3] = 255
    }
  }
  return out
}
