import { fitView } from '../editor/viewControls.ts'
import { isPaintTool, isShapeTool, type ToolSettings } from '../engine/brushes.ts'
import { defaultGuide, defaultPerspective, guideShapes, templateById, type GuideState, type PerspectiveState } from '../engine/guides.ts'
import { cloneStrokes, copyableStrokes } from '../engine/clipboard.ts'
import { cycleById } from '../engine/templates/cycles.ts'
import { GUIDE_COLOR, guideLineSize, guideMapper, shapesToStrokes } from '../engine/templates/stamp.ts'
import { matrixAbout, matrixTranslate, strokeBounds, strokeIdsInPolygon, unionRect } from '../engine/geometry.ts'
import { record, redo as redoH, undo as undoH, emptyHistory } from '../engine/history.ts'
import { mergeDown } from '../engine/merge.ts'
import {
  addFrame,
  addLayer,
  insertGuideFrames,
  stampGuide,
  clearRange,
  setHold,
  setRangeEdge,
  appendStrokes,
  celOf,
  clearCel,
  createProject,
  deleteFrame,
  deleteLayer,
  duplicateFrame,
  duplicateLayer,
  moveFrame,
  moveLayer,
  patchLayer,
  removeStrokes,
  renameProject,
  resizeCanvas,
  cropCanvas,
  setBackground,
  setFps,
  transformStrokes,
  type NewProjectOptions,
} from '../engine/projectOps.ts'
import { renderFinalFrame } from '../engine/render.ts'
import { ProjectFileError, projectFromJSON, projectToJSON } from '../engine/serialize.ts'
import { readZip, zipBytes } from '../engine/zip.ts'
import { isPersistent, listProjects, loadProject, loadSnapshot, removeProject, removeSnapshot, saveProject, saveSnapshot } from '../engine/storage.ts'
import { cameraAt, clearCamera, removeCameraKey, setCameraKey, type CameraEase, type CameraPose } from '../engine/camera.ts'
import { hasArtwork, restoredProject, type SnapshotKind } from '../engine/versions.ts'
import type { Layer, Project, Rect, Stroke, ToolId } from '../engine/types.ts'
import { store, type AppState, type Dialog, type Prefs } from './app.ts'
import { noteLocalDelete } from './cloud.ts'
import { markClean, downloadBlob, readUnsavedFlag, safeName, thumbOf } from './persist.ts'
import { navigate } from './router.ts'
import { clearGesture, session } from './session.ts'
import { toast } from './toast.ts'

const get = store.getState
const set = store.setState

// ------------------------------------------------------------------ library

export async function refreshLibrary() {
  const [library, persistent] = await Promise.all([listProjects(), isPersistent()])
  set({ library, libraryLoaded: true, persistent })
}

function enterProject(p: Project) {
  const defaultLayer = p.layers[1] ?? p.layers[0]
  markClean(p)
  clearGesture()
  session.polygon = null
  session.bezier = null
  set({
    project: p,
    history: emptyHistory(),
    frameId: p.frames[0].id,
    layerId: defaultLayer.id,
    selection: null,
    playing: false,
    saveStatus: 'saved',
    guide: defaultGuide(),
    perspective: defaultPerspective(),
    dialog: null,
  })
}

export async function openProject(id: string): Promise<boolean> {
  if (get().project?.id === id) return true
  const p = await loadProject(id)
  if (!p) {
    toast('We couldn’t find that project.', 'error')
    return false
  }
  const flag = readUnsavedFlag()
  enterProject(p)
  if (flag && flag.id === id) {
    toast('Brush X closed before your last changes finished saving. Check your recent work; earlier versions are in Version history.', 'info', [{ label: 'Version history', run: () => openDialog('versions') }])
  }
  return true
}

export function closeProject() {
  clearGesture()
  set({ project: null, playing: false, selection: null })
  void refreshLibrary()
}

export async function createNewProject(opts: NewProjectOptions) {
  const p = createProject(opts)
  try {
    await saveProject(p, thumbOf(p))
  } catch {
    toast('Couldn’t save the new project yet — you can keep working.', 'error')
  }
  enterProject(p)
  navigate({ name: 'editor', id: p.id })
  void refreshLibrary()
}

