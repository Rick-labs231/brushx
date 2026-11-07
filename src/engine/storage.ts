import type { Project } from './types.ts'
import type { SnapshotKind, SnapshotMeta } from './versions.ts'
import { snapshotsToPrune } from './versions.ts'
import { uid } from './ids.ts'

export interface ProjectMeta {
  id: string
  name: string
  width: number
  height: number
  fps: number
  frames: number
  updatedAt: number
  createdAt: number
  archived: boolean
  thumb: string | null
}

const DB_NAME = 'brushx'
const DB_VERSION = 3

let dbPromise: Promise<IDBDatabase | null> | null = null
// Used when IndexedDB is unavailable (private windows, locked-down webviews).
const memProjects = new Map<string, Project>()
const memMeta = new Map<string, ProjectMeta>()
const savedAudio = new Map<string, Uint8Array>()
const memSnapMeta = new Map<string, SnapshotMeta>()
const memSnapData = new Map<string, Project>()
export let persistent = true

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') throw new Error('no idb')
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        for (const name of ['projects', 'meta', 'snapMeta', 'snapData', 'audio']) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => {
        persistent = false
        resolve(null)
      }
      req.onblocked = () => {
        persistent = false
        resolve(null)
      }
    } catch {
      persistent = false
      resolve(null)
    }
  })
  return dbPromise
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function metaOf(p: Project, thumb: string | null): ProjectMeta {
  return {
    id: p.id,
    name: p.name,
    width: p.width,
    height: p.height,
    fps: p.fps,
    frames: p.frames.length,
    updatedAt: p.updatedAt,
    createdAt: p.createdAt,
    archived: p.archived,
    thumb,
  }
}

export async function saveProject(p: Project, thumb: string | null): Promise<void> {
  const meta = metaOf(p, thumb)
  const db = await openDb()
  if (!db) {
    memProjects.set(p.id, p)
    memMeta.set(p.id, meta)
    return
  }
  // The sound is big and rarely changes, so it lives in its own store and is only rewritten when it does.
  const audio = p.audio?.data
  const stored: Project = p.audio ? { ...p, audio: { ...p.audio, data: new Uint8Array(0) } } : p
  const tx = db.transaction(['projects', 'meta', 'audio'], 'readwrite')
  tx.objectStore('projects').put(stored, p.id)
  tx.objectStore('meta').put(meta, p.id)
  if (audio && savedAudio.get(p.id) !== audio) tx.objectStore('audio').put(audio, p.id)
  else if (!audio) tx.objectStore('audio').delete(p.id)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('save aborted'))
  })
  if (audio) savedAudio.set(p.id, audio)
  else savedAudio.delete(p.id)
}

export async function listProjects(): Promise<ProjectMeta[]> {
  const db = await openDb()
  const metas = db ? await wrap(db.transaction('meta').objectStore('meta').getAll() as IDBRequest<ProjectMeta[]>) : [...memMeta.values()]
  return metas.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function loadProject(id: string): Promise<Project | null> {
  const db = await openDb()
  if (!db) return memProjects.get(id) ?? null
  const p = ((await wrap(db.transaction('projects').objectStore('projects').get(id))) as Project | undefined) ?? null
  if (p?.audio && p.audio.data.length === 0) {
    const data = (await wrap(db.transaction('audio').objectStore('audio').get(id))) as Uint8Array | undefined
    if (!data) {
      const { audio: _lost, ...rest } = p
      return rest as Project
    }
    savedAudio.set(id, data)
    return { ...p, audio: { ...p.audio, data } }
  }
  return p
}

export async function removeProject(id: string): Promise<void> {
  await removeSnapshotsFor(id)
  const db = await openDb()
  if (!db) {
    memProjects.delete(id)
    memMeta.delete(id)
    return
  }
  savedAudio.delete(id)
  const tx = db.transaction(['projects', 'meta', 'audio'], 'readwrite')
  tx.objectStore('projects').delete(id)
  tx.objectStore('meta').delete(id)
  tx.objectStore('audio').delete(id)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function isPersistent(): Promise<boolean> {
  await openDb()
  return persistent
}

// ---------------------------------------------------------------- restore points

export async function listSnapshots(projectId: string): Promise<SnapshotMeta[]> {
  const db = await openDb()
  const all = db ? await wrap(db.transaction('snapMeta').objectStore('snapMeta').getAll() as IDBRequest<SnapshotMeta[]>) : [...memSnapMeta.values()]
  return all.filter((s) => s.projectId === projectId).sort((a, b) => b.createdAt - a.createdAt)
}

export async function loadSnapshot(id: string): Promise<Project | null> {
  const db = await openDb()
  if (!db) return memSnapData.get(id) ?? null
  return ((await wrap(db.transaction('snapData').objectStore('snapData').get(id))) as Project | undefined) ?? null
}

export async function removeSnapshot(id: string): Promise<void> {
  const db = await openDb()
  if (!db) {
    memSnapMeta.delete(id)
    memSnapData.delete(id)
    return
  }
  const tx = db.transaction(['snapMeta', 'snapData'], 'readwrite')
  tx.objectStore('snapMeta').delete(id)
  tx.objectStore('snapData').delete(id)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function removeSnapshotsFor(projectId: string): Promise<void> {
  for (const s of await listSnapshots(projectId)) await removeSnapshot(s.id)
}

/** Stores a restore point and trims old ones. */
export async function saveSnapshot(full: Project, kind: SnapshotKind, thumb: string | null, note = ''): Promise<SnapshotMeta> {
  // restore points leave the sound out: it's large and 20 copies would fill the disk
  const { audio: _audio, ...noSound } = full
  const p = noSound as Project
  const meta: SnapshotMeta = {
    id: uid(),
    projectId: p.id,
    createdAt: Date.now(),
    kind,
    note: note.trim().slice(0, 80),
    frames: p.frames.length,
    layers: p.layers.length,
    projectUpdatedAt: p.updatedAt,
    thumb,
  }
  const db = await openDb()
  if (!db) {
    memSnapMeta.set(meta.id, meta)
    memSnapData.set(meta.id, p)
  } else {
    const tx = db.transaction(['snapMeta', 'snapData'], 'readwrite')
    tx.objectStore('snapMeta').put(meta, meta.id)
    tx.objectStore('snapData').put(p, meta.id)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('snapshot aborted'))
    })
  }
  for (const id of snapshotsToPrune(await listSnapshots(p.id))) await removeSnapshot(id)
  return meta
}
