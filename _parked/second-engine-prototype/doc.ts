import type { FrameMeta, LayerMeta, PerspectiveGuide, Project, Rect } from './types'
import { clone, clampRect, ctx2d, makeCanvas, uid } from './util'
import { defaultPerspective } from './perspective'

type Command =
  | { kind: 'struct'; label: string; before: string; after: string; key?: string; t: number }
  | { kind: 'pixels'; label: string; cel: string; rect: Rect; before: ImageData; after: ImageData }
  | { kind: 'custom'; label: string; undo: () => void; redo: () => void }
  | { kind: 'group'; label: string; cmds: Command[] }

const HISTORY_LIMIT = 120

export interface NewProjectOptions {
  name: string
  width: number
  height: number
  fps: number
  background: string
}

export function createProject(o: NewProjectOptions): Project {
  const now = Date.now()
  return {
    id: uid() + uid(),
    name: o.name || 'Untitled animation',
    width: o.width,
    height: o.height,
    fps: o.fps,
    background: o.background,
    layers: [
      { id: uid(), name: 'Sketch', visible: true, locked: false, opacity: 1 },
      { id: uid(), name: 'Ink', visible: true, locked: false, opacity: 1 },
    ],
    frames: [{ id: uid(), hold: 1 }],
    guide: defaultPerspective('two-point', o.width, o.height),
    templates: [],
    camera: [],
    scenes: [{ id: uid(), name: 'Scene 1', start: 0 }],
    audio: null,
    loop: null,
    archived: false,
    createdAt: now,
    updatedAt: now,
  }
}

/** Pixel edit in progress: holds a snapshot of the cel so the edit can be committed to history or cancelled. */
export class PixelEdit {
  doc: Doc
  frameId: string
  layerId: string
  snap: HTMLCanvasElement

  constructor(doc: Doc, frameId: string, layerId: string) {
    this.doc = doc
    this.frameId = frameId
    this.layerId = layerId
    this.snap = makeCanvas(doc.project.width, doc.project.height)
    ctx2d(this.snap).drawImage(doc.getCel(frameId, layerId), 0, 0)
  }

  commit(rect: Rect, label: string): void {
    const { width, height } = this.doc.project
    const r = clampRect(rect, width, height)
    if (r.w === 0 || r.h === 0) return
    const before = ctx2d(this.snap).getImageData(r.x, r.y, r.w, r.h)
    const after = ctx2d(this.doc.getCel(this.frameId, this.layerId)).getImageData(r.x, r.y, r.w, r.h)
    this.doc.pushCommand({
      kind: 'pixels', label, cel: Doc.celKey(this.frameId, this.layerId), rect: r, before, after,
    })
    this.doc.markCel(this.frameId, this.layerId)
  }

  cancel(): void {
    const c = this.doc.getCel(this.frameId, this.layerId)
    const g = ctx2d(c)
    g.save()
    g.globalCompositeOperation = 'copy'
    g.drawImage(this.snap, 0, 0)
    g.restore()
  }
}

export class Doc {
  project: Project
  cels = new Map<string, HTMLCanvasElement>()
  dirty = new Set<string>()
  metaDirty = false
  version = 0
  frameRev = new Map<string, number>()
  audioBlob: Blob | null = null
  audioDirty = false
  undoStack: Command[] = []
  redoStack: Command[] = []
  private subs = new Set<() => void>()

  constructor(project: Project) {
    this.project = project
  }

  static celKey(frameId: string, layerId: string): string {
    return `${frameId}:${layerId}`
  }

  subscribe = (fn: () => void): (() => void) => {
    this.subs.add(fn)
    return () => this.subs.delete(fn)
  }
  getSnapshot = (): number => this.version

  emit(): void {
    this.version++
    this.project.updatedAt = Date.now()
    this.subs.forEach((f) => f())
  }

  // ---------- cels ----------
  getCel(frameId: string, layerId: string): HTMLCanvasElement {
    const k = Doc.celKey(frameId, layerId)
    let c = this.cels.get(k)
    if (!c) {
      c = makeCanvas(this.project.width, this.project.height)
      this.cels.set(k, c)
    }
    return c
  }
  peekCel(frameId: string, layerId: string): HTMLCanvasElement | undefined {
    return this.cels.get(Doc.celKey(frameId, layerId))
  }
  markCel(frameId: string, layerId: string): void {
    this.dirty.add(Doc.celKey(frameId, layerId))
    this.frameRev.set(frameId, (this.frameRev.get(frameId) ?? 0) + 1)
    this.emit()
  }
  /** Signature of everything that changes how a frame looks when composited. */
  layerSig(): string {
    return this.project.layers.map((l) => `${l.id}${l.visible ? 1 : 0}${l.opacity}`).join('|')
  }
  frameIndex(id: string): number {
    return this.project.frames.findIndex((f) => f.id === id)
  }

  // ---------- history ----------
  get canUndo(): boolean { return this.undoStack.length > 0 }
  get canRedo(): boolean { return this.redoStack.length > 0 }

  pushCommand(c: Command): void {
    this.undoStack.push(c)
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift()
    this.redoStack = []
  }

