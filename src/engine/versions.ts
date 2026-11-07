import type { Project } from './types.ts'

// Restore points. Pure policy so it can be tested without a database.

export type SnapshotKind = 'auto' | 'manual' | 'before-restore'

export interface SnapshotMeta {
  id: string
  projectId: string
  createdAt: number
  kind: SnapshotKind
  note: string
  frames: number
  layers: number
  /** project.updatedAt at the time, to tell whether anything changed since */
  projectUpdatedAt: number
  thumb: string | null
}

export const AUTO_INTERVAL_MS = 5 * 60 * 1000
export const MAX_AUTO = 8
export const MAX_KEPT = 20 // manual + before-restore

/** A project with nothing drawn yet isn't worth a restore point. */
export const hasArtwork = (p: Project): boolean => p.layers.some((l) => (l.base?.length ?? 0) > 0) || p.frames.some((f) => Object.values(f.cels).some((c) => c.length > 0))

/** Pixel bytes held by imported pictures, video frames and text (shared strokes counted once). */
export function bitmapBytes(p: Project): number {
  const seen = new Set<unknown>()
  let n = 0
  const add = (list: readonly { bitmap?: { data: Uint8ClampedArray } }[]) => {
    for (const s of list) {
      const d = s.bitmap?.data
      if (d && !seen.has(d)) { seen.add(d); n += d.length }
    }
  }
  for (const l of p.layers) if (l.base) add(l.base)
  for (const f of p.frames) for (const c of Object.values(f.cels)) add(c)
  return n
}

/** Above this, automatic restore points are skipped: each one would copy every pixel. */
export const AUTO_SNAPSHOT_MAX_BYTES = 24 * 1024 * 1024

/** Auto restore points: at most one per interval, and only if the work changed. */
export function shouldAutoSnapshot(latest: SnapshotMeta | undefined, p: Project, now: number): boolean {
  if (!hasArtwork(p)) return false
  if (bitmapBytes(p) > AUTO_SNAPSHOT_MAX_BYTES) return false
  if (!latest) return true
  return now - latest.createdAt >= AUTO_INTERVAL_MS && p.updatedAt > latest.projectUpdatedAt
}

/** Ids to delete so we keep the newest MAX_AUTO auto points and the newest MAX_KEPT others. */
export function snapshotsToPrune(list: SnapshotMeta[]): string[] {
  const newest = [...list].sort((a, b) => b.createdAt - a.createdAt)
  const auto = newest.filter((s) => s.kind === 'auto')
  const kept = newest.filter((s) => s.kind !== 'auto')
  return [...auto.slice(MAX_AUTO), ...kept.slice(MAX_KEPT)].map((s) => s.id)
}

/** What a restore produces: the old drawing, but this project's identity, name and archive state. */
export function restoredProject(current: Project, snap: Project, now: number): Project {
  // restore points leave the sound out (it's big); the current sound stays
  const { audio: _a, ...rest } = snap
  return { ...rest, ...(current.audio ? { audio: current.audio } : {}), id: current.id, name: current.name, createdAt: current.createdAt, archived: current.archived, updatedAt: now } as Project
}
