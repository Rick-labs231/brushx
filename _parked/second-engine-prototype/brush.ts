import type { BrushParams, BrushToolId, Rect, Vec } from './types'
import { clamp, ctx2d, makeCanvas, rectUnion } from './util'

export const BRUSH_LABELS: Record<BrushToolId, string> = {
  pencil: 'Pencil', ink: 'Ink pen', brush: 'Brush', airbrush: 'Airbrush',
  marker: 'Marker', chalk: 'Chalk', crayon: 'Crayon', eraser: 'Eraser',
}

export const DEFAULT_BRUSHES: Record<BrushToolId, BrushParams> = {
  pencil: { size: 5, opacity: 0.95, flow: 0.9, hardness: 0.85, spacing: 0.12, stabilizer: 0.15, pressureSize: true, pressureOpacity: true, grain: 0.18 },
  ink: { size: 7, opacity: 1, flow: 1, hardness: 1, spacing: 0.08, stabilizer: 0.5, pressureSize: true, pressureOpacity: false, grain: 0 },
  brush: { size: 24, opacity: 1, flow: 0.55, hardness: 0.55, spacing: 0.1, stabilizer: 0.25, pressureSize: true, pressureOpacity: true, grain: 0 },
  airbrush: { size: 60, opacity: 1, flow: 0.07, hardness: 0, spacing: 0.08, stabilizer: 0.1, pressureSize: false, pressureOpacity: true, grain: 0 },
  marker: { size: 22, opacity: 0.8, flow: 1, hardness: 1, spacing: 0.1, stabilizer: 0.3, pressureSize: false, pressureOpacity: false, grain: 0 },
  chalk: { size: 28, opacity: 1, flow: 0.8, hardness: 0.9, spacing: 0.18, stabilizer: 0.1, pressureSize: true, pressureOpacity: true, grain: 0.65 },
  crayon: { size: 20, opacity: 1, flow: 0.85, hardness: 0.95, spacing: 0.16, stabilizer: 0.1, pressureSize: true, pressureOpacity: true, grain: 0.45 },
  eraser: { size: 30, opacity: 1, flow: 1, hardness: 0.8, spacing: 0.1, stabilizer: 0.2, pressureSize: true, pressureOpacity: false, grain: 0 },
}

export interface StrokePoint extends Vec {
  pressure: number
}

const spriteCache = new Map<string, HTMLCanvasElement[]>()

