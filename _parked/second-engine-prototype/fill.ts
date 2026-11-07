import type { Rect } from './types'
import { ctx2d, hexToRgb, makeCanvas } from './util'

/** Scanline flood fill. Returns a mask over the whole image and its bounds, or null when nothing matched. */
function floodMask(img: ImageData, sx: number, sy: number, tol: number): { mask: Uint8Array; bounds: Rect } | null {
  const { width: w, height: h, data } = img
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null
  const mask = new Uint8Array(w * h)
  const si = (sy * w + sx) * 4
  const tr = data[si], tg = data[si + 1], tb = data[si + 2], ta = data[si + 3]
  const match = (i: number): boolean =>
    Math.abs(data[i] - tr) <= tol && Math.abs(data[i + 1] - tg) <= tol &&
    Math.abs(data[i + 2] - tb) <= tol && Math.abs(data[i + 3] - ta) <= tol
  let minX = sx, maxX = sx, minY = sy, maxY = sy
  const stack: number[] = [sx, sy]
  while (stack.length) {
    const y = stack.pop()!
    let x = stack.pop()!
    while (x >= 0 && !mask[y * w + x] && match((y * w + x) * 4)) x--
    x++
    let up = false
    let down = false
    while (x < w && !mask[y * w + x] && match((y * w + x) * 4)) {
      mask[y * w + x] = 1
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (y > 0) {
        const m = !mask[(y - 1) * w + x] && match(((y - 1) * w + x) * 4)
        if (m && !up) { stack.push(x, y - 1); up = true } else if (!m) up = false
      }
      if (y < h - 1) {
        const m = !mask[(y + 1) * w + x] && match(((y + 1) * w + x) * 4)
        if (m && !down) { stack.push(x, y + 1); down = true } else if (!m) down = false
      }
      x++
    }
  }
  return { mask, bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } }
}

/**
 * Bucket fill. Reads colour boundaries from `source` (the active layer, or a flattened frame) and paints
 * the matching region onto `target`. The region is grown by `grow` px so fills tuck under anti-aliased lines.
 */
export function bucketFill(
  target: HTMLCanvasElement, source: HTMLCanvasElement, x: number, y: number,
  color: string, tolerance: number, opacity: number, grow = 1,
): Rect | null {
  const w = target.width
  const h = target.height
  const img = ctx2d(source).getImageData(0, 0, w, h)
  const res = floodMask(img, Math.floor(x), Math.floor(y), tolerance)
  if (!res) return null
  let { mask } = res
  const b = { ...res.bounds }
  for (let g = 0; g < grow; g++) {
    const next = mask.slice()
    const x0 = Math.max(0, b.x - 1), x1 = Math.min(w - 1, b.x + b.w)
    const y0 = Math.max(0, b.y - 1), y1 = Math.min(h - 1, b.y + b.h)
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        const i = yy * w + xx
        if (mask[i]) continue
        if ((xx > 0 && mask[i - 1]) || (xx < w - 1 && mask[i + 1]) || (yy > 0 && mask[i - w]) || (yy < h - 1 && mask[i + w])) next[i] = 1
      }
    }
    mask = next
    b.x = x0; b.y = y0; b.w = x1 - x0 + 1; b.h = y1 - y0 + 1
  }
  const [r, gg, bl] = hexToRgb(color)
  const out = new ImageData(b.w, b.h)
  for (let yy = 0; yy < b.h; yy++) {
    for (let xx = 0; xx < b.w; xx++) {
      if (mask[(yy + b.y) * w + (xx + b.x)]) {
        const o = (yy * b.w + xx) * 4
        out.data[o] = r; out.data[o + 1] = gg; out.data[o + 2] = bl; out.data[o + 3] = 255
      }
    }
  }
  const tmp = makeCanvas(b.w, b.h)
  ctx2d(tmp).putImageData(out, 0, 0)
  const g = ctx2d(target)
  g.save()
  g.globalAlpha = opacity
  g.drawImage(tmp, b.x, b.y)
  g.restore()
  return b
}
