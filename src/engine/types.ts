import type { AudioTrack } from './audio.ts'
import type { Scene } from './scenes.ts'
import type { CameraKey } from './camera.ts'
// Brush X engine types. No React, no DOM-framework imports in /engine — this
// folder is written so it can move to React Native (Skia) later.

export type Pt = { x: number; y: number; p: number } // p = pressure 0..1

export type PaintTool =
  | 'pencil'
  | 'ink'
  | 'brush'
  | 'airbrush'
  | 'marker'
  | 'chalk'
  | 'crayon'
  | 'eraser'

export type ShapeTool = 'line' | 'rect' | 'ellipse' | 'polygon'

export type ToolId = 'hand' | 'select' | 'lasso' | 'fill' | 'eyedropper' | 'bezier' | 'text' | 'crop' | PaintTool | ShapeTool

export type StrokeTool = PaintTool | ShapeTool | 'fill' | 'bitmap'

export type ShapeFill = 'none' | 'fill' | 'both'

/** Raw RGBA pixels cropped to a rectangle. Produced by merge-down. */
export interface Bitmap {
  x: number
  y: number
  w: number
  h: number
  data: Uint8ClampedArray
  /** Display size on the canvas when the pixels are stored smaller (imported pictures / video). */
  dw?: number
  dh?: number
}

/**
 * One drawing operation. Strokes are immutable and replayed in order, which
 * keeps everything editable (select, move, transform) and undo cheap.
 */
export interface Stroke {
  id: string
  tool: StrokeTool
  color: string
  size: number
  opacity: number
  hardness: number
  spacing: number
  flow: number
  grain: number
  pressure: number
  taper: boolean
  seed: number
  points: Pt[]
  closed: boolean
  shapeFill: ShapeFill
  tolerance: number
  bitmap?: Bitmap
}

export interface Layer {
  id: string
  name: string
  visible: boolean
  locked: boolean
  opacity: number
  /** construction-guide layer: shown while drawing, never exported or merged */
  guide?: boolean
  /** Strokes shown on every frame beneath this layer's own drawing (an imported picture). */
  base?: Stroke[]
}

export interface Frame {
  id: string
  /** layerId -> strokes. Missing key means an empty cel. */
  cels: Record<string, Stroke[]>
  /** Exposure: how many ticks this frame is held. Missing = 1. */
  hold?: number
}

/** Inclusive frame-index range used for looping and export. */
export interface FrameRange {
  start: number
  end: number
}

export interface Project {
  id: string
  name: string
  width: number
  height: number
  fps: number
  /** null = transparent */
  background: string | null
  /** index 0 is the bottom layer */
  layers: Layer[]
  frames: Frame[]
  createdAt: number
  updatedAt: number
  archived: boolean
  /** Work range for playback/export. Missing = whole timeline. */
  range?: FrameRange
  /** Camera keys. Missing = a still camera showing the whole canvas. */
  camera?: CameraKey[]
  /** One sound track. Missing = silent. */
  audio?: AudioTrack
  /** Scene markers. Missing = no scenes. */
  scenes?: Scene[]
  version: 1
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** x' = a*x + c*y + e ; y' = b*x + d*y + f */
export interface Matrix {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export interface Viewport {
  panX: number
  panY: number
  zoom: number
  rot: number // radians
}