function buildSprite(size: number, color: string, hardness: number, grain: number): HTMLCanvasElement {
  const d = Math.ceil(size) + 2
  const c = makeCanvas(d, d)
  const g = ctx2d(c)
  const r = size / 2
  const cx = d / 2
  if (hardness >= 0.98) {
    g.fillStyle = color
    g.beginPath()
    g.arc(cx, cx, r, 0, Math.PI * 2)
    g.fill()
  } else {
    const grad = g.createRadialGradient(cx, cx, 0, cx, cx, r)
    const inner = Math.max(0, hardness)
    grad.addColorStop(0, color)
    grad.addColorStop(inner * 0.98, color)
    const [cr, cg, cb] = colorChannels(color)
    grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`)
    g.fillStyle = grad
    g.fillRect(0, 0, d, d)
  }
  if (grain > 0) {
    g.globalCompositeOperation = 'destination-out'
    const dots = Math.round(d * d * grain * 0.35)
    for (let i = 0; i < dots; i++) {
      g.globalAlpha = 0.25 + Math.random() * 0.75
      g.fillRect(Math.random() * d, Math.random() * d, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5)
    }
  }
  return c
}

function colorChannels(color: string): [number, number, number] {
  const h = color.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function getSprite(size: number, color: string, hardness: number, grain: number): HTMLCanvasElement {
  const s = Math.max(1, Math.round(size))
  const hk = Math.round(hardness * 10)
  const key = `${s}|${color}|${hk}|${Math.round(grain * 10)}`
  let list = spriteCache.get(key)
  if (!list) {
    if (spriteCache.size > 400) spriteCache.clear()
    list = Array.from({ length: grain > 0 ? 6 : 1 }, () => buildSprite(s, color, hk / 10, grain))
    spriteCache.set(key, list)
  }
  return list[Math.floor(Math.random() * list.length)]
}

/** One continuous stroke stamped into an off-screen buffer. */
export class BrushStroke {
  private g: CanvasRenderingContext2D
  private params: BrushParams
  private color: string
  private xform: (p: Vec) => Vec
  private p1: StrokePoint | null = null
  private mid: StrokePoint | null = null
  private carry = 0
  private stamped = 0
  bounds: Rect | null = null

  constructor(buf: HTMLCanvasElement, params: BrushParams, color: string, xform: (p: Vec) => Vec = (p) => p) {
    this.g = ctx2d(buf)
    this.params = params
    this.color = color
    this.xform = xform
  }

  private sizeFor(pressure: number): number {
    const p = this.params
    return Math.max(1, p.pressureSize ? p.size * (0.3 + 0.7 * Math.pow(pressure, 0.8)) : p.size)
  }

  private stamp(x: number, y: number, pressure: number): void {
    const p = this.params
    const size = this.sizeFor(pressure)
    const alpha = clamp(p.flow * (p.pressureOpacity ? 0.35 + 0.65 * pressure : 1), 0.01, 1)
    const t = this.xform({ x, y })
    const sp = getSprite(size, this.color, p.hardness, p.grain)
    this.g.globalAlpha = alpha
    this.g.drawImage(sp, t.x - sp.width / 2, t.y - sp.height / 2)
    this.stamped++
    const r = size / 2 + 2
    this.bounds = rectUnion(this.bounds, { x: t.x - r, y: t.y - r, w: r * 2, h: r * 2 })
  }

  private walk(a: StrokePoint, c: StrokePoint, b: StrokePoint): void {
    const len = Math.hypot(c.x - a.x, c.y - a.y) + Math.hypot(b.x - c.x, b.y - c.y)
    const steps = Math.max(1, Math.ceil(len / 1.5))
    let prev: StrokePoint = a
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const u = 1 - t
      const pt: StrokePoint = {
        x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
        y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
        pressure: u * a.pressure + t * b.pressure,
      }
      let seg = Math.hypot(pt.x - prev.x, pt.y - prev.y)
      const spacing = Math.max(0.6, this.sizeFor(pt.pressure) * this.params.spacing)
      let from = prev
      while (this.carry + seg >= spacing) {
        const need = spacing - this.carry
        const f = seg === 0 ? 0 : need / seg
        const sx = from.x + (pt.x - from.x) * f
        const sy = from.y + (pt.y - from.y) * f
        this.stamp(sx, sy, from.pressure + (pt.pressure - from.pressure) * f)
        from = { x: sx, y: sy, pressure: from.pressure + (pt.pressure - from.pressure) * f }
        seg -= need
        this.carry = 0
      }
      this.carry += seg
      prev = pt
    }
  }

  add(p: StrokePoint): void {
    if (!this.p1) {
      this.p1 = p
      this.mid = p
      this.stamp(p.x, p.y, p.pressure)
      return
    }
    const mid: StrokePoint = { x: (this.p1.x + p.x) / 2, y: (this.p1.y + p.y) / 2, pressure: (this.p1.pressure + p.pressure) / 2 }
    this.walk(this.mid!, this.p1, mid)
    this.mid = mid
    this.p1 = p
  }

  end(): void {
    if (this.p1 && this.mid) this.walk(this.mid, this.p1, this.p1)
    if (this.stamped === 0 && this.p1) this.stamp(this.p1.x, this.p1.y, this.p1.pressure)
    this.g.globalAlpha = 1
  }
}

export type SymmetryMode = 'off' | 'vertical' | 'horizontal' | 'quad'

export function symmetryTransforms(mode: SymmetryMode, w: number, h: number): ((p: Vec) => Vec)[] {
  const id = (p: Vec) => p
  const mx = (p: Vec) => ({ x: w - p.x, y: p.y })
  const my = (p: Vec) => ({ x: p.x, y: h - p.y })
  const mxy = (p: Vec) => ({ x: w - p.x, y: h - p.y })
  switch (mode) {
    case 'vertical': return [id, mx]
    case 'horizontal': return [id, my]
    case 'quad': return [id, mx, my, mxy]
    default: return [id]
  }
}

/** Composite a stroke buffer onto a cel (or erase with it). */
export function commitBuffer(target: HTMLCanvasElement, buf: HTMLCanvasElement, opacity: number, erase: boolean): void {
  const g = ctx2d(target)
  g.save()
  g.globalAlpha = opacity
  g.globalCompositeOperation = erase ? 'destination-out' : 'source-over'
  g.drawImage(buf, 0, 0)
  g.restore()
}
