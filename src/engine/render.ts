import { cameraAt, cameraMatrix } from './camera.ts'
import { hexToRgb, rgba } from './color.ts'
import { dilateMask, floodMask, maskToRgba } from './floodFill.ts'
import { clamp, lerp, mulberry32, padRect, pointsBounds, sampleDabs } from './geometry.ts'
import type { Frame, Layer, Project, Stroke } from './types.ts'

type Canvas2D = CanvasRenderingContext2D

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

// ---------------------------------------------------------------- brush tips

const tipCache = new Map<string, HTMLCanvasElement>()

/** A pre-rendered soft round brush tip, tinted with the brush colour. */
function brushTip(color: string, hardness: number): HTMLCanvasElement {
  const hq = Math.round(clamp(hardness, 0, 1) * 20) / 20
  const key = `${color}|${hq}`
  const hit = tipCache.get(key)
  if (hit) return hit
  const size = 96
  const c = makeCanvas(size, size)
  const ctx = c.getContext('2d') as Canvas2D
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, rgba(color, 1))
  g.addColorStop(Math.min(0.98, hq), rgba(color, 1))
  g.addColorStop(Math.min(0.99, hq + (1 - hq) * 0.55), rgba(color, 0.35))
  g.addColorStop(1, rgba(color, 0))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  if (tipCache.size > 200) tipCache.clear()
  tipCache.set(key, c)
  return c
}

function stamp(ctx: Canvas2D, color: string, hardness: number, x: number, y: number, diameter: number, alpha: number) {
  if (diameter < 0.2 || alpha <= 0) return
  ctx.globalAlpha = alpha
  if (hardness >= 0.97) {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, diameter / 2, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.drawImage(brushTip(color, hardness), x - diameter / 2, y - diameter / 2, diameter, diameter)
  }
}

// ----------------------------------------------------------------- dab tools

function dabDiameter(s: Stroke, p: number, d: number, length: number) {
  let size = s.size * lerp(1, Math.max(0.12, p), s.pressure)
  if (s.taper && length > 0) {
    const t = s.size * 2.2
    const ease = (v: number) => v * v * (3 - 2 * v)
    size *= lerp(0.18, 1, ease(clamp(d / t, 0, 1)))
    size *= lerp(0.12, 1, ease(clamp((length - d) / t, 0, 1)))
  }
  return Math.max(0.6, size)
}

function drawDabs(ctx: Canvas2D, s: Stroke, color: string, erase: boolean) {
  const step = Math.max(0.6, s.size * s.spacing)
  const { dabs, length } = sampleDabs(s.points, step)
  const rng = mulberry32(s.seed)
  const scatter = s.tool === 'chalk' || s.tool === 'crayon'
  const flowAlpha = s.tool === 'airbrush' ? s.flow * s.opacity : s.flow
  for (let i = 0; i < dabs.length; i += 1) {
    const dab = dabs[i]
    const dia = dabDiameter(s, dab.p, dab.d, length)
    if (scatter) {
      const r = dia / 2
      stamp(ctx, color, s.hardness, dab.x, dab.y, dia, 0.28 * flowAlpha)
      const grains = Math.round(3 + s.grain * 5)
      for (let g = 0; g < grains; g += 1) {
        const ang = rng() * Math.PI * 2
        const rad = Math.sqrt(rng()) * r * 0.92
        const gd = dia * (0.12 + rng() * 0.28)
        stamp(ctx, color, 0.9, dab.x + Math.cos(ang) * rad, dab.y + Math.sin(ang) * rad, gd, (0.3 + rng() * 0.7) * flowAlpha)
      }
    } else {
      let alpha = erase ? s.opacity * s.flow : flowAlpha
      if (s.tool === 'pencil') alpha *= 0.8 + 0.2 * rng() * s.grain + 0.2 * (1 - s.grain)
      if (s.pressure > 0 && s.tool !== 'ink') alpha *= lerp(1, Math.max(0.25, dab.p), s.pressure * 0.5)
      stamp(ctx, color, s.hardness, dab.x, dab.y, dia, clamp(alpha, 0, 1))
    }
  }
}

