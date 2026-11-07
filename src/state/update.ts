import { useSyncExternalStore } from 'react'
import { isNativeApp } from '../native/bridge.ts'
import { APP_VERSION, fetchLatest, isNewer, type UpdateInfo } from '../native/update.ts'

const LAST = 'brushx:update-checked'
const SKIP = 'brushx:update-dismissed'
const CHECK_EVERY = 6 * 3600 * 1000

interface UpdateState { info: UpdateInfo | null; checking: boolean; dismissed: string | null }
let state: UpdateState = { info: null, checking: false, dismissed: read(SKIP) }
const subs = new Set<() => void>()
const set = (p: Partial<UpdateState>) => { state = { ...state, ...p }; subs.forEach((f) => f()) }

function read(k: string): string | null { try { return localStorage.getItem(k) } catch { return null } }
function write(k: string, v: string) { try { localStorage.setItem(k, v) } catch { /* storage blocked: the check just repeats next launch */ } }

/** The web app always loads the newest build by itself; only the installed Android app needs update prompts. */
export const updatesApply = (): boolean => isNativeApp() || read('brushx:update-force') === '1'

export const useUpdate = (): UpdateState => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => state)

export type UpdateResult = 'newer' | 'current' | 'error'

/** Looks for a newer release. `manual` ignores the once-every-6-hours limit and the "Later" choice. */
export async function checkForUpdates(manual = false): Promise<UpdateResult> {
  if (state.checking) return state.info ? 'newer' : 'current'
  if (!manual) {
    if (!updatesApply()) return 'current'
    if (Date.now() - Number(read(LAST) ?? 0) < CHECK_EVERY) return state.info ? 'newer' : 'current'
  }
  set({ checking: true })
  try {
    const latest = await fetchLatest()
    write(LAST, String(Date.now()))
    const info = latest && isNewer(latest.version, APP_VERSION) ? latest : null
    set({ info, checking: false, dismissed: manual ? null : state.dismissed })
    if (manual) { try { localStorage.removeItem(SKIP) } catch { /* ignore */ } }
    return info ? 'newer' : 'current'
  } catch {
    set({ checking: false })
    return 'error'
  }
}

/** "Later": hide this version's banner until an even newer one is published. */
export function dismissUpdate() {
  if (!state.info) return
  write(SKIP, state.info.version)
  set({ dismissed: state.info.version })
}
