import type { CloudConfig, CloudSession, SessionStore } from './client.ts'
import { normalizeUrl } from './client.ts'
import type { Base } from '../engine/sync.ts'
import type { SyncMemory } from './sync.ts'

const CFG = 'brushx:cloud-config'
const SES = 'brushx:cloud-session'
const MEM = 'brushx:cloud-sync'

const read = <T,>(k: string): T | null => {
  try { return JSON.parse(localStorage.getItem(k) ?? 'null') as T | null } catch { return null }
}
const write = (k: string, v: unknown) => {
  try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage blocked */ }
}

/** Address and public (anon) key of the Supabase project. Build-time env first, then what was typed into Profile. */
export function loadConfig(): CloudConfig | null {
  const env = ((import.meta as { env?: unknown }).env ?? {}) as Record<string, string | undefined>
  const url = normalizeUrl(env.VITE_SUPABASE_URL ?? '')
  if (url && env.VITE_SUPABASE_ANON_KEY) return { url, anonKey: env.VITE_SUPABASE_ANON_KEY }
  const saved = read<CloudConfig>(CFG)
  const u = saved ? normalizeUrl(saved.url) : null
  return u && saved?.anonKey ? { url: u, anonKey: saved.anonKey } : null
}

export const configFromBuild = (): boolean => {
  const env = ((import.meta as { env?: unknown }).env ?? {}) as Record<string, string | undefined>
  return !!normalizeUrl(env.VITE_SUPABASE_URL ?? '') && !!env.VITE_SUPABASE_ANON_KEY
}

export const saveConfig = (c: CloudConfig | null) => write(CFG, c)

export const sessionStore: SessionStore = {
  load: () => read<CloudSession>(SES),
  save: (s) => write(SES, s),
}

interface MemFile {
  lastUser: string | null
  users: Record<string, SyncMemory>
}

const memFile = (): MemFile => read<MemFile>(MEM) ?? { lastUser: null, users: {} }

export function loadMemory(userId: string): SyncMemory {
  const f = memFile()
  const m = f.users[userId]
  return { bases: { ...(m?.bases ?? {}) } as Record<string, Base>, pending: [...(m?.pending ?? [])] }
}

export function saveMemory(userId: string, m: SyncMemory) {
  const f = memFile()
  f.users[userId] = m
  f.lastUser = userId
  write(MEM, f)
}

/** A project was deleted on this device: remember to remove it from the cloud of the last account, if it was ever synced. */
export function recordDelete(projectId: string) {
  const f = memFile()
  const id = f.lastUser
  if (!id || !f.users[id]?.bases[projectId]) return
  const m = f.users[id]
  if (!m.pending.includes(projectId)) m.pending.push(projectId)
  write(MEM, f)
}

export const lastUserId = (): string | null => memFile().lastUser
