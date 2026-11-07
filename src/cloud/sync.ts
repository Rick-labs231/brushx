import { planSync, type Base } from '../engine/sync.ts'
import { parseProjectFile, projectToJSON } from '../engine/serialize.ts'
import type { Project } from '../engine/types.ts'
import { CloudError, objectPath, type CloudClient, type RemoteRow } from './client.ts'

export type CloudApi = Pick<CloudClient, 'listRows' | 'upsertRow' | 'deleteRow' | 'upload' | 'download' | 'removeObject'>

export interface LocalMeta {
  id: string
  updatedAt: number
  thumb: string | null
}

export interface LocalPort {
  list(): Promise<LocalMeta[]>
  load(id: string): Promise<Project | null>
  save(p: Project, thumb: string | null): Promise<void>
  remove(id: string): Promise<void>
}

/** What this device remembers about one account's sync. Mutated in place by runSync. */
export interface SyncMemory {
  bases: Record<string, Base>
  /** projects deleted on this device that still need removing from the cloud */
  pending: string[]
}

export interface SyncDeps {
  api: CloudApi
  local: LocalPort
  memory: SyncMemory
  userId: string
  thumbOf: (p: Project) => string | null
  /** the project open in the editor: never overwritten under the user's hands */
  openId: () => string | null
  newId: () => string
  now: () => number
}

export interface SyncSummary {
  uploaded: number
  downloaded: number
  removedLocal: number
  removedRemote: number
  conflicts: number
  skipped: string[]
  errors: { id: string; message: string }[]
}

const enc = new TextEncoder()

const fatal = (e: unknown) => e instanceof CloudError && (e.code === 'session_expired' || e.code === 'signed_out')

export async function runSync(d: SyncDeps): Promise<SyncSummary> {
  const sum: SyncSummary = { uploaded: 0, downloaded: 0, removedLocal: 0, removedRemote: 0, conflicts: 0, skipped: [], errors: [] }
  const { memory: mem } = d

  // two passes: the second picks up conflict copies and anything the first pass changed
  for (let pass = 0; pass < 2; pass += 1) {
    const rows = await d.api.listRows()
    const byId = new Map(rows.map((r) => [r.id, r]))
    const metas = await d.local.list()
    const metaById = new Map(metas.map((m) => [m.id, m]))

    // delete records whose cloud copy is already gone
    mem.pending = mem.pending.filter((id) => {
      if (byId.has(id)) return true
      delete mem.bases[id]
      return false
    })

    const actions = planSync(metas.map((m) => ({ id: m.id, updatedAt: m.updatedAt })), rows.map((r) => ({ id: r.id, updatedAt: r.updated_at })), mem.bases, new Set(mem.pending))
    if (!actions.length) break

    for (const a of actions) {
      const open = d.openId() === a.id
      try {
        if (a.kind === 'upload') {
          const at = metaById.get(a.id)?.updatedAt
          if (at !== undefined && oversized.get(a.id) === at) { if (!sum.skipped.includes(a.id)) sum.skipped.push(a.id); continue }
          await upload(d, a.id, metaById.get(a.id)?.thumb ?? null)
          sum.uploaded += 1
        } else if (a.kind === 'download') {
          if (open) { if (!sum.skipped.includes(a.id)) sum.skipped.push(a.id); continue }
          const row = byId.get(a.id)!
          const fresh = await download(d, row, metaById.get(a.id)?.updatedAt ?? null)
          if (!fresh) { if (!sum.skipped.includes(a.id)) sum.skipped.push(a.id); continue }
          sum.downloaded += 1
        } else if (a.kind === 'delete-local') {
          if (open || (await changedLocally(d, a.id, metaById.get(a.id)?.updatedAt))) { if (!sum.skipped.includes(a.id)) sum.skipped.push(a.id); continue }
          await d.local.remove(a.id)
          delete mem.bases[a.id]
          sum.removedLocal += 1
        } else if (a.kind === 'delete-remote') {
          await d.api.deleteRow(a.id)
          await d.api.removeObject(objectPath(d.userId, a.id)).catch(() => undefined)
          mem.pending = mem.pending.filter((x) => x !== a.id)
          delete mem.bases[a.id]
          sum.removedRemote += 1
        } else {
          if (open) { if (!sum.skipped.includes(a.id)) sum.skipped.push(a.id); continue }
          await resolveConflict(d, byId.get(a.id)!, metaById.get(a.id)?.thumb ?? null)
          sum.conflicts += 1
        }
      } catch (e) {
        if (fatal(e)) throw e
        sum.errors.push({ id: a.id, message: e instanceof Error ? e.message : String(e) })
      }
    }
    if (sum.errors.length) break // don't loop on a failing item
  }
  return sum
}