async function modifyStored(id: string, fn: (p: Project) => Project) {
  const open = get().project
  const p = open?.id === id ? open : await loadProject(id)
  if (!p) return
  const next = fn(p)
  if (open?.id === id) set({ project: next, saveStatus: 'dirty' })
  else await saveProject(next, thumbOf(next))
  await refreshLibrary()
}

export async function renameStoredProject(id: string, name: string) {
  await modifyStored(id, (p) => renameProject(p, name))
}

export async function archiveStoredProject(id: string, archived: boolean) {
  await modifyStored(id, (p) => ({ ...p, archived, updatedAt: Date.now() }))
  toast(archived ? 'Project archived.' : 'Project restored.', 'success')
}

export async function duplicateStoredProject(id: string) {
  const p = await loadProject(id)
  if (!p) return
  const copy = createProject({ name: `${p.name} copy`, width: p.width, height: p.height, fps: p.fps, background: p.background })
  const full: Project = { ...p, id: copy.id, name: copy.name, createdAt: copy.createdAt, updatedAt: Date.now(), archived: false }
  await saveProject(full, thumbOf(full))
  await refreshLibrary()
  toast('Project duplicated.', 'success')
}

export async function deleteStoredProject(id: string) {
  await removeProject(id)
  noteLocalDelete(id)
  if (get().project?.id === id) closeProject()
  await refreshLibrary()
  toast('Project deleted.', 'info')
}

export async function importProjectFile(file: File): Promise<boolean> {
  if (/\.zip$/i.test(file.name)) return importBackup(file)
  try {
    const p = projectFromJSON(await file.text())
    await saveProject(p, thumbOf(p))
    await refreshLibrary()
    toast(`Imported “${p.name}”.`, 'success')
    return true
  } catch (e) {
    toast(e instanceof ProjectFileError ? e.message : 'Couldn’t open that file.', 'error')
    return false
  }
}

/** One zip holding every project as a .brushx file. */
export async function backupAll() {
  const metas = await listProjects()
  const enc = new TextEncoder()
  const used = new Set<string>()
  const entries: { name: string; data: Uint8Array }[] = []
  for (const m of metas) {
    const p = await loadProject(m.id)
    if (!p) continue
    let base = safeName(p.name)
    while (used.has(base)) base += '-2'
    used.add(base)
    entries.push({ name: `${base}.brushx`, data: enc.encode(projectToJSON(p)) })
  }
  if (!entries.length) { toast('No projects to back up yet.', 'info'); return }
  downloadBlob(new Blob([zipBytes(entries) as BlobPart], { type: 'application/zip' }), `brushx-backup-${new Date().toISOString().slice(0, 10)}.zip`)
  toast(`Backed up ${entries.length} project${entries.length === 1 ? '' : 's'}.`, 'success')
}

async function importBackup(file: File): Promise<boolean> {
  try {
    const dec = new TextDecoder()
    const files = readZip(new Uint8Array(await file.arrayBuffer())).filter((e) => /\.brushx$/i.test(e.name))
    let n = 0
    for (const e of files) {
      try {
        const p = projectFromJSON(dec.decode(e.data))
        await saveProject(p, thumbOf(p))
        n += 1
      } catch { /* skip bad entry */ }
    }
    await refreshLibrary()
    if (!n) throw new Error('empty')
    toast(`Restored ${n} project${n === 1 ? '' : 's'} from the backup.`, 'success')
    return true
  } catch {
    toast('Couldn’t read that backup.', 'error')
    return false
  }
}

// ------------------------------------------------------------------ editing

function validIds(s: AppState, p: Project) {
  const frameId = p.frames.some((f) => f.id === s.frameId) ? s.frameId : p.frames[0].id
  const layerId = p.layers.some((l) => l.id === s.layerId) ? s.layerId : (p.layers[p.layers.length - 1]).id
  const sel = s.selection
  const selection = sel && sel.frameId === frameId && sel.layerId === layerId && p.layers.some((l) => l.id === sel.layerId) ? sel : null
  return { frameId, layerId, selection }
}

/** Replace the project, recording an undo step unless told otherwise. */
export function commit(next: Project, opts: { record?: boolean } = {}) {
  const s = get()
  if (!s.project || next === s.project) return
  const history = opts.record === false ? s.history : record(s.history, s.project)
  set({ project: next, history, saveStatus: 'dirty', ...validIds(s, next) })
}

