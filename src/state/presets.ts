// Custom brush presets: a named brush + its size, opacity, hardness and stabilizer. Stored on this device.
import { isPaintTool, isShapeTool } from '../engine/brushes.ts'
import { patch, setTool, setToolSetting } from './actions.ts'
import { store } from './app.ts'
import { toast } from './toast.ts'

export interface Preset { id: string; name: string; tool: string; size: number; opacity: number; hardness: number; stabilizer: number }

const KEY = 'brushx:presets'
export const MAX_PRESETS = 24
const listeners = new Set<() => void>()
let cache: Preset[] | null = null

export function loadPresets(): Preset[] {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    cache = Array.isArray(parsed) ? parsed.filter((p) => p && typeof p.id === 'string' && typeof p.tool === 'string' && Number.isFinite(p.size)) : []
  } catch {
    cache = []
  }
  return cache as Preset[]
}

function save(list: Preset[]) {
  cache = list
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* storage full or blocked: keep in memory */ }
  version += 1
  listeners.forEach((l) => l())
}

let version = 0
export const presetsVersion = () => version
export const onPresets = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }

export function savePreset(name: string): boolean {
  const s = store.getState()
  const tool = s.tool
  if (!(isPaintTool(tool) || isShapeTool(tool))) return false
  const list = loadPresets()
  if (list.length >= MAX_PRESETS) {
    toast(`You can keep up to ${MAX_PRESETS} presets. Delete one first.`, 'info')
    return false
  }
  const t = s.toolSettings[tool]
  const clean = name.trim().slice(0, 28) || `${tool} ${list.length + 1}`
  save([...list, { id: Math.random().toString(36).slice(2, 10), name: clean, tool, size: t.size, opacity: t.opacity, hardness: t.hardness, stabilizer: s.stabilizer }])
  toast(`Saved preset “${clean}”.`, 'success')
  return true
}

export function applyPreset(id: string) {
  const p = loadPresets().find((x) => x.id === id)
  if (!p) return
  setTool(p.tool as never)
  setToolSetting(p.tool, { size: p.size, opacity: p.opacity, hardness: p.hardness })
  if (isPaintTool(p.tool as never)) patch({ stabilizer: p.stabilizer })
}

export function deletePreset(id: string) {
  save(loadPresets().filter((p) => p.id !== id))
}
