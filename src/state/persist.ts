import { isNativeApp, shareNativeFile } from '../native/bridge.ts'
import { renderFinalFrame } from '../engine/render.ts'
import { projectToJSON } from '../engine/serialize.ts'
import { listSnapshots, saveProject, saveSnapshot } from '../engine/storage.ts'
import { shouldAutoSnapshot } from '../engine/versions.ts'
import type { Project } from '../engine/types.ts'
import { store } from './app.ts'
import { autosaveDelay } from './autosaveDelay.ts'
import { toast } from './toast.ts'

let lastSeen: Project | null = null
let timer: number | undefined
let saving = false
/** How long the last save took; big projects wait longer between autosaves so drawing stays smooth. */
let lastSaveMs = 0
let savedListener: ((id: string) => void) | null = null
/** Lets other modules (cloud sync) hear about completed saves without persist depending on them. */
export function setSavedListener(fn: ((id: string) => void) | null) { savedListener = fn }

let thumbMemo: { at: number; id: string; frame: unknown; layers: unknown; camera: unknown; w: number; h: number; bg: string | null; url: string | null } | null = null

/** Project thumbnail. Re-rendered only when what it shows changed, and routine autosaves may reuse one up to `maxAgeMs` old. */
export function thumbOf(p: Project, maxAgeMs = 0): string | null {
  const m = thumbMemo
  if (m && maxAgeMs > 0 && m.id === p.id && Date.now() - m.at < maxAgeMs) return m.url
  if (m && m.frame === p.frames[0] && m.layers === p.layers && m.camera === p.camera && m.w === p.width && m.h === p.height && m.bg === p.background) return m.url
  let url: string | null = null
  try {
    const scale = Math.min(1, 360 / p.width)
    url = renderFinalFrame(p, p.frames[0], { scale, transparent: false }).toDataURL('image/jpeg', 0.8)
  } catch {
    url = null
  }
  thumbMemo = { at: Date.now(), id: p.id, frame: p.frames[0], layers: p.layers, camera: p.camera, w: p.width, h: p.height, bg: p.background, url }
  return url
}

/** Tell autosave that `p` is already on disk (e.g. just opened). */
export function markClean(p: Project | null) {
  lastSeen = p
  window.clearTimeout(timer)
  clearUnsavedFlag()
}

// ---- "closed before saving" flag: set while changes are unsaved, cleared once they are

const FLAG = 'brushx:unsaved'
let flagged = false
export interface UnsavedFlag {
  id: string
  name: string
  at: number
}

function flagUnsaved(p: Project) {
  if (flagged) return
  flagged = true
  try {
    localStorage.setItem(FLAG, JSON.stringify({ id: p.id, name: p.name, at: Date.now() } satisfies UnsavedFlag))
  } catch {
    /* storage blocked: no notice next time */
  }
}

export function clearUnsavedFlag() {
  flagged = false
  try {
    localStorage.removeItem(FLAG)
  } catch {
    /* ignore */
  }
}

export function readUnsavedFlag(): UnsavedFlag | null {
  try {
    const v = JSON.parse(localStorage.getItem(FLAG) ?? 'null') as UnsavedFlag | null
    return v && typeof v.id === 'string' ? v : null
  } catch {
    return null
  }
}

/** Quietly keeps a restore point every few minutes while you work. */
async function maybeAutoSnapshot(p: Project) {
  try {
    const latest = (await listSnapshots(p.id))[0]
    if (shouldAutoSnapshot(latest, p, Date.now())) await saveSnapshot(p, 'auto', thumbOf(p))
  } catch {
    /* restore points are a bonus; never interrupt saving */
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  if (isNativeApp()) {
    shareNativeFile(blob, filename).then((done) => { if (!done) browserDownload(blob, filename) }).catch((e: unknown) => {
      // closing the share sheet counts as a cancel, not a failure
      if (!/cancel/i.test(String((e as Error)?.message ?? e))) toast('Couldn’t save that file. Check that Brush X may use storage.', 'error')
    })
    return
  }
  browserDownload(blob, filename)
}

function browserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function safeName(name: string) {
  return name.replace(/[^a-z0-9-_ ]+/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || 'brushx'
}

export function saveLocalCopy() {
  const { project } = store.getState()
  if (!project) return
  downloadBlob(new Blob([projectToJSON(project)], { type: 'application/json' }), `${safeName(project.name)}.brushx`)
}

let inflight: Promise<boolean> | null = null

/** Saves the open project. If a save is already running, waits for it and then saves anything newer. */
/** `routine` is only for the autosave timer: it may reuse a thumbnail a few seconds old; any other save wants a fresh one. */
export async function saveNow(routine = false): Promise<boolean> {
  while (inflight) await inflight.catch(() => false)
  const run = saveOnce(routine)
  inflight = run
  try {
    return await run
  } finally {
    if (inflight === run) inflight = null
  }
}

async function saveOnce(routine: boolean): Promise<boolean> {
  const { project } = store.getState()
  if (!project) return false
  window.clearTimeout(timer)
  saving = true
  store.setState({ saveStatus: 'saving' })
  try {
    const t0 = performance.now()
    await saveProject(project, thumbOf(project, routine ? 10000 : 0))
    lastSaveMs = performance.now() - t0
    lastSeen = project
    const now = store.getState().project
    store.setState({ saveStatus: now === project ? 'saved' : 'dirty' })
    if (now === project) clearUnsavedFlag()
    void maybeAutoSnapshot(project)
    savedListener?.(project.id)
    saving = false
    if (now !== project) schedule()
    return true
  } catch {
    saving = false
    store.setState({ saveStatus: 'error' })
    toast('Couldn’t save your project. Your work is still open.', 'error', [
      { label: 'Try again', run: () => void saveNow() },
      { label: 'Save local copy', run: saveLocalCopy },
    ])
    return false
  }
}

function schedule() {
  window.clearTimeout(timer)
  timer = window.setTimeout(() => void saveNow(true), autosaveDelay(lastSaveMs))
}

export function startAutosave() {
  const unsub = store.subscribe(() => {
    const { project } = store.getState()
    if (!project || project === lastSeen) return
    flagUnsaved(project)
    if (saving) return
    schedule()
  })
  const flush = () => {
    const { project } = store.getState()
    if (project && project !== lastSeen) void saveNow()
  }
  const onVis = () => {
    if (document.visibilityState === 'hidden') flush()
  }
  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('pagehide', flush)
  return () => {
    unsub()
    document.removeEventListener('visibilitychange', onVis)
    window.removeEventListener('pagehide', flush)
  }
}
