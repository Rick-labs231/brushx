import { deriveCel } from './render.ts'
import { uid } from './ids.ts'
import { shiftCamera } from './camera.ts'
import { matrixTranslate, transformStroke } from './geometry.ts'
import type { Frame, FrameRange, Layer, Matrix, Project, Stroke } from './types.ts'

/** Shared empty cel so "no strokes" never allocates. */
export const EMPTY_CEL: Stroke[] = []

export interface NewProjectOptions {
  name: string
  width: number
  height: number
  fps: number
  background: string | null
}

export function createFrame(): Frame {
  return { id: uid(), cels: {} }
}

export function createLayer(name: string): Layer {
  return { id: uid(), name, visible: true, locked: false, opacity: 1 }
}

export function createProject(o: NewProjectOptions): Project {
  const now = Date.now()
  return {
    id: uid(),
    name: o.name.trim() || 'Untitled animation',
    width: o.width,
    height: o.height,
    fps: o.fps,
    background: o.background,
    layers: [createLayer('Background'), createLayer('Character'), createLayer('Outline')],
    frames: [createFrame()],
    createdAt: now,
    updatedAt: now,
    archived: false,
    version: 1,
  }
}

export const celOf = (frame: Frame, layerId: string): Stroke[] => frame.cels[layerId] ?? EMPTY_CEL

const touch = (p: Project): Project => ({ ...p, updatedAt: Date.now() })

const mapFrame = (p: Project, frameId: string, fn: (f: Frame) => Frame): Project =>
  touch({ ...p, frames: p.frames.map((f) => (f.id === frameId ? fn(f) : f)) })

const withCel = (f: Frame, layerId: string, strokes: Stroke[]): Frame => ({ ...f, cels: { ...f.cels, [layerId]: strokes } })

// ---------------------------------------------------------------- strokes

export function appendStrokes(p: Project, frameId: string, layerId: string, strokes: Stroke[]): Project {
  if (strokes.length === 0) return p
  return mapFrame(p, frameId, (f) => withCel(f, layerId, deriveCel(celOf(f, layerId), strokes)))
}

export function removeStrokes(p: Project, frameId: string, layerId: string, ids: string[]): Project {
  const gone = new Set(ids)
  return mapFrame(p, frameId, (f) => withCel(f, layerId, celOf(f, layerId).filter((s) => !gone.has(s.id))))
}

export function transformStrokes(p: Project, frameId: string, layerId: string, ids: string[], m: Matrix): Project {
  const pick = new Set(ids)
  return mapFrame(p, frameId, (f) => withCel(f, layerId, celOf(f, layerId).map((s) => (pick.has(s.id) ? transformStroke(s, m) : s))))
}

export function clearCel(p: Project, frameId: string, layerId: string): Project {
  return mapFrame(p, frameId, (f) => withCel(f, layerId, EMPTY_CEL))
}

// ----------------------------------------------------------------- layers

export function addLayer(p: Project, aboveLayerId?: string, name?: string): { project: Project; layerId: string } {
  const layer = createLayer(name ?? `Layer ${p.layers.length + 1}`)
  const at = aboveLayerId ? p.layers.findIndex((l) => l.id === aboveLayerId) + 1 : p.layers.length
  const layers = [...p.layers.slice(0, at), layer, ...p.layers.slice(at)]
  return { project: touch({ ...p, layers }), layerId: layer.id }
}

export function deleteLayer(p: Project, layerId: string): Project {
  if (p.layers.length <= 1) return p
  return touch({
    ...p,
    layers: p.layers.filter((l) => l.id !== layerId),
    frames: p.frames.map((f) => {
      const { [layerId]: _gone, ...rest } = f.cels
      void _gone
      return { ...f, cels: rest }
    }),
  })
}

export function duplicateLayer(p: Project, layerId: string): { project: Project; layerId: string } {
  const idx = p.layers.findIndex((l) => l.id === layerId)
  if (idx < 0) return { project: p, layerId }
  const src = p.layers[idx]
  const copy: Layer = { ...src, id: uid(), name: `${src.name} copy` }
  const layers = [...p.layers.slice(0, idx + 1), copy, ...p.layers.slice(idx + 1)]
  return {
    project: touch({ ...p, layers, frames: p.frames.map((f) => (f.cels[layerId] ? withCel(f, copy.id, f.cels[layerId]) : f)) }),
    layerId: copy.id,
  }
}

export function patchLayer(p: Project, layerId: string, patch: Partial<Omit<Layer, 'id'>>): Project {
  return touch({ ...p, layers: p.layers.map((l) => (l.id === layerId ? { ...l, ...patch } : l)) })
}