export function undo() {
  const s = get()
  if (!s.project) return
  const r = undoH(s.history, s.project)
  if (!r) return
  clearGesture()
  set({ project: r.value, history: r.history, saveStatus: 'dirty', ...validIds(s, r.value), selection: null })
}

export function redo() {
  const s = get()
  if (!s.project) return
  const r = redoH(s.history, s.project)
  if (!r) return
  clearGesture()
  set({ project: r.value, history: r.history, saveStatus: 'dirty', ...validIds(s, r.value), selection: null })
}

export function rememberColor(color: string) {
  set((s) => (s.recentColors[0] === color ? {} : { recentColors: [color, ...s.recentColors.filter((c) => c !== color)].slice(0, 12) }))
}

export function commitStrokes(strokes: Stroke[]) {
  const s = get()
  if (!s.project || strokes.length === 0) return
  commit(appendStrokes(s.project, s.frameId, s.layerId, strokes))
  const c = strokes[0].color
  if (strokes[0].tool !== 'eraser' && strokes[0].tool !== 'bitmap') rememberColor(c)
}

// --------------------------------------------------------------------- tools

export function setTool(tool: ToolId) {
  const s = get()
  if (s.tool === tool) return
  session.polygon = null
  session.bezier = null
  clearGesture()
  const keepSelection = tool === 'select' || tool === 'lasso' || tool === 'hand'
  set({ tool, selection: keepSelection ? s.selection : null, playing: false })
}

export function setColor(color: string) {
  set({ color })
}

export function setToolSetting(tool: string, patch: Partial<ToolSettings>) {
  set((s) => ({ toolSettings: { ...s.toolSettings, [tool]: { ...s.toolSettings[tool], ...patch } } }))
}

export function nudgeBrushSize(factor: number) {
  const s = get()
  if (!(isPaintTool(s.tool) || isShapeTool(s.tool))) return
  const cur = s.toolSettings[s.tool].size
  const next = Math.max(1, Math.min(300, Math.round(cur * factor + (factor > 1 ? 1 : -1))))
  setToolSetting(s.tool, { size: next })
}

export function patch(p: Partial<AppState>) {
  set(p)
}

// ------------------------------------------------------------------- layers

export function selectLayer(id: string) {
  const s = get()
  if (s.layerId === id) return
  clearGesture()
  set({ layerId: id, selection: null })
}

export function addLayerAction() {
  const s = get()
  if (!s.project) return
  const r = addLayer(s.project, s.layerId)
  commit(r.project)
  set({ layerId: r.layerId })
}

export function deleteLayerAction(id: string) {
  const s = get()
  if (!s.project) return
  if (s.project.layers.length <= 1) {
    toast('A project needs at least one layer.', 'info')
    return
  }
  const idx = s.project.layers.findIndex((l) => l.id === id)
  const next = deleteLayer(s.project, id)
  commit(next)
  if (s.layerId === id) set({ layerId: next.layers[Math.max(0, idx - 1)].id })
}

export function duplicateLayerAction(id: string) {
  const s = get()
  if (!s.project) return
  const r = duplicateLayer(s.project, id)
  commit(r.project)
  set({ layerId: r.layerId })
}

export function mergeDownAction(id: string) {
  const s = get()
  if (!s.project) return
  const idx = s.project.layers.findIndex((l) => l.id === id)
  if (idx <= 0) {
    toast('There’s no layer below to merge into.', 'info')
    return
  }
  const below = s.project.layers[idx - 1]
  if (below.base || s.project.layers[idx].base) {
    toast('Picture layers can’t be merged. Draw on the layer above instead.', 'info')
    return
  }
  if (below.guide || s.project.layers[idx].guide) {
    toast('Guide layers can’t be merged. They never appear in exports.', 'info')
    return
  }
  commit(mergeDown(s.project, id))
  set({ layerId: below.id })
}

export function patchLayerAction(id: string, patchData: Partial<Omit<Layer, 'id'>>, recordHistory = false) {
  const s = get()
  if (!s.project) return
  commit(patchLayer(s.project, id, patchData), { record: recordHistory })
}

