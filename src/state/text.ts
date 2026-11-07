// Text tool: renders the text to pixels and places it as a movable bitmap stroke.
import { bitmapStroke } from '../engine/media.ts'
import { commitStrokes } from './actions.ts'
import { store } from './app.ts'
import { toast } from './toast.ts'

export interface TextOptions { font: string; size: number; bold: boolean; italic: boolean; align: 'left' | 'center' | 'right' }

export const FONTS: { id: string; label: string; css: string }[] = [
  { id: 'sans', label: 'Sans', css: 'Inter, system-ui, Arial, sans-serif' },
  { id: 'serif', label: 'Serif', css: 'Georgia, "Times New Roman", serif' },
  { id: 'mono', label: 'Mono', css: '"Courier New", monospace' },
  { id: 'hand', label: 'Handwritten', css: '"Comic Sans MS", "Segoe Print", cursive' },
  { id: 'impact', label: 'Bold poster', css: 'Impact, "Arial Black", sans-serif' },
]

export const textPrefs: TextOptions = { font: 'sans', size: 64, bold: true, italic: false, align: 'left' }

export const fontCss = (o: TextOptions) => `${o.italic ? 'italic ' : ''}${o.bold ? 'bold ' : ''}${Math.round(o.size)}px ${FONTS.find((f) => f.id === o.font)?.css ?? FONTS[0].css}`

export interface TextBitmap { w: number; h: number; data: Uint8ClampedArray }

/** Draws the text; the returned pixels are tightly boxed with a small margin. */
export function renderText(text: string, o: TextOptions, color: string): TextBitmap | null {
  const lines = text.split('\n')
  if (lines.every((l) => l.trim() === '')) return null
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
  ctx.font = fontCss(o)
  const lh = Math.round(o.size * 1.25)
  const pad = Math.ceil(o.size * 0.15) + 2
  const width = Math.max(...lines.map((l) => ctx.measureText(l).width))
  const w = Math.max(4, Math.min(4096, Math.ceil(width) + pad * 2))
  const h = Math.max(4, Math.min(4096, lh * lines.length + pad * 2))
  c.width = w
  c.height = h
  const g = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
  g.font = fontCss(o)
  g.fillStyle = color
  g.textBaseline = 'top'
  g.textAlign = o.align
  const x = o.align === 'left' ? pad : o.align === 'center' ? w / 2 : w - pad
  lines.forEach((l, i) => g.fillText(l, x, pad + i * lh + (lh - o.size) / 2))
  return { w, h, data: new Uint8ClampedArray(g.getImageData(0, 0, w, h).data) }
}

export function placeText(text: string, o: TextOptions): boolean {
  const s = store.getState()
  if (!s.project || !s.textAt) return false
  const bm = renderText(text, o, s.color)
  if (!bm) {
    toast('Type something first.', 'info')
    return false
  }
  commitStrokes([bitmapStroke(bm.data, bm.w, bm.h, { x: Math.round(s.textAt.x), y: Math.round(s.textAt.y), w: bm.w, h: bm.h })])
  toast('Text added. Use the Select tool to move it. Undo and retype to change it.', 'success')
  return true
}