/** Moves a layer to a new index in the stack (0 = bottom). */
export function moveLayer(p: Project, layerId: string, toIndex: number): Project {
  const from = p.layers.findIndex((l) => l.id === layerId)
  const to = Math.max(0, Math.min(p.layers.length - 1, toIndex))
  if (from < 0 || from === to) return p
  const layers = [...p.layers]
  const [moved] = layers.splice(from, 1)
  layers.splice(to, 0, moved)
  return touch({ ...p, layers })
}

// ----------------------------------------------------------------- frames

export function addFrame(p: Project, afterFrameId?: string): { project: Project; frameId: string } {
  const frame = createFrame()
  const at = afterFrameId ? p.frames.findIndex((f) => f.id === afterFrameId) + 1 : p.frames.length
  return { project: touch({ ...p, frames: [...p.frames.slice(0, at), frame, ...p.frames.slice(at)] }), frameId: frame.id }
}

export function duplicateFrame(p: Project, frameId: string): { project: Project; frameId: string } {
  const idx = p.frames.findIndex((f) => f.id === frameId)
  if (idx < 0) return { project: p, frameId }
  const copy: Frame = { ...p.frames[idx], id: uid(), cels: { ...p.frames[idx].cels } }
  return { project: touch({ ...p, frames: [...p.frames.slice(0, idx + 1), copy, ...p.frames.slice(idx + 1)] }), frameId: copy.id }
}

export function deleteFrame(p: Project, frameId: string): { project: Project; frameId: string } {
  if (p.frames.length <= 1) return { project: p, frameId }
  const idx = p.frames.findIndex((f) => f.id === frameId)
  const frames = p.frames.filter((f) => f.id !== frameId)
  return { project: touch(clampRange({ ...p, frames })), frameId: frames[Math.min(idx, frames.length - 1)].id }
}

export function moveFrame(p: Project, from: number, to: number): Project {
  if (from === to || from < 0 || to < 0 || from >= p.frames.length || to >= p.frames.length) return p
  const frames = [...p.frames]
  const [moved] = frames.splice(from, 1)
  frames.splice(to, 0, moved)
  return touch({ ...p, frames })
}

export function setFps(p: Project, fps: number): Project {
  return touch({ ...p, fps })
}

export function renameProject(p: Project, name: string): Project {
  return touch({ ...p, name: name.trim() || p.name })
}

/** Layers whose strokes can't be merged by simple concatenation. */
export function needsRasterMerge(strokes: Stroke[]) {
  return strokes.some((s) => s.tool === 'eraser' || s.tool === 'fill')
}

// --------------------------------------------------------------- timeline

export const MAX_HOLD = 24

export const holdOf = (f: Frame): number => Math.max(1, Math.min(MAX_HOLD, Math.round(f.hold ?? 1)))

export function setHold(p: Project, frameId: string, hold: number): Project {
  const h = Math.max(1, Math.min(MAX_HOLD, Math.round(hold)))
  const cur = p.frames.find((f) => f.id === frameId)
  if (!cur || holdOf(cur) === h) return p
  return mapFrame(p, frameId, (f) => {
    if (h === 1) {
      const { hold: _h, ...rest } = f
      void _h
      return rest
    }
    return { ...f, hold: h }
  })
}

/** The effective range, always valid for the current frame count. */
export function rangeOf(p: Project): FrameRange {
  const last = p.frames.length - 1
  if (!p.range) return { start: 0, end: last }
  const start = Math.max(0, Math.min(last, p.range.start))
  return { start, end: Math.max(start, Math.min(last, p.range.end)) }
}

export const hasCustomRange = (p: Project): boolean => {
  const r = rangeOf(p)
  return !!p.range && (r.start !== 0 || r.end !== p.frames.length - 1)
}

function clampRange(p: Project): Project {
  if (!p.range) return p
  if (!hasCustomRange(p)) {
    const { range: _r, ...rest } = p
    void _r
    return rest
  }
  return { ...p, range: rangeOf(p) }
}

/** Set one end of the range (index). The other end is pushed along if they would cross. */
export function setRangeEdge(p: Project, edge: 'start' | 'end', index: number): Project {
  const r = rangeOf(p)
  const i = Math.max(0, Math.min(p.frames.length - 1, index))
  const next = edge === 'start' ? { start: i, end: Math.max(i, r.end) } : { start: Math.min(i, r.start), end: i }
  return touch(clampRange({ ...p, range: next }))
}

export function clearRange(p: Project): Project {
  if (!p.range) return p
  const { range: _r, ...rest } = p
  void _r
  return touch(rest)
}

/** A frame is a keyframe when any layer has artwork on it. */
export const isKeyframe = (f: Frame, layers?: Layer[]): boolean => {
  const guides = new Set((layers ?? []).filter((l) => l.guide).map((l) => l.id))
  return Object.entries(f.cels).some(([id, c]) => c.length > 0 && !guides.has(id))
}