function renderDabStroke(ctx: Canvas2D, s: Stroke) {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (s.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out'
    drawDabs(ctx, s, '#000000', true)
    ctx.restore()
    return
  }
  const direct = s.opacity >= 0.995 || s.tool === 'airbrush'
  if (direct) {
    drawDabs(ctx, s, s.color, false)
    ctx.restore()
    return
  }
  // Stroke-level opacity: paint at full strength on a scratch canvas, then
  // composite once, so overlapping dabs don't darken the stroke.
  const b = padRect(pointsBounds(s.points), s.size * 0.75 + 4)
  const bx = Math.floor(b.x)
  const by = Math.floor(b.y)
  const scratch = makeCanvas(Math.ceil(b.w) + 2, Math.ceil(b.h) + 2)
  const sctx = scratch.getContext('2d') as Canvas2D
  sctx.translate(-bx, -by)
  drawDabs(sctx, { ...s, opacity: 1 }, s.color, false)
  ctx.globalAlpha = s.opacity
  ctx.drawImage(scratch, bx, by)
  ctx.restore()
}

// -------------------------------------------------------- marker and shapes

function tracePolyline(ctx: Canvas2D, s: Stroke, smooth: boolean) {
  const pts = s.points
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  if (smooth && pts.length > 2) {
    for (let i = 1; i < pts.length - 1; i += 1) {
      const mx = (pts[i].x + pts[i + 1].x) / 2
      const my = (pts[i].y + pts[i + 1].y) / 2
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my)
    }
    const last = pts[pts.length - 1]
    ctx.lineTo(last.x, last.y)
  } else {
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y)
  }
  if (s.closed && pts.length > 2) ctx.closePath()
}

