import { CloudClient, CloudError, normalizeUrl } from '../cloud/client.ts'
import { configFromBuild, loadConfig, loadMemory, recordDelete, saveConfig, saveMemory, sessionStore } from '../cloud/config.ts'
import { runSync, type LocalPort } from '../cloud/sync.ts'
import { uid } from '../engine/ids.ts'
import { listProjects, loadProject, removeProject, saveProject } from '../engine/storage.ts'
import { refreshLibrary } from './actions.ts'
import { parseHash } from './router.ts'
import { store, type CloudState } from './app.ts'
import { setSavedListener, thumbOf } from './persist.ts'
import { toast } from './toast.ts'

let client: CloudClient | null = null
let running: Promise<void> | null = null
let again = false
let debounce = 0
const AUTO_KEY = 'brushx:cloud-auto'

const patch = (p: Partial<CloudState>) => store.setState((s) => ({ cloud: { ...s.cloud, ...p } }))

const local: LocalPort = {
  list: async () => (await listProjects()).map((m) => ({ id: m.id, updatedAt: m.updatedAt, thumb: m.thumb })),
  load: loadProject,
  save: saveProject,
  remove: removeProject,
}

function build() {
  const cfg = loadConfig()
  client = cfg ? new CloudClient(cfg, sessionStore) : null
  const user = client?.user ?? null
  patch({
    configured: !!cfg,
    fromBuild: configFromBuild(),
    user,
    bases: user ? loadMemory(user.id).bases : {},
    autoSync: localStorage.getItem(AUTO_KEY) !== 'off',
  })
}

/** Called once at startup. */
export function startCloud() {
  build()
  setSavedListener(() => scheduleSync(8000))
  window.addEventListener('focus', () => { if (shouldAuto() && Date.now() - (store.getState().cloud.lastSync ?? 0) > 60_000) void syncNow() })
  window.addEventListener('online', () => { if (shouldAuto()) void syncNow() })
  if (shouldAuto()) void syncNow()
}

const shouldAuto = () => {
  const c = store.getState().cloud
  return !!client?.user && c.autoSync
}

function scheduleSync(ms: number) {
  if (!shouldAuto()) return
  window.clearTimeout(debounce)
  debounce = window.setTimeout(() => void syncNow(), ms)
}

export function setAutoSync(on: boolean) {
  try { localStorage.setItem(AUTO_KEY, on ? 'on' : 'off') } catch { /* ignore */ }
  patch({ autoSync: on })
  if (on) scheduleSync(500)
}

const explain = (e: unknown) => (e instanceof CloudError ? e.message : e instanceof Error ? e.message : 'Something went wrong.')

// ---------------------------------------------------------------- setup + account

/** Saves the project address and key after checking that they answer like Supabase. */
export async function connectCloud(rawUrl: string, anonKey: string): Promise<boolean> {
  const url = normalizeUrl(rawUrl)
  if (!url) {
    patch({ message: 'The address should look like https://your-project.supabase.co' })
    return false
  }
  const key = anonKey.trim()
  if (!key) {
    patch({ message: 'Paste the project’s anon (public) key.' })
    return false
  }
  try {
    await new CloudClient({ url, anonKey: key }, { load: () => null, save: () => undefined }).ping()
  } catch (e) {
    patch({ message: explain(e) })
    return false
  }
  saveConfig({ url, anonKey: key })
  build()
  patch({ message: null })
  return true
}

export function disconnectCloud() {
  void client?.signOut()
  saveConfig(null)
  client = null
  patch({ configured: false, user: null, bases: {}, status: 'idle', lastSync: null, message: null, usedBytes: 0 })
}

export async function signUpCloud(email: string, password: string): Promise<void> {
  if (!client) return
  patch({ message: null, status: 'idle' })
  try {
    const r = await client.signUp(email.trim(), password)
    if (r.signedIn) { build(); void syncNow() } else patch({ message: 'Check your email and click the confirmation link, then sign in here. If you already have an account, just sign in.' })
  } catch (e) {
    patch({ message: explain(e) })
  }
}

export async function signInCloud(email: string, password: string): Promise<void> {
  if (!client) return
  patch({ message: null, status: 'idle' })
  try {
    await client.signIn(email.trim(), password)
    build()
    void syncNow()
  } catch (e) {
    patch({ message: explain(e) })
  }
}

export async function signOutCloud(): Promise<void> {
  await client?.signOut()
  patch({ user: null, status: 'idle', message: null, lastSync: null })
  toast('Signed out. Your projects stay on this device.', 'info')
}

// -------------------------------------------------------------------- syncing

export function syncNow(): Promise<void> {
  if (running) { again = true; return running }
  running = (async () => {
    do {
      again = false
      await once()
    } while (again)
  })().finally(() => { running = null })
  return running
}

async function once() {
  const c = client
  const user = c?.user
  if (!c || !user) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { patch({ status: 'offline', message: 'You’re offline. Changes will sync when you’re back.' }); return }
  patch({ status: 'syncing', message: null })
  const memory = loadMemory(user.id)
  try {
    const sum = await runSync({ api: c, local, memory, userId: user.id, thumbOf, openId: () => (parseHash(window.location.hash).name === 'editor' ? store.getState().project?.id ?? null : null), newId: uid, now: () => Date.now() })
    saveMemory(user.id, memory)
    const rows = await c.listRows().catch(() => [])
    patch({ status: sum.errors.length ? 'error' : 'idle', lastSync: Date.now(), bases: memory.bases, usedBytes: rows.reduce((a, r) => a + (r.size || 0), 0), message: sum.errors.length ? `${sum.errors.length} project${sum.errors.length === 1 ? '' : 's'} couldn’t sync: ${sum.errors[0].message}` : sum.skipped.length ? 'A project that is open has newer changes in the cloud. It will update once you close it.' : null })
    if (sum.downloaded || sum.removedLocal || sum.conflicts) await refreshLibrary()
    if (sum.conflicts) toast(`${sum.conflicts} project${sum.conflicts === 1 ? ' was' : 's were'} changed on two devices. Both versions are kept; look for “(conflict copy)”.`, 'info')
    if (sum.skipped.length) scheduleSync(15000) // the open project gets updated once it is closed
  } catch (e) {
    saveMemory(user.id, memory)
    const signedOut = e instanceof CloudError && (e.code === 'session_expired' || e.code === 'signed_out')
    patch({ status: 'error', message: explain(e), ...(signedOut ? { user: null } : {}) })
  }
}

/** Called when a project is deleted on this device. */
export function noteLocalDelete(id: string) {
  recordDelete(id)
  scheduleSync(1500)
}