export interface Beat {
  index: number
  frameId: string
  /** how many ticks it is shown for */
  ticks: number
}

/** Frames in play order with their exposure. Honours the range when asked. */
export function playSequence(p: Project, useRange: boolean): Beat[] {
  const r = useRange ? rangeOf(p) : { start: 0, end: p.frames.length - 1 }
  const out: Beat[] = []
  for (let i = r.start; i <= r.end; i += 1) out.push({ index: i, frameId: p.frames[i].id, ticks: holdOf(p.frames[i]) })
  return out
}

export const totalTicks = (seq: Beat[]): number => seq.reduce((a, b) => a + b.ticks, 0)

// -------------------------------------------------------------- guide layers

export function addGuideLayer(p: Project, name: string): { project: Project; layerId: string } {
  const layer: Layer = { ...createLayer(name), guide: true, opacity: 1 }
  return { project: touch({ ...p, layers: [...p.layers, layer] }), layerId: layer.id }
}

/** Adds construction strokes to a frame, creating (or reusing) the guide layer named `name`. */
export function stampGuide(p: Project, frameId: string, name: string, strokes: Stroke[]): { project: Project; layerId: string } {
  const existing = p.layers.find((l) => l.guide && l.name === name)
  const base = existing ? { project: p, layerId: existing.id } : addGuideLayer(p, name)
  return { project: appendStrokes(base.project, frameId, base.layerId, strokes), layerId: base.layerId }
}

/** Inserts one new frame per entry after `afterFrameId`, each carrying its strokes on one new guide layer. */
export function insertGuideFrames(p: Project, afterFrameId: string, name: string, perFrame: Stroke[][]): { project: Project; layerId: string; frameIds: string[] } {
  const { project: withLayer, layerId } = addGuideLayer(p, name)
  const frames = perFrame.map((strokes) => ({ ...createFrame(), cels: { [layerId]: [...strokes] } }))
  const at = Math.max(0, withLayer.frames.findIndex((f) => f.id === afterFrameId)) + 1
  const all = [...withLayer.frames.slice(0, at), ...frames, ...withLayer.frames.slice(at)]
  return { project: touch(clampRange({ ...withLayer, frames: all })), layerId, frameIds: frames.map((f) => f.id) }
}

// ------------------------------------------------------------ project settings

export const MIN_SIZE = 64
export const MAX_SIZE = 4096
const clampSize = (v: number) => Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(v) || MIN_SIZE))

export function setBackground(p: Project, background: string | null): Project {
  return p.background === background ? p : touch({ ...p, background })
}

function shiftStroke(s: Stroke, dx: number, dy: number): Stroke {
  if (s.tool === 'fill') return { ...s, points: s.points.map((pt) => ({ ...pt, x: pt.x + dx, y: pt.y + dy })) }
  return transformStroke(s, matrixTranslate(dx, dy))
}

/**
 * Changes the canvas size. `ax`/`ay` (0, 0.5 or 1) say which edge or corner stays put:
 * artwork is shifted so it keeps its place relative to that anchor. Nothing is deleted;
 * strokes pushed off the canvas come back if it is made larger again.
 */
export function resizeCanvas(p: Project, width: number, height: number, ax = 0.5, ay = 0.5): Project {
  const w = clampSize(width)
  const h = clampSize(height)
  if (w === p.width && h === p.height) return p
  return shiftArtwork(p, w, h, Math.round((w - p.width) * ax), Math.round((h - p.height) * ay))
}

/** Sets the new size and moves all artwork (strokes, pictures, camera) by (dx, dy). */
function shiftArtwork(p: Project, w: number, h: number, dx: number, dy: number): Project {
  const moved = dx !== 0 || dy !== 0
  const frames = !moved
    ? p.frames
    : p.frames.map((f) => ({ ...f, cels: Object.fromEntries(Object.entries(f.cels).map(([id, strokes]) => [id, strokes.map((s) => shiftStroke(s, dx, dy))])) }))
  const layers = !moved ? p.layers : p.layers.map((l) => (l.base ? { ...l, base: l.base.map((s) => shiftStroke(s, dx, dy)) } : l))
  return shiftCamera(touch({ ...p, width: w, height: h, frames, layers }), dx, dy)
}

/**
 * Keeps only the rectangle (x, y, w, h) of the canvas. Like a resize, nothing is deleted:
 * strokes outside the new frame stay and come back if the canvas is made bigger again.
 */
export function cropCanvas(p: Project, x: number, y: number, w: number, h: number): Project {
  const nw = clampSize(w)
  const nh = clampSize(h)
  const dx = -Math.round(x)
  const dy = -Math.round(y)
  if (nw === p.width && nh === p.height && dx === 0 && dy === 0) return p
  return shiftArtwork(p, nw, nh, dx, dy)
}