export function moveLayerAction(id: string, toIndex: number) {
  const s = get()
  if (!s.project) return
  commit(moveLayer(s.project, id, toIndex))
}

export function activeLayer(s: AppState): Layer | undefined {
  return s.project?.layers.find((l) => l.id === s.layerId)
}

// ------------------------------------------------------------------- frames

export function selectFrame(id: string) {
  const s = get()
  if (s.frameId === id) return
  clearGesture()
  set({ frameId: id, selection: null })
}

export function stepFrame(delta: number, wrap = true) {
  const s = get()
  if (!s.project) return
  const frames = s.project.frames
  const idx = frames.findIndex((f) => f.id === s.frameId)
  let next = idx + delta
  if (wrap) next = (next + frames.length) % frames.length
  else next = Math.max(0, Math.min(frames.length - 1, next))
  selectFrame(frames[next].id)
}

export function addFrameAction() {
  const s = get()
  if (!s.project) return
  const r = addFrame(s.project, s.frameId)
  commit(r.project)
  selectFrame(r.frameId)
}

export function duplicateFrameAction() {
  const s = get()
  if (!s.project) return
  const r = duplicateFrame(s.project, s.frameId)
  commit(r.project)
  selectFrame(r.frameId)
}

export function deleteFrameAction() {
  const s = get()
  if (!s.project) return
  if (s.project.frames.length <= 1) {
    toast('An animation needs at least one frame.', 'info')
    return
  }
  const r = deleteFrame(s.project, s.frameId)
  commit(r.project)
  set({ frameId: r.frameId, selection: null })
}

export function moveFrameAction(from: number, to: number) {
  const s = get()
  if (!s.project) return
  commit(moveFrame(s.project, from, to))
}

export function clearLayerOnFrame() {
  const s = get()
  if (!s.project) return
  commit(clearCel(s.project, s.frameId, s.layerId))
  set({ selection: null })
}

export function setHoldAction(hold: number, frameId?: string) {
  const s = get()
  if (!s.project) return
  commit(setHold(s.project, frameId ?? s.frameId, hold))
}

/** Marks the current frame as the start or end of the work range. */
export function setRangeEdgeAction(edge: 'start' | 'end') {
  const s = get()
  if (!s.project) return
  const idx = s.project.frames.findIndex((f) => f.id === s.frameId)
  commit(setRangeEdge(s.project, edge, idx), { record: false })
}

export function clearRangeAction() {
  const s = get()
  if (!s.project) return
  commit(clearRange(s.project), { record: false })
}

export function setFpsAction(fps: number) {
  const s = get()
  if (!s.project) return
  commit(setFps(s.project, fps), { record: false })
}

export function renameOpenProject(name: string) {
  const s = get()
  if (!s.project) return
  commit(renameProject(s.project, name), { record: false })
}

export function setPlaying(playing: boolean) {
  if (playing) {
    clearGesture()
    set({ playing: true, selection: null })
  } else set({ playing: false })
}

// ---------------------------------------------------------------- selection

export function selectionStrokes(s: AppState = get()): Stroke[] {
  if (!s.project || !s.selection) return []
  const frame = s.project.frames.find((f) => f.id === s.selection?.frameId)
  if (!frame) return []
  const ids = new Set(s.selection.ids)
  return celOf(frame, s.selection.layerId).filter((st) => ids.has(st.id))
}

export function selectionBounds(s: AppState = get()): Rect | null {
  return selectionStrokes(s).reduce<Rect | null>((acc, st) => unionRect(acc, strokeBounds(st)), null)
}

export function setSelection(ids: string[]) {
  const s = get()
  if (ids.length === 0) set({ selection: null })
  else set({ selection: { frameId: s.frameId, layerId: s.layerId, ids } })
}

/** Strokes in the active cel that a rectangle or polygon picks up. Fills are procedural, so they stay put. */
export function strokesInRect(rect: Rect): string[] {
  const s = get()
  if (!s.project) return []
  const frame = s.project.frames.find((f) => f.id === s.frameId)
  if (!frame) return []
  return celOf(frame, s.layerId)
    .filter((st) => {
      if (st.tool === 'fill') return false
      const b = strokeBounds(st)
      return b.x < rect.x + rect.w && b.x + b.w > rect.x && b.y < rect.y + rect.h && b.y + b.h > rect.y
    })
    .map((st) => st.id)
}

