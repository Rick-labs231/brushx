export type Vec = { x: number; y: number }
export type Rect = { x: number; y: number; w: number; h: number }

export type BrushToolId = 'pencil' | 'ink' | 'brush' | 'airbrush' | 'marker' | 'chalk' | 'crayon' | 'eraser'
export type ShapeToolId = 'line' | 'rect' | 'ellipse' | 'polygon' | 'curve'
export type ToolId =
  | BrushToolId
  | ShapeToolId
  | 'hand' | 'select' | 'lasso' | 'fill' | 'picker' | 'text' | 'perspective' | 'guide'

export interface BrushParams {
  size: number
  opacity: number // stroke-level, 0..1
  flow: number // per-stamp alpha, 0..1
  hardness: number // 0..1
  spacing: number // fraction of size
  stabilizer: number // 0..1
  pressureSize: boolean
  pressureOpacity: boolean
  grain: number // 0..1 speckle for chalk/crayon
}

export interface LayerMeta {
  id: string
  name: string
  visible: boolean
  locked: boolean
  opacity: number
}

export interface FrameMeta {
  id: string
  hold: number // exposure, in timeline frames (>=1)
}

export type PerspectiveKind =
  | 'one-point' | 'two-point' | 'three-point' | 'four-point'
  | 'five-point' | 'curvilinear' | 'isometric' | 'birds-eye' | 'worms-eye'

export interface PerspectiveGuide {
  kind: PerspectiveKind
  vps: Vec[]
  density: number
  snap: boolean
  visible: boolean
  opacity: number
}

export interface TemplateInstance {
  id: string
  templateId: string
  params: Record<string, number>
  x: number
  y: number
  scale: number
  rotation: number // degrees
  flipX: boolean
  opacity: number
  lineWidth: number
  locked: boolean
  hidden: boolean
  cycle?: { frames: number; start: number } // motion templates map frame -> phase
}

export interface CameraKey {
  frame: number
  x: number
  y: number
  zoom: number
  rot: number
}

export interface SceneMarker {
  id: string
  name: string
  start: number
}

export interface AudioMeta {
  name: string
  duration: number
  offset: number // seconds
}

export interface Project {
  id: string
  name: string
  width: number
  height: number
  fps: number
  background: string // css color or 'transparent'
  layers: LayerMeta[] // bottom -> top
  frames: FrameMeta[]
  guide: PerspectiveGuide
  templates: TemplateInstance[]
  camera: CameraKey[]
  scenes: SceneMarker[]
  audio: AudioMeta | null
  loop: { start: number; end: number } | null
  archived: boolean
  createdAt: number
  updatedAt: number
  thumbnail?: string
}

export interface OnionSettings {
  enabled: boolean
  prev: number
  next: number
  prevOpacity: number
  nextOpacity: number
  prevColor: string
  nextColor: string
}

export interface View {
  x: number
  y: number
  zoom: number
  rot: number
}
