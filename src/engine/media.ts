// Imported pictures and video clips. They are ordinary bitmap strokes, so
// undo, select/move, export, saving and cloud sync all just work.
import { uid } from './ids.ts'
import { createFrame, createLayer } from './projectOps.ts'
import type { Frame, Layer, Project, Stroke } from './types.ts'

const touch = (p: Project): Project => ({ ...p, updatedAt: Date.now() })

export const MAX_CLIP_FRAMES = 240
/** Pixel budget for one imported clip (RGBA bytes) so saving stays quick. */
export const CLIP_BYTE_BUDGET = 56 * 1024 * 1024
export const MAX_PICTURE_SIDE = 2048

export interface Place { x: number; y: number; w: number; h: number }

/** Largest rectangle of the source's shape that fits the canvas, centred. */
export function containRect(srcW: number, srcH: number, dstW: number, dstH: number): Place {
  const k = Math.min(dstW / srcW, dstH / srcH)
  const w = srcW * k
  const h = srcH * k
  return { x: (dstW - w) / 2, y: (dstH - h) / 2, w, h }
}

export interface ClipPlan {
  count: number
  /** where the clip sits on the canvas */
  place: Place
  /** pixel size actually stored per frame */
  px: { w: number; h: number }
}

/** How many frames to grab and at what stored resolution. */
export function planClip(duration: number, fps: number, srcW: number, srcH: number, canvasW: number, canvasH: number): ClipPlan {
  const count = Math.max(1, Math.min(MAX_CLIP_FRAMES, Math.ceil(duration * fps - 1e-6)))
  const place = containRect(srcW, srcH, canvasW, canvasH)
  // never store more pixels than the canvas shows, nor more than the budget
  let k = Math.min(1, Math.sqrt(CLIP_BYTE_BUDGET / (count * 4 * place.w * place.h)))
  k = Math.min(k, srcW / place.w, srcH / place.h, 1)
  return { count, place, px: { w: Math.max(2, Math.round(place.w * k)), h: Math.max(2, Math.round(place.h * k)) } }
}

export function bitmapStroke(data: Uint8ClampedArray, w: number, h: number, place: Place, opacity = 1): Stroke {
  return { id: uid(), tool: 'bitmap', color: '#000000', size: 1, opacity, hardness: 1, spacing: 1, flow: 1, grain: 0, pressure: 0, taper: false, seed: 0, points: [], closed: false, shapeFill: 'none', tolerance: 0, bitmap: { x: place.x, y: place.y, w, h, data, dw: place.w, dh: place.h } }
}

/**
 * A layer for imported media at the bottom of the stack. `reference` layers
 * are guides: visible while drawing, never exported.
 */
export function addMediaLayer(p: Project, name: string, reference: boolean, base?: Stroke[]): { project: Project; layerId: string } {
  const layer: Layer = { ...createLayer(name), ...(base ? { base } : {}), ...(reference ? { guide: true, opacity: 0.55, locked: true } : {}) }
  return { project: touch({ ...p, layers: [layer, ...p.layers] }), layerId: layer.id }
}

/**
 * Puts one stroke on each frame from `startIndex` on. Missing frames are
 * added when `extend` is set, otherwise the extra pictures are dropped.
 */
export function placeOnFrames(p: Project, layerId: string, startIndex: number, strokes: Stroke[], extend: boolean): { project: Project; placed: number } {
  const frames: Frame[] = [...p.frames]
  const start = Math.max(0, Math.min(startIndex, frames.length - 1))
  while (extend && frames.length < start + strokes.length) frames.push(createFrame())
  let placed = 0
  for (let i = 0; i < strokes.length && start + i < frames.length; i += 1) {
    const f = frames[start + i]
    frames[start + i] = { ...f, cels: { ...f.cels, [layerId]: [strokes[i]] } }
    placed += 1
  }
  return { project: touch({ ...p, frames }), placed }
}