export function strokesInPolygon(poly: { x: number; y: number }[]): string[] {
  const s = get()
  if (!s.project) return []
  const frame = s.project.frames.find((f) => f.id === s.frameId)
  return frame ? strokeIdsInPolygon(celOf(frame, s.layerId), poly) : []
}

export function moveSelection(dx: number, dy: number) {
  const s = get()
  if (!s.project || !s.selection) return
  commit(transformStrokes(s.project, s.selection.frameId, s.selection.layerId, s.selection.ids, matrixTranslate(dx, dy)))
}

export function transformSelection(op: { rotate?: number; scale?: number; flipX?: boolean; flipY?: boolean }) {
  const s = get()
  const b = selectionBounds(s)
  if (!s.project || !s.selection || !b) return
  const m = matrixAbout(b.x + b.w / 2, b.y + b.h / 2, op)
  commit(transformStrokes(s.project, s.selection.frameId, s.selection.layerId, s.selection.ids, m))
}

export function deleteSelection() {
  const s = get()
  if (!s.project || !s.selection) return
  commit(removeStrokes(s.project, s.selection.frameId, s.selection.layerId, s.selection.ids))
  set({ selection: null })
}

// -------------------------------------------------------- guides, prefs, UI

export function patchGuide(p: Partial<GuideState>) {
  set((s) => ({ guide: { ...s.guide, ...p } }))
}

export function chooseTemplate(id: string | null) {
  set((s) => ({ guide: id === null ? { ...defaultGuide(), opacity: s.guide.opacity } : { ...defaultGuide(), template: id, opacity: s.guide.opacity, thickness: s.guide.thickness } }))
}

export function patchPerspective(p: Partial<PerspectiveState>) {
  set((s) => ({ perspective: { ...s.perspective, ...p } }))
}

export function setPrefs(p: Partial<Prefs>) {
  const next = { ...get().prefs, ...p }
  set({ prefs: next })
  try {
    localStorage.setItem('brushx:prefs', JSON.stringify(next))
  } catch {
    /* preferences just won't persist */
  }
}

export function openDialog(d: Dialog) {
  set({ dialog: d })
}

// ------------------------------------------------------------------- export

export function exportFramePng(opts: { scale: number; transparent: boolean }) {
  const s = get()
  if (!s.project) return
  const frame = s.project.frames.find((f) => f.id === s.frameId) ?? s.project.frames[0]
  const idx = s.project.frames.indexOf(frame) + 1
  const canvas = renderFinalFrame(s.project, frame, opts)
  canvas.toBlob((blob) => {
    if (!blob) {
      toast('Couldn’t create the image. Try a smaller size.', 'error')
      return
    }
    downloadBlob(blob, `${safeName(s.project?.name ?? 'brushx')}-frame-${idx}.png`)
    toast('Frame exported.', 'success')
  }, 'image/png')
}

export function exportProjectFile() {
  const s = get()
  if (!s.project) return
  downloadBlob(new Blob([projectToJSON(s.project)], { type: 'application/json' }), `${safeName(s.project.name)}.brushx`)
  toast('Project file saved.', 'success')
}

// ---------------------------------------------------------------- clipboard

export function copySelection(): boolean {
  const s = get()
  if (!s.selection) return false
  const strokes = copyableStrokes(selectionStrokes(s))
  if (strokes.length === 0) {
    toast('Nothing to copy. Erasers can’t be copied.', 'info')
    return false
  }
  set({ clipboard: { strokes, frameId: s.selection.frameId, layerId: s.selection.layerId, pastes: 0 } })
  toast(`Copied ${strokes.length} stroke${strokes.length === 1 ? '' : 's'}. Pick another frame and paste.`, 'success')
  return true
}

export function cutSelection() {
  if (copySelection()) deleteSelection()
}

