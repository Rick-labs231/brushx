// Decides what a sync should do. Pure: no network, no storage.
// Rule of thumb: never destroy work. When unsure, keep both copies.

export interface LocalInfo {
  id: string
  updatedAt: number
}

export interface RemoteInfo {
  id: string
  updatedAt: number
}

/** Timestamps both sides had at the last successful sync of this project. */
export interface Base {
  local: number
  remote: number
}

export type SyncAction =
  | { kind: 'upload'; id: string }
  | { kind: 'download'; id: string }
  /** deleted on another device and not touched here since */
  | { kind: 'delete-local'; id: string }
  /** deleted on this device */
  | { kind: 'delete-remote'; id: string }
  /** changed on both sides: keep the newer, save the other as a copy */
  | { kind: 'conflict'; id: string }

export function planSync(local: LocalInfo[], remote: RemoteInfo[], bases: Record<string, Base>, pendingDeletes: ReadonlySet<string>): SyncAction[] {
  const L = new Map(local.map((x) => [x.id, x]))
  const R = new Map(remote.map((x) => [x.id, x]))
  const out: SyncAction[] = []
  const ids = new Set([...L.keys(), ...R.keys(), ...pendingDeletes])
  for (const id of ids) {
    const l = L.get(id)
    const r = R.get(id)
    const base = bases[id]
    if (pendingDeletes.has(id) && !l) {
      if (r) out.push({ kind: 'delete-remote', id })
      continue
    }
    if (l && !r) {
      // it was on the cloud before and now isn't: someone deleted it. Only follow that if we haven't edited it since.
      if (base && l.updatedAt === base.local) out.push({ kind: 'delete-local', id })
      else out.push({ kind: 'upload', id })
    } else if (!l && r) {
      out.push({ kind: 'download', id })
    } else if (l && r) {
      if (!base) {
        if (l.updatedAt !== r.updatedAt) out.push({ kind: 'conflict', id })
        continue
      }
      const localChanged = l.updatedAt !== base.local
      const remoteChanged = r.updatedAt !== base.remote
      if (localChanged && remoteChanged) out.push({ kind: 'conflict', id })
      else if (localChanged) out.push({ kind: 'upload', id })
      else if (remoteChanged) out.push({ kind: 'download', id })
    }
  }
  return out
}

export type SyncBadge = 'synced' | 'waiting' | 'new'

/** What to show on a project card: in step with the cloud, changed since, or never uploaded. */
export function badgeFor(local: LocalInfo, base: Base | undefined): SyncBadge {
  if (!base) return 'new'
  return local.updatedAt === base.local ? 'synced' : 'waiting'
}