/** True when the stored copy changed (or the project was opened) since the plan was made. */
async function changedLocally(d: SyncDeps, id: string, plannedAt: number | undefined): Promise<boolean> {
  if (d.openId() === id) return true
  const now = (await d.local.list()).find((m) => m.id === id)
  return !now || now.updatedAt !== plannedAt
}

/** Projects bigger than this are kept local: the Supabase free tier rejects objects over 50 MB. */
export const MAX_SYNC_BYTES = 45 * 1024 * 1024
/** project id -> updatedAt of a version already found too big, so it isn't re-encoded on every save */
const oversized = new Map<string, number>()

async function upload(d: SyncDeps, id: string, thumb: string | null) {
  const p = await d.local.load(id)
  if (!p) return
  const bytes = enc.encode(projectToJSON(p))
  if (bytes.length > MAX_SYNC_BYTES) oversized.set(id, p.updatedAt)
  if (bytes.length > MAX_SYNC_BYTES) throw new Error(`“${p.name}” is too big to sync (${Math.round(bytes.length / 1048576)} MB, limit ${Math.round(MAX_SYNC_BYTES / 1048576)} MB). It stays on this device.`)
  await d.api.upload(objectPath(d.userId, id), bytes) // file first, so a row never points at nothing
  await d.api.upsertRow({
    id,
    name: p.name,
    updated_at: p.updatedAt,
    created_at: p.createdAt,
    archived: p.archived,
    size: bytes.length,
    thumb,
    frames: p.frames.length,
    width: p.width,
    height: p.height,
    fps: p.fps,
  })
  d.memory.bases[id] = { local: p.updatedAt, remote: p.updatedAt }
}

async function fetchRemote(d: SyncDeps, id: string): Promise<Project> {
  const p = parseProjectFile(await d.api.download(objectPath(d.userId, id)))
  if (p.id !== id) throw new Error('The cloud copy belongs to a different project.')
  return p
}

/** Returns false (and writes nothing) if the local copy changed or was opened while the download ran. */
async function download(d: SyncDeps, row: RemoteRow, plannedAt: number | null = null): Promise<boolean> {
  const p = await fetchRemote(d, row.id)
  if (d.openId() === row.id) return false
  if (plannedAt !== null && (await changedLocally(d, row.id, plannedAt))) return false
  await d.local.save(p, row.thumb ?? d.thumbOf(p))
  d.memory.bases[row.id] = { local: p.updatedAt, remote: row.updated_at }
  return true
}

/** Both sides changed: the newer one keeps the name, the other is kept as "(conflict copy)". Nothing is lost. */
async function resolveConflict(d: SyncDeps, row: RemoteRow, localThumb: string | null) {
  const mine = await d.local.load(row.id)
  if (!mine) return download(d, row)
  const theirs = await fetchRemote(d, row.id)
  const remoteWins = theirs.updatedAt > mine.updatedAt
  const loser = remoteWins ? mine : theirs
  const now = d.now()
  const copy: Project = { ...loser, id: d.newId(), name: `${loser.name} (conflict copy)`, createdAt: now, updatedAt: now, archived: false }
  await d.local.save(copy, d.thumbOf(copy))
  if (remoteWins) {
    await d.local.save(theirs, row.thumb ?? d.thumbOf(theirs))
    d.memory.bases[row.id] = { local: theirs.updatedAt, remote: row.updated_at }
  } else {
    await upload(d, row.id, localThumb)
  }
}