  private apply(c: Command, undo: boolean): void {
    switch (c.kind) {
      case 'struct':
        this.project = JSON.parse(undo ? c.before : c.after) as Project
        this.metaDirty = true
        break
      case 'pixels': {
        const [frameId, layerId] = c.cel.split(':')
        const g = ctx2d(this.getCel(frameId, layerId))
        g.putImageData(undo ? c.before : c.after, c.rect.x, c.rect.y)
        this.markCel(frameId, layerId)
        break
      }
      case 'custom':
        if (undo) c.undo()
        else c.redo()
        this.metaDirty = true
        break
      case 'group': {
        const list = undo ? [...c.cmds].reverse() : c.cmds
        list.forEach((x) => this.apply(x, undo))
        break
      }
    }
  }

  undo(): void {
    const c = this.undoStack.pop()
    if (!c) return
    this.apply(c, true)
    this.redoStack.push(c)
    this.bumpAll()
    this.emit()
  }
  redo(): void {
    const c = this.redoStack.pop()
    if (!c) return
    this.apply(c, false)
    this.undoStack.push(c)
    this.bumpAll()
    this.emit()
  }
  private bumpAll(): void {
    this.project.frames.forEach((f) => this.frameRev.set(f.id, (this.frameRev.get(f.id) ?? 0) + 1))
  }

  /** Undoable change to project metadata. Rapid edits with the same key merge into one history step. */
  edit(label: string, mutate: (p: Project) => void, key?: string): void {
    const before = JSON.stringify(this.project)
    mutate(this.project)
    const after = JSON.stringify(this.project)
    if (before === after) return
    this.metaDirty = true
    const last = this.undoStack[this.undoStack.length - 1]
    const now = Date.now()
    if (key && last && last.kind === 'struct' && last.key === key && now - last.t < 900 && this.redoStack.length === 0) {
      last.after = after
      last.t = now
    } else {
      this.pushCommand({ kind: 'struct', label, before, after, key, t: now })
    }
    this.bumpAll()
    this.emit()
  }

  /** Non-undoable tweak (still saved). */
  patch(mutate: (p: Project) => void): void {
    mutate(this.project)
    this.metaDirty = true
    this.emit()
  }

  // ---------- frames ----------
  addFrame(afterIndex: number): number {
    const id = uid()
    this.edit('Add frame', (p) => p.frames.splice(afterIndex + 1, 0, { id, hold: 1 }))
    return afterIndex + 1
  }

  duplicateFrame(index: number): number {
    const src = this.project.frames[index]
    if (!src) return index
    const id = uid()
    for (const l of this.project.layers) {
      const c = this.peekCel(src.id, l.id)
      if (c) {
        const n = this.getCel(id, l.id)
        ctx2d(n).drawImage(c, 0, 0)
        this.dirty.add(Doc.celKey(id, l.id))
      }
    }
    this.edit('Duplicate frame', (p) => p.frames.splice(index + 1, 0, { id, hold: src.hold }))
    return index + 1
  }

  deleteFrame(index: number): number {
    if (this.project.frames.length <= 1) {
      this.clearFrame(index, null)
      return 0
    }
    this.edit('Delete frame', (p) => p.frames.splice(index, 1))
    return Math.min(index, this.project.frames.length - 1)
  }

  moveFrame(from: number, to: number): void {
    if (from === to) return
    this.edit('Reorder frame', (p) => {
      const [f] = p.frames.splice(from, 1)
      p.frames.splice(to, 0, f)
    })
  }

  setHold(index: number, hold: number): void {
    this.edit('Frame exposure', (p) => { if (p.frames[index]) p.frames[index].hold = Math.max(1, Math.min(48, hold)) }, `hold${index}`)
  }

  /** Clear one layer (or all layers when layerId is null) of a frame. */
  clearFrame(index: number, layerId: string | null): void {
    const f = this.project.frames[index]
    if (!f) return
    const cmds: Command[] = []
    const { width, height } = this.project
    for (const l of this.project.layers) {
      if (layerId && l.id !== layerId) continue
      const c = this.peekCel(f.id, l.id)
      if (!c) continue
      const g = ctx2d(c)
      const before = g.getImageData(0, 0, width, height)
      g.clearRect(0, 0, width, height)
      const after = g.getImageData(0, 0, width, height)
      cmds.push({ kind: 'pixels', label: 'Clear', cel: Doc.celKey(f.id, l.id), rect: { x: 0, y: 0, w: width, h: height }, before, after })
      this.markCel(f.id, l.id)
    }
    if (cmds.length) this.pushCommand({ kind: 'group', label: 'Clear frame', cmds })
    this.emit()
  }

  // ---------- layers ----------
  addLayer(aboveIndex: number): string {
    const id = uid()
    const n = this.project.layers.length + 1
    this.edit('Add layer', (p) =>
      p.layers.splice(aboveIndex + 1, 0, { id, name: `Layer ${n}`, visible: true, locked: false, opacity: 1 }),
    )
    return id
  }