/** Pastes onto the current frame and layer, in the same spot (nudged only when it would land on its source). */
export function pasteClipboard() {
  const s = get()
  const clip = s.clipboard
  if (!s.project || !clip) return
  const layer = s.project.layers.find((l) => l.id === s.layerId)
  if (!layer) return
  if (layer.locked) {
    toast('This layer is locked. Unlock it to paste.', 'info')
    return
  }
  if (!layer.visible) {
    toast('This layer is hidden. Show it to paste.', 'info')
    return
  }
  const onSource = clip.frameId === s.frameId && clip.layerId === s.layerId
  const nudge = onSource ? 16 * (clip.pastes + 1) : 0
  const pasted = cloneStrokes(clip.strokes, nudge, nudge)
  commit(appendStrokes(s.project, s.frameId, s.layerId, pasted))
  const tool = s.tool === 'select' || s.tool === 'lasso' ? s.tool : 'select'
  set({ clipboard: { ...clip, pastes: clip.pastes + 1 }, tool, playing: false, selection: { frameId: s.frameId, layerId: s.layerId, ids: pasted.map((p) => p.id) } })
}

// ------------------------------------------------------------------ templates

/** Draws the current template guide into this frame as editable construction strokes. */
export function stampGuideAction() {
  const s = get()
  const t = templateById(s.guide.template)
  if (!s.project || !t) return
  const { width: w, height: h } = s.project
  const strokes = shapesToStrokes(guideShapes(t, s.guide), guideMapper(s.guide, w, h), { size: guideLineSize(w, h), opacity: Math.max(0.2, s.guide.opacity) })
  const r = stampGuide(s.project, s.frameId, 'Guide', strokes)
  commit(r.project)
  set({ layerId: r.layerId })
  toast(`${t.title} stamped onto this frame as a guide layer.`, 'success')
}

/** Remembers the current guide so it can be pasted again later, even after it is removed. */
export function copyGuideAction() {
  const s = get()
  if (!s.guide.template) return
  set({ guideClip: { ...s.guide } })
  toast('Guide copied. Use Paste guide on any frame.', 'success')
}

/** Pastes the guide as ordinary editable lines on the current layer. They are real drawing and are exported. */
export function pasteGuideAction() {
  const s = get()
  const g = s.guide.template ? s.guide : s.guideClip
  const t = templateById(g?.template ?? null)
  if (!s.project || !g || !t) return
  const { width: w, height: h } = s.project
  const strokes = shapesToStrokes(guideShapes(t, g), guideMapper(g, w, h), { size: guideLineSize(w, h), opacity: Math.max(0.2, g.opacity), color: s.color })
  const cur = s.project.layers.find((l) => l.id === s.layerId)
  let project = s.project
  let layerId = s.layerId
  if (!cur || cur.guide || cur.locked || cur.base) {
    const r = addLayer(project, undefined, t.title)
    project = r.project
    layerId = r.layerId
  }
  commit(appendStrokes(project, s.frameId, layerId, strokes))
  set({ layerId })
  toast(`${t.title} pasted as a drawing. Select it to move or edit it; it will be in your exports.`, 'success')
}

/** "Run → 8 frames": adds N frames after the current one, each with its construction guides. */
export function insertCycleAction(cycleId: string, frames: number, asGuide = true) {
  const s = get()
  const cycle = cycleById(cycleId)
  if (!s.project || !cycle) return
  const n = Math.max(2, Math.min(24, Math.round(frames)))
  const { width: w, height: h } = s.project
  const map = guideMapper({ x: 0, y: 0, scale: 1, stretchX: 1, rotation: 0, flipX: false }, w, h)
  const style = asGuide ? { size: guideLineSize(w, h), opacity: 0.7, color: GUIDE_COLOR } : { size: guideLineSize(w, h), opacity: 1, color: s.color }
  const per = Array.from({ length: n }, (_, i) => shapesToStrokes(cycle.frame(i, n), map, style))
  const r = insertGuideFrames(s.project, s.frameId, asGuide ? `Guide · ${cycle.title}` : cycle.title, per, asGuide)
  commit(r.project)
  set({ frameId: r.frameIds[0], layerId: asGuide ? s.layerId : r.layerId, selection: null, playing: false })
  toast(asGuide ? `${cycle.title}: ${n} frames added as a guide. Draw on your own layer over it. Guides never export.` : `${cycle.title}: ${n} frames added as a drawing. It will be in your exports.`, 'success')
}