function renderPathStroke(ctx: Canvas2D, s: Stroke) {
  if (s.points.length === 0) return
  ctx.save()
  ctx.globalAlpha = s.opacity
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = s.size
  ctx.strokeStyle = s.color
  ctx.fillStyle = s.color
  if (s.points.length === 1) {
    ctx.beginPath()
    ctx.arc(s.points[0].x, s.points[0].y, s.size / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    return
  }
  tracePolyline(ctx, s, s.tool === 'marker')
  if (s.tool !== 'marker' && s.shapeFill !== 'none' && s.points.length > 2) ctx.fill()
  if (s.tool === 'marker' || s.shapeFill !== 'fill' || s.points.length <= 2) ctx.stroke()
  ctx.restore()
}

// ------------------------------------------------------------ fill & bitmap

function renderFill(ctx: Canvas2D, s: Stroke) {
  const p = s.points[0]
  if (!p) return
  const w = ctx.canvas.width
  const h = ctx.canvas.height
  const img = ctx.getImageData(0, 0, w, h)
  const res = floodMask(img.data, w, h, Math.round(p.x), Math.round(p.y), s.tolerance)
  if (!res) return
  const grown = dilateMask(res, w, h, 1)
  const rgba8 = maskToRgba(grown, w, hexToRgb(s.color))
  const b = grown.bounds
  const tmp = makeCanvas(b.w, b.h)
  const tctx = tmp.getContext('2d') as Canvas2D
  tctx.putImageData(new ImageData(rgba8 as Uint8ClampedArray<ArrayBuffer>, b.w, b.h), 0, 0)
  ctx.save()
  ctx.globalAlpha = s.opacity
  ctx.drawImage(tmp, b.x, b.y)
  ctx.restore()
}

const bitmapCache = new WeakMap<Stroke, HTMLCanvasElement>()

function renderBitmap(ctx: Canvas2D, s: Stroke) {
  const bm = s.bitmap
  if (!bm) return
  let c = bitmapCache.get(s)
  if (!c) {
    c = makeCanvas(bm.w, bm.h)
    ;(c.getContext('2d') as Canvas2D).putImageData(new ImageData(bm.data as Uint8ClampedArray<ArrayBuffer>, bm.w, bm.h), 0, 0)
    bitmapCache.set(s, c)
  }
  ctx.save()
  ctx.globalAlpha = s.opacity
  if (bm.dw !== undefined && bm.dh !== undefined) {
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(c, bm.x, bm.y, bm.dw, bm.dh)
  } else ctx.drawImage(c, bm.x, bm.y)
  ctx.restore()
}

export function renderStroke(ctx: Canvas2D, s: Stroke) {
  switch (s.tool) {
    case 'fill':
      return renderFill(ctx, s)
    case 'bitmap':
      return renderBitmap(ctx, s)
    case 'marker':
    case 'line':
    case 'rect':
    case 'ellipse':
    case 'polygon':
      return renderPathStroke(ctx, s)
    default:
      if (s.points.length) renderDabStroke(ctx, s)
  }
}

// ---------------------------------------------------------------- cel cache

interface CelEntry {
  canvas: HTMLCanvasElement
  bytes: number
}

const celCache = new Map<Stroke[], CelEntry>()
const lineage = new WeakMap<Stroke[], { parent: Stroke[]; added: Stroke[] }>()
const MAX_CEL_BYTES = 192 * 1024 * 1024
let celBytes = 0

/**
 * Returns a new cel array with `added` appended, remembering where it came
 * from so the cache can reuse the parent's pixels instead of replaying all.
 */
export function deriveCel(parent: Stroke[], added: Stroke[]): Stroke[] {
  const next = [...parent, ...added]
  lineage.set(next, { parent, added })
  return next
}

/** Rasterised pixels for one layer of one frame, or null when empty. */
export function getCel(strokes: Stroke[], w: number, h: number): HTMLCanvasElement | null {
  if (strokes.length === 0) return null
  const hit = celCache.get(strokes)
  if (hit && hit.canvas.width === w && hit.canvas.height === h) {
    celCache.delete(strokes)
    celCache.set(strokes, hit)
    return hit.canvas
  }
  if (hit) {
    celBytes -= hit.bytes
    celCache.delete(strokes)
  }
  const canvas = makeCanvas(w, h)
  const ctx = canvas.getContext('2d') as Canvas2D
  const lin = lineage.get(strokes)
  const parentEntry = lin ? celCache.get(lin.parent) : undefined
  if (lin && parentEntry && parentEntry.canvas.width === w && parentEntry.canvas.height === h) {
    ctx.drawImage(parentEntry.canvas, 0, 0)
    for (const s of lin.added) renderStroke(ctx, s)
  } else if (lin && lin.parent.length === 0) {
    for (const s of lin.added) renderStroke(ctx, s)
  } else {
    for (const s of strokes) renderStroke(ctx, s)
  }
  const bytes = w * h * 4
  celCache.set(strokes, { canvas, bytes })
  celBytes += bytes
  for (const [key, entry] of celCache) {
    if (celBytes <= MAX_CEL_BYTES || celCache.size <= 4) break
    if (key === strokes) continue
    celBytes -= entry.bytes
    celCache.delete(key)
  }
  return canvas
}

// ---------------------------------------------------------- frame composite

// Keyed by frame id (not object) so undo history never pins old full-size
// canvases in memory: only the latest flat per frame is kept.
const flatCache = new Map<string, { frame: Frame; key: string; canvas: HTMLCanvasElement }>()

function layersKey(project: Project) {
  return `${project.width}x${project.height}|${project.layers.map((l) => `${l.id}:${l.visible ? 1 : 0}:${l.opacity}:${l.base?.[0]?.id ?? ''}`).join(',')}`
}

/** All visible layers of a frame flattened onto a transparent canvas. */
export function flattenFrame(project: Project, frame: Frame, final = false): HTMLCanvasElement {
  const key = layersKey(project) + (final ? '|final' : '')
  const cacheId = final ? `${frame.id}:final` : frame.id
  const hit = flatCache.get(cacheId)
  if (hit && hit.frame === frame && hit.key === key) return hit.canvas
  const canvas = makeCanvas(project.width, project.height)
  const ctx = canvas.getContext('2d') as Canvas2D
  drawLayers(ctx, final ? project.layers.filter((l) => !l.guide) : project.layers, frame, project.width, project.height)
  flatCache.delete(cacheId)
  flatCache.set(cacheId, { frame, key, canvas })
  if (flatCache.size > 48) {
    const oldest = flatCache.keys().next().value
    if (oldest !== undefined) flatCache.delete(oldest)
  }
  return canvas
}

export function drawLayers(ctx: Canvas2D, layers: Layer[], frame: Frame, w: number, h: number) {
  for (const layer of layers) {
    if (!layer.visible) continue
    ctx.globalAlpha = layer.opacity
    const base = layer.base?.length ? getCel(layer.base, w, h) : null
    if (base) ctx.drawImage(base, 0, 0)
    const cel = getCel(frame.cels[layer.id] ?? [], w, h)
    if (!cel) continue
    ctx.drawImage(cel, 0, 0)
  }
  ctx.globalAlpha = 1
}

const tintCache = new WeakMap<HTMLCanvasElement, Map<string, HTMLCanvasElement>>()

/** Onion-skin helper: a flat canvas recoloured to a single tint. */
export function tinted(source: HTMLCanvasElement, color: string): HTMLCanvasElement {
  let byColor = tintCache.get(source)
  if (!byColor) {
    byColor = new Map()
    tintCache.set(source, byColor)
  }
  const hit = byColor.get(color)
  if (hit) return hit
  const out = makeCanvas(source.width, source.height)
  const ctx = out.getContext('2d') as Canvas2D
  ctx.drawImage(source, 0, 0)
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, out.width, out.height)
  byColor.set(color, out)
  return out
}

