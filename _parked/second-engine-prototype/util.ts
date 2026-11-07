import type { Rect, Vec, View } from './types'

export const uid = (): string =>
  Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y)
export const deg = (r: number): number => (r * 180) / Math.PI
export const rad = (d: number): number => (d * Math.PI) / 180
export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  return c.getContext('2d')!
}

export function rectUnion(a: Rect | null, b: Rect): Rect {
  if (!a) return b
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
}

export function clampRect(r: Rect, w: number, h: number): Rect {
  const x = clamp(Math.floor(r.x), 0, w)
  const y = clamp(Math.floor(r.y), 0, h)
  const x2 = clamp(Math.ceil(r.x + r.w), 0, w)
  const y2 = clamp(Math.ceil(r.y + r.h), 0, h)
  return { x, y, w: Math.max(0, x2 - x), h: Math.max(0, y2 - y) }
}

export function worldToScreen(v: View, p: Vec): Vec {
  const c = Math.cos(v.rot)
  const s = Math.sin(v.rot)
  return { x: v.x + v.zoom * (c * p.x - s * p.y), y: v.y + v.zoom * (s * p.x + c * p.y) }
}

export function screenToWorld(v: View, p: Vec): Vec {
  const c = Math.cos(v.rot)
  const s = Math.sin(v.rot)
  const dx = p.x - v.x
  const dy = p.y - v.y
  return { x: (c * dx + s * dy) / v.zoom, y: (-s * dx + c * dy) / v.zoom }
}

/** Zoom keeping the world point under `screen` fixed. */
export function zoomAt(v: View, screen: Vec, zoom: number): View {
  const z = clamp(zoom, 0.05, 32)
  const w = screenToWorld(v, screen)
  const c = Math.cos(v.rot)
  const s = Math.sin(v.rot)
  return { ...v, zoom: z, x: screen.x - z * (c * w.x - s * w.y), y: screen.y - z * (s * w.x + c * w.y) }
}

export function rotateAt(v: View, screen: Vec, rot: number): View {
  const w = screenToWorld(v, screen)
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  return { ...v, rot, x: screen.x - v.zoom * (c * w.x - s * w.y), y: screen.y - v.zoom * (s * w.x + c * w.y) }
}

export function fitView(cw: number, ch: number, pw: number, ph: number, pad = 0.9): View {
  const zoom = clamp(Math.min((cw * pad) / pw, (ch * pad) / ph), 0.05, 8)
  return { zoom, rot: 0, x: (cw - pw * zoom) / 2, y: (ch - ph * zoom) / 2 }
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function canvasToBlob(c: HTMLCanvasElement, type = 'image/png', q?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), type, q),
  )
}

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h.padEnd(6, '0').slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export const rgbToHex = (r: number, g: number, b: number): string =>
  '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'brushx'
}
