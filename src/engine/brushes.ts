import type { PaintTool, ShapeFill, ShapeTool, Stroke, ToolId } from './types.ts'
import { uid } from './ids.ts'

export interface BrushPreset {
  id: PaintTool
  label: string
  hint: string
  size: number
  minSize: number
  maxSize: number
  opacity: number
  hardness: number
  spacing: number
  flow: number
  grain: number
  pressure: number
  taper: boolean
  /** whether the hardness slider means anything for this brush */
  editableHardness: boolean
}

export const PAINT_BRUSHES: Record<PaintTool, BrushPreset> = {
  pencil: { id: 'pencil', label: 'Pencil', hint: 'Fine, slightly textured linework', size: 3, minSize: 1, maxSize: 40, opacity: 0.92, hardness: 0.85, spacing: 0.12, flow: 1, grain: 0.35, pressure: 0.6, taper: false, editableHardness: true },
  ink: { id: 'ink', label: 'Ink pen', hint: 'Clean tapered lines for final art', size: 6, minSize: 1, maxSize: 60, opacity: 1, hardness: 1, spacing: 0.06, flow: 1, grain: 0, pressure: 0.8, taper: true, editableHardness: false },
  brush: { id: 'brush', label: 'Brush', hint: 'Soft, pressure-sensitive strokes', size: 18, minSize: 1, maxSize: 200, opacity: 1, hardness: 0.6, spacing: 0.08, flow: 1, grain: 0, pressure: 0.7, taper: false, editableHardness: true },
  airbrush: { id: 'airbrush', label: 'Airbrush', hint: 'Build up soft colour and shading', size: 40, minSize: 4, maxSize: 300, opacity: 0.6, hardness: 0, spacing: 0.06, flow: 0.12, grain: 0, pressure: 0.4, taper: false, editableHardness: true },
  marker: { id: 'marker', label: 'Marker', hint: 'Flat, even strokes that don’t build up', size: 22, minSize: 2, maxSize: 120, opacity: 0.85, hardness: 1, spacing: 0.1, flow: 1, grain: 0, pressure: 0, taper: false, editableHardness: false },
  chalk: { id: 'chalk', label: 'Chalk', hint: 'Rough, grainy texture', size: 24, minSize: 4, maxSize: 150, opacity: 0.9, hardness: 0.5, spacing: 0.25, flow: 0.9, grain: 1, pressure: 0.5, taper: false, editableHardness: false },
  crayon: { id: 'crayon', label: 'Crayon', hint: 'Waxy, dense texture', size: 16, minSize: 3, maxSize: 100, opacity: 0.95, hardness: 0.8, spacing: 0.2, flow: 1, grain: 0.7, pressure: 0.5, taper: false, editableHardness: false },
  eraser: { id: 'eraser', label: 'Eraser', hint: 'Removes paint from the active layer', size: 24, minSize: 1, maxSize: 300, opacity: 1, hardness: 0.7, spacing: 0.08, flow: 1, grain: 0, pressure: 0.5, taper: false, editableHardness: true },
}

export const PAINT_TOOL_IDS = Object.keys(PAINT_BRUSHES) as PaintTool[]
export const SHAPE_TOOL_IDS: ShapeTool[] = ['line', 'rect', 'ellipse', 'polygon']

export const ERASER_MODES = {
  standard: 0.7,
  hard: 1,
  soft: 0.1,
} as const
export type EraserMode = keyof typeof ERASER_MODES

export interface ToolSettings {
  size: number
  opacity: number
  hardness: number
}

export function defaultToolSettings(): Record<string, ToolSettings> {
  const out: Record<string, ToolSettings> = {}
  for (const id of PAINT_TOOL_IDS) {
    const b = PAINT_BRUSHES[id]
    out[id] = { size: b.size, opacity: b.opacity, hardness: b.hardness }
  }
  for (const id of SHAPE_TOOL_IDS) out[id] = { size: 4, opacity: 1, hardness: 1 }
  out.fill = { size: 1, opacity: 1, hardness: 1 }
  return out
}

export function isPaintTool(t: ToolId): t is PaintTool {
  return t in PAINT_BRUSHES
}
export function isShapeTool(t: ToolId): t is ShapeTool {
  return (SHAPE_TOOL_IDS as string[]).includes(t)
}

export interface StrokeBuildOptions {
  color: string
  stabilizer: number
  shapeFill: ShapeFill
  tolerance: number
}

/** Creates an empty stroke (no points yet) from the current tool settings. */
export function newStroke(tool: ToolId, s: ToolSettings, o: { color: string; shapeFill: ShapeFill; tolerance: number }): Stroke {
  const base = {
    id: uid(),
    color: o.color,
    size: s.size,
    opacity: s.opacity,
    hardness: s.hardness,
    spacing: 0.1,
    flow: 1,
    grain: 0,
    pressure: 0,
    taper: false,
    seed: Math.floor(Math.random() * 2 ** 31),
    points: [],
    closed: false,
    shapeFill: 'none' as ShapeFill,
    tolerance: 0,
  }
  if (isPaintTool(tool)) {
    const b = PAINT_BRUSHES[tool]
    return { ...base, tool, spacing: b.spacing, flow: b.flow, grain: b.grain, pressure: b.pressure, taper: b.taper }
  }
  if (isShapeTool(tool)) {
    return { ...base, tool, shapeFill: tool === 'line' ? 'none' : o.shapeFill, closed: tool !== 'line' }
  }
  if (tool === 'fill') return { ...base, tool: 'fill', tolerance: o.tolerance }
  throw new Error(`Tool ${tool} does not create strokes`)
}