export interface ExportOptions {
  scale: number
  transparent: boolean
}

/** Final artwork only: background + visible layers. No guides or onion skin. */
export function renderFinalFrame(project: Project, frame: Frame, opts: ExportOptions): HTMLCanvasElement {
  const out = makeCanvas(project.width * opts.scale, project.height * opts.scale)
  const ctx = out.getContext('2d') as Canvas2D
  ctx.imageSmoothingQuality = 'high'
  if (!opts.transparent && project.background) {
    ctx.fillStyle = project.background
    ctx.fillRect(0, 0, out.width, out.height)
  } else if (!opts.transparent) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, out.width, out.height)
  }
  const art = flattenFrame(project, frame, true)
  const keys = project.camera?.length ? project.frames.indexOf(frame) : -1
  if (keys >= 0) {
    // seen through the camera: same canvas size, moved/zoomed/rotated
    const m = cameraMatrix(project, cameraAt(project, keys))
    ctx.save()
    ctx.scale(opts.scale, opts.scale)
    ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f)
    ctx.drawImage(art, 0, 0)
    ctx.restore()
  } else {
    ctx.drawImage(art, 0, 0, out.width, out.height)
  }
  return out
}

/** Colour of the finished artwork at one pixel (background included). */
export function sampleFrameColor(project: Project, frame: Frame, x: number, y: number): string | null {
  const px = Math.floor(x)
  const py = Math.floor(y)
  if (px < 0 || py < 0 || px >= project.width || py >= project.height) return null
  const c = makeCanvas(1, 1)
  const ctx = c.getContext('2d', { willReadFrequently: true }) as Canvas2D
  ctx.fillStyle = project.background ?? '#ffffff'
  ctx.fillRect(0, 0, 1, 1)
  ctx.drawImage(flattenFrame(project, frame, true), px, py, 1, 1, 0, 0, 1, 1)
  const d = ctx.getImageData(0, 0, 1, 1).data
  return `#${[d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}