export function toggleFavorite(id: string) {
  const fav = get().favorites
  const next = fav.includes(id) ? fav.filter((x) => x !== id) : [...fav, id]
  set({ favorites: next })
  try {
    localStorage.setItem('brushx:favorites', JSON.stringify(next))
  } catch {
    /* private mode: favourites last for this session only */
  }
}

// ------------------------------------------------------------ version history

export async function createRestorePoint(note: string, kind: SnapshotKind = 'manual') {
  const s = get()
  if (!s.project) return
  try {
    await saveSnapshot(s.project, kind, thumbOf(s.project), note)
    if (kind === 'manual') toast('Restore point saved.', 'success')
  } catch {
    toast('Couldn’t save a restore point.', 'error')
  }
}

export async function restoreSnapshotAction(id: string) {
  const s = get()
  if (!s.project) return
  const snap = await loadSnapshot(id)
  if (!snap) {
    toast('That version is no longer available.', 'error')
    return
  }
  if (hasArtwork(s.project)) await createRestorePoint('Before restoring', 'before-restore')
  commit(restoredProject(s.project, snap, Date.now()))
  set({ dialog: null, selection: null, playing: false })
  toast('Version restored. Press Ctrl+Z to go back to what you had.', 'success')
}

export async function deleteSnapshotAction(id: string) {
  await removeSnapshot(id)
}

// --------------------------------------------------------- project settings

export interface ProjectSettings {
  name: string
  fps: number
  background: string | null
  width: number
  height: number
  /** which edge/corner of the canvas stays put when resizing (0, .5 or 1) */
  ax: number
  ay: number
}

export function applyProjectSettings(o: ProjectSettings) {
  const s = get()
  if (!s.project) return
  let p = renameProject(s.project, o.name)
  if (o.fps !== p.fps) p = setFps(p, Math.max(1, Math.min(60, Math.round(o.fps))))
  p = setBackground(p, o.background)
  p = resizeCanvas(p, o.width, o.height, o.ax, o.ay)
  commit(p)
}

/** Crops the canvas to a rectangle (art space). */
export function cropAction(r: { x: number; y: number; w: number; h: number }): boolean {
  const s = get()
  if (!s.project) return false
  if (r.w < 64 || r.h < 64) {
    toast('The crop is too small. Canvases are at least 64 × 64.', 'info')
    return false
  }
  if (r.w > 4096 || r.h > 4096) {
    toast('Canvases can be up to 4096 px each way.', 'info')
    return false
  }
  commit(cropCanvas(s.project, r.x, r.y, r.w, r.h))
  set({ crop: null, selection: null })
  window.setTimeout(() => fitView(), 0)
  toast(`Canvas is now ${Math.round(r.w)} × ${Math.round(r.h)}.`, 'success')
  return true
}

/** "Save a copy": a new project from the open one, without leaving the editor. */
export async function saveCopyAction() {
  const s = get()
  if (!s.project) return
  const copy: Project = { ...s.project, id: createProject({ name: 'x', width: 64, height: 64, fps: 12, background: null }).id, name: `${s.project.name} copy`, createdAt: Date.now(), updatedAt: Date.now(), archived: false }
  await saveProject(copy, thumbOf(copy))
  await refreshLibrary()
  toast(`Saved a copy as “${copy.name}”.`, 'success', [{ label: 'Open copy', run: () => navigate({ name: 'editor', id: copy.id }) }])
}

// ------------------------------------------------------------------- camera

let lastCam = { frameId: '', at: 0 }

/** Moves the camera on the current frame (making a key there if needed). Dragging a slider is one undo step. */
export function setCameraPose(patchPose: Partial<CameraPose>, ease?: CameraEase) {
  const s = get()
  const p = s.project
  if (!p) return
  const idx = p.frames.findIndex((f) => f.id === s.frameId)
  if (idx < 0) return
  const now = Date.now()
  const coalesce = lastCam.frameId === s.frameId && now - lastCam.at < 700
  lastCam = { frameId: s.frameId, at: now }
  commit(setCameraKey(p, s.frameId, { ...cameraAt(p, idx), ...patchPose }, ease), { record: !coalesce })
}

export function removeCameraKeyAction() {
  const s = get()
  if (s.project) commit(removeCameraKey(s.project, s.frameId))
}

export function clearCameraAction() {
  const s = get()
  if (s.project) commit(clearCamera(s.project))
}
