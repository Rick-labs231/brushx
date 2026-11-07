import { Doc } from './doc'
import type { Project } from './types'
import { canvasToBlob, clone, ctx2d, makeCanvas, uid } from './util'
import { frameThumb } from './render'
import { makeZip, readZip } from './zip'

const DB_NAME = 'brushx'
const STORES = ['projects', 'cels', 'audio'] as const
let dbp: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => STORES.forEach((s) => { if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s) })
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('Storage unavailable'))
    })
  }
  return dbp
}

const wrap = <T,>(r: IDBRequest<T>): Promise<T> =>
  new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })

const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error) })

export async function listProjects(): Promise<Project[]> {
  const db = await open()
  const all = await wrap(db.transaction('projects').objectStore('projects').getAll() as IDBRequest<Project[]>)
  return all.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function saveDoc(doc: Doc): Promise<void> {
  const p = doc.project
  const t = frameThumb(doc, 0, 360)
  if (t) p.thumbnail = t.canvas.toDataURL('image/jpeg', 0.82)
  const keys = [...doc.dirty]
  const blobs = await Promise.all(keys.map(async (k) => {
    const c = doc.cels.get(k)
    return c ? ([k, await canvasToBlob(c)] as const) : null
  }))
  const valid = new Set<string>()
  for (const f of p.frames) for (const l of p.layers) valid.add(Doc.celKey(f.id, l.id))
  const db = await open()
  const tx = db.transaction(['projects', 'cels', 'audio'], 'readwrite')
  const projects = tx.objectStore('projects')
  const cels = tx.objectStore('cels')
  projects.put(clone(p), p.id)
  for (const b of blobs) if (b && valid.has(b[0])) cels.put(b[1], `${p.id}/${b[0]}`)
  // drop cels that no longer belong to the project
  const range = IDBKeyRange.bound(`${p.id}/`, `${p.id}/￿`)
  const cur = cels.openKeyCursor(range)
  cur.onsuccess = () => {
    const c = cur.result
    if (!c) return
    const k = String(c.key).slice(p.id.length + 1)
    if (!valid.has(k)) cels.delete(c.key)
    c.continue()
  }
  if (doc.audioDirty) {
    if (doc.audioBlob && p.audio) tx.objectStore('audio').put(doc.audioBlob, p.id)
    else tx.objectStore('audio').delete(p.id)
  }
  await done(tx)
  keys.forEach((k) => doc.dirty.delete(k))
  doc.metaDirty = false
  doc.audioDirty = false
}

async function blobToCanvas(blob: Blob, w: number, h: number): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(blob)
  const c = makeCanvas(w, h)
  ctx2d(c).drawImage(bmp, 0, 0)
  bmp.close()
  return c
}

export async function loadDoc(id: string): Promise<Doc> {
  const db = await open()
  const tx = db.transaction(['projects', 'cels', 'audio'])
  const project = await wrap(tx.objectStore('projects').get(id) as IDBRequest<Project | undefined>)
  if (!project) throw new Error('Project not found')
  const cels = tx.objectStore('cels')
  const range = IDBKeyRange.bound(`${id}/`, `${id}/￿`)
  const keys = (await wrap(cels.getAllKeys(range))) as string[]
  const vals = (await wrap(cels.getAll(range))) as Blob[]
  const audio = (await wrap(tx.objectStore('audio').get(id))) as Blob | undefined
  const doc = new Doc(project)
  await Promise.all(keys.map(async (k, i) => {
    doc.cels.set(k.slice(id.length + 1), await blobToCanvas(vals[i], project.width, project.height))
  }))
  doc.audioBlob = audio ?? null
  return doc
}

export async function deleteProject(id: string): Promise<void> {
  const db = await open()
  const tx = db.transaction(['projects', 'cels', 'audio'], 'readwrite')
  tx.objectStore('projects').delete(id)
  tx.objectStore('cels').delete(IDBKeyRange.bound(`${id}/`, `${id}/￿`))
  tx.objectStore('audio').delete(id)
  await done(tx)
}

export async function duplicateProject(id: string): Promise<Project> {
  const src = await loadDoc(id)
  const p = clone(src.project)
  p.id = uid() + uid()
  p.name = `${p.name} copy`
  p.createdAt = p.updatedAt = Date.now()
  const copy = new Doc(p)
  src.cels.forEach((c, k) => {
    const n = makeCanvas(p.width, p.height)
    ctx2d(n).drawImage(c, 0, 0)
    copy.cels.set(k, n)
    copy.dirty.add(k)
  })
  copy.audioBlob = src.audioBlob
  copy.audioDirty = !!src.audioBlob
  await saveDoc(copy)
  return copy.project
}

export async function patchProject(id: string, change: Partial<Project>): Promise<void> {
  const db = await open()
  const tx = db.transaction('projects', 'readwrite')
  const st = tx.objectStore('projects')
  const cur = await wrap(st.get(id) as IDBRequest<Project | undefined>)
  if (cur) st.put({ ...cur, ...change, updatedAt: Date.now() }, id)
  await done(tx)
}

/** Backup / transfer: a .brushx file is a zip of project.json + one PNG per cel (+ audio). */
export async function exportProjectFile(doc: Doc): Promise<Blob> {
  const enc = new TextEncoder()
  const entries = [{ name: 'project.json', data: enc.encode(JSON.stringify(doc.project)) }]
  for (const f of doc.project.frames) {
    for (const l of doc.project.layers) {
      const c = doc.peekCel(f.id, l.id)
      if (!c) continue
      entries.push({ name: `cels/${Doc.celKey(f.id, l.id)}.png`, data: new Uint8Array(await (await canvasToBlob(c)).arrayBuffer()) })
    }
  }
  if (doc.audioBlob) entries.push({ name: 'audio.bin', data: new Uint8Array(await doc.audioBlob.arrayBuffer()) })
  return makeZip(entries)
}

export async function importProjectFile(file: File): Promise<Project> {
  const entries = readZip(await file.arrayBuffer())
  const pj = entries.find((e) => e.name === 'project.json')
  if (!pj) throw new Error('This file is not a Brush X project')
  const p = JSON.parse(new TextDecoder().decode(pj.data)) as Project
  p.id = uid() + uid()
  p.name = `${p.name} (imported)`
  p.createdAt = p.updatedAt = Date.now()
  const doc = new Doc(p)
  for (const e of entries) {
    const m = /^cels\/(.+)\.png$/.exec(e.name)
    if (!m) continue
    doc.cels.set(m[1], await blobToCanvas(new Blob([e.data as BlobPart], { type: 'image/png' }), p.width, p.height))
    doc.dirty.add(m[1])
  }
  const au = entries.find((e) => e.name === 'audio.bin')
  if (au) { doc.audioBlob = new Blob([au.data as BlobPart]); doc.audioDirty = true }
  await saveDoc(doc)
  return doc.project
}
