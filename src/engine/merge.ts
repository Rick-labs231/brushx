import { uid } from './ids.ts'
import { celOf, needsRasterMerge } from './projectOps.ts'
import { getCel, makeCanvas } from './render.ts'
import type { Bitmap, Project, Stroke } from './types.ts'

/** Pixels of one cel, cropped to the painted area. Null when fully transparent. */
export function rasterizeCel(strokes: Stroke[], w: number, h: number): Bitmap | null {
  const cel = getCel(strokes, w, h)
  if (!cel) return null
  const img = (cel.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, w, h)
  let x0 = w
  let y0 = h
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (img.data[(y * w + x) * 4 + 3] === 0) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  if (x1 < 0) return null
  const bw = x1 - x0 + 1
  const bh = y1 - y0 + 1
  const crop = makeCanvas(bw, bh)
  const cctx = crop.getContext('2d') as CanvasRenderingContext2D
  cctx.putImageData(img, -x0, -y0, x0, y0, bw, bh)
  const data = cctx.getImageData(0, 0, bw, bh).data
  return { x: x0, y: y0, w: bw, h: bh, data: new Uint8ClampedArray(data) }
}

/**
 * Merges a layer into the one below it, in every frame. If the upper layer
 * only has plain paint it is appended as editable strokes; if it contains
 * erasers or fills (which depend on the pixels beneath them) it is baked to a
 * bitmap first so the result looks identical.
 */
export function mergeDown(p: Project, layerId: string): Project {
  const idx = p.layers.findIndex((l) => l.id === layerId)
  if (idx <= 0) return p
  const upper = p.layers[idx]
  const lower = p.layers[idx - 1]
  const ratio = lower.opacity > 0 ? Math.min(1, upper.opacity / lower.opacity) : 1

  const frames = p.frames.map((f) => {
    const up = celOf(f, upper.id)
    const { [upper.id]: _removed, ...rest } = f.cels
    void _removed
    if (up.length === 0) return { ...f, cels: rest }
    let add: Stroke[]
    if (needsRasterMerge(up)) {
      const bm = rasterizeCel(up, p.width, p.height)
      add = bm
        ? [{ id: uid(), tool: 'bitmap', color: '#000000', size: 1, opacity: ratio, hardness: 1, spacing: 1, flow: 1, grain: 0, pressure: 0, taper: false, seed: 0, points: [], closed: false, shapeFill: 'none', tolerance: 0, bitmap: bm } satisfies Stroke]
        : []
    } else {
      add = up.map((s) => ({ ...s, opacity: s.opacity * ratio }))
    }
    return { ...f, cels: { ...rest, [lower.id]: [...celOf(f, lower.id), ...add] } }
  })
  return { ...p, layers: p.layers.filter((l) => l.id !== upper.id), frames, updatedAt: Date.now() }
}