  duplicateLayer(index: number): string {
    const src = this.project.layers[index]
    const id = uid()
    for (const f of this.project.frames) {
      const c = this.peekCel(f.id, src.id)
      if (c) {
        ctx2d(this.getCel(f.id, id)).drawImage(c, 0, 0)
        this.dirty.add(Doc.celKey(f.id, id))
      }
    }
    this.edit('Duplicate layer', (p) => p.layers.splice(index + 1, 0, { ...src, id, name: `${src.name} copy` }))
    return id
  }

  deleteLayer(index: number): void {
    if (this.project.layers.length <= 1) return
    this.edit('Delete layer', (p) => p.layers.splice(index, 1))
  }

  moveLayer(from: number, to: number): void {
    if (to < 0 || to >= this.project.layers.length || from === to) return
    this.edit('Reorder layer', (p) => {
      const [l] = p.layers.splice(from, 1)
      p.layers.splice(to, 0, l)
    })
  }

  updateLayer(id: string, change: Partial<LayerMeta>, label = 'Edit layer', key?: string): void {
    this.edit(label, (p) => {
      const l = p.layers.find((x) => x.id === id)
      if (l) Object.assign(l, change)
    }, key ?? `layer-${id}-${Object.keys(change).join()}`)
  }

  /** Merge layer `index` into the layer below it, on every frame. */
  mergeDown(index: number): void {
    if (index <= 0) return
    const upper = this.project.layers[index]
    const lower = this.project.layers[index - 1]
    const { width, height } = this.project
    const cmds: Command[] = []
    for (const f of this.project.frames) {
      const up = this.peekCel(f.id, upper.id)
      if (!up) continue
      const lc = this.getCel(f.id, lower.id)
      const g = ctx2d(lc)
      const before = g.getImageData(0, 0, width, height)
      g.save()
      g.globalAlpha = upper.visible ? upper.opacity : 0
      g.drawImage(up, 0, 0)
      g.restore()
      const after = g.getImageData(0, 0, width, height)
      cmds.push({ kind: 'pixels', label: 'Merge', cel: Doc.celKey(f.id, lower.id), rect: { x: 0, y: 0, w: width, h: height }, before, after })
      this.markCel(f.id, lower.id)
    }
    const beforeP = JSON.stringify(this.project)
    this.project.layers.splice(index, 1)
    const afterP = JSON.stringify(this.project)
    cmds.push({ kind: 'struct', label: 'Merge layer', before: beforeP, after: afterP, t: Date.now() })
    this.metaDirty = true
    this.pushCommand({ kind: 'group', label: 'Merge layer down', cmds })
    this.emit()
  }

  // ---------- canvas ----------
  /** Crop the whole project (all cels) to a rectangle. */
  cropTo(rect: Rect): void {
    const r = clampRect(rect, this.project.width, this.project.height)
    if (r.w < 8 || r.h < 8) return
    const oldCels = this.cels
    const oldProject = JSON.stringify(this.project)
    const newCels = new Map<string, HTMLCanvasElement>()
    oldCels.forEach((c, k) => {
      const n = makeCanvas(r.w, r.h)
      ctx2d(n).drawImage(c, -r.x, -r.y)
      newCels.set(k, n)
    })
    const apply = (cels: Map<string, HTMLCanvasElement>, proj: Project) => {
      this.cels = cels
      this.project = proj
      cels.forEach((_, k) => this.dirty.add(k))
      this.bumpAll()
    }
    const np = JSON.parse(oldProject) as Project
    np.width = r.w
    np.height = r.h
    np.guide = defaultPerspective(np.guide.kind, r.w, r.h)
    np.templates.forEach((t) => { t.x -= r.x; t.y -= r.y })
    apply(newCels, np)
    const redoProject = np
    this.pushCommand({
      kind: 'custom', label: 'Crop canvas',
      undo: () => apply(oldCels, JSON.parse(oldProject) as Project),
      redo: () => apply(newCels, redoProject),
    })
    this.metaDirty = true
    this.emit()
  }

  setGuide(mutate: (g: PerspectiveGuide) => void, label = 'Edit guide', key = 'guide'): void {
    this.edit(label, (p) => mutate(p.guide), key)
  }

  // ---------- playback ----------
  /** Frame indices in play order for the loop range, with exposure holds expanded. */
  sequence(range?: { start: number; end: number } | null): number[] {
    const r = range ?? this.project.loop
    const s = r ? Math.max(0, Math.min(r.start, r.end)) : 0
    const e = r ? Math.min(this.project.frames.length - 1, Math.max(r.start, r.end)) : this.project.frames.length - 1
    const out: number[] = []
    for (let i = s; i <= e; i++) for (let k = 0; k < this.project.frames[i].hold; k++) out.push(i)
    return out
  }

  /** Exposure-frame number (0-based) where frame `index` starts. */
  exposureStart(index: number): number {
    let n = 0
    for (let i = 0; i < index; i++) n += this.project.frames[i].hold
    return n
  }

  get totalExposures(): number {
    return this.project.frames.reduce((a, f: FrameMeta) => a + f.hold, 0)
  }
}
