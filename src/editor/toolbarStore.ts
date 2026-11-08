import { useSyncExternalStore } from 'react'
import { ALL_TOOLBAR_IDS, DEFAULT_TOOLBAR, sanitizeToolbar, toggleId } from './toolbarModel.ts'

const KEY = 'brushx:toolbar'
function load(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? sanitizeToolbar(JSON.parse(raw)) : [...DEFAULT_TOOLBAR]
  } catch { return [...DEFAULT_TOOLBAR] }
}
let ids = load()
const subs = new Set<() => void>()
function set(next: string[]) {
  ids = next
  try { localStorage.setItem(KEY, JSON.stringify(ids)) } catch { /* storage blocked: the choice lasts until the app closes */ }
  subs.forEach((f) => f())
}
export const toggleToolbarTool = (id: string) => set(toggleId(ids, id))
export const resetToolbar = () => set([...DEFAULT_TOOLBAR])
export const showAllTools = () => set([...ALL_TOOLBAR_IDS])
export const useToolbarIds = (): string[] => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => ids)
