import type { ToolId } from '../engine/types.ts'
import type { IconName } from '../ui/Icon.tsx'

export interface ToolDef { id: ToolId; label: string; icon: IconName; key: string }

export const TOOL_GROUPS: ToolDef[][] = [
  [
    { id: 'select', label: 'Select', icon: 'select', key: 'V' },
    { id: 'lasso', label: 'Lasso select', icon: 'lasso', key: 'L' },
    { id: 'hand', label: 'Hand (pan)', icon: 'hand', key: 'H' },
  ],
  [
    { id: 'pencil', label: 'Pencil', icon: 'pencil', key: 'P' },
    { id: 'ink', label: 'Ink pen', icon: 'ink', key: 'N' },
    { id: 'brush', label: 'Brush', icon: 'brush', key: 'B' },
    { id: 'airbrush', label: 'Airbrush', icon: 'airbrush', key: 'A' },
    { id: 'marker', label: 'Marker', icon: 'marker', key: 'M' },
    { id: 'chalk', label: 'Chalk', icon: 'chalk', key: 'C' },
    { id: 'crayon', label: 'Crayon', icon: 'crayon', key: 'K' },
    { id: 'eraser', label: 'Eraser', icon: 'eraser', key: 'E' },
  ],
  [
    { id: 'fill', label: 'Fill bucket', icon: 'fill', key: 'G' },
    { id: 'eyedropper', label: 'Color picker', icon: 'pipette', key: 'I' },
  ],
  [
    { id: 'line', label: 'Line', icon: 'line', key: 'U' },
    { id: 'rect', label: 'Rectangle', icon: 'rect', key: 'R' },
    { id: 'ellipse', label: 'Ellipse', icon: 'ellipse', key: 'O' },
    { id: 'polygon', label: 'Polygon', icon: 'polygon', key: 'Y' },
    { id: 'bezier', label: 'Curve pen', icon: 'bezier', key: 'W' },
  ],
  [
    { id: 'text', label: 'Text', icon: 'text', key: 'T' },
    { id: 'crop', label: 'Crop canvas', icon: 'crop', key: 'Q' },
  ],
]

export const ALL_TOOLS = TOOL_GROUPS.flat()

// ---- customizable tool keys (stored on this device) ----
const KEY_STORE = 'brushx:keys'
/** Keys the editor uses for other things; tools can't take them. */
export const RESERVED_KEYS = ['X', 'F']
let overrides: Record<string, string> = {}
try {
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY_STORE) : null
  const parsed = raw ? JSON.parse(raw) : null
  if (parsed && typeof parsed === 'object') overrides = parsed
} catch { /* ignore */ }
const listeners = new Set<() => void>()
export const onKeysChanged = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }
const saveKeys = () => {
  try { localStorage.setItem(KEY_STORE, JSON.stringify(overrides)) } catch { /* ignore */ }
  listeners.forEach((l) => l())
}
export const keyOf = (t: ToolDef): string => overrides[t.id] ?? t.key
export const toolByKey = (k: string) => ALL_TOOLS.find((t) => keyOf(t) === k.toUpperCase())
export const hasCustomKeys = () => Object.keys(overrides).length > 0
export function resetKeys() { overrides = {}; saveKeys() }
/** Gives a tool a new key. If another tool has it, the two swap. Returns an error message or null. */
export function setToolKey(id: ToolId, key: string): string | null {
  const k = key.length === 1 ? key.toUpperCase() : ''
  if (!/^[A-Z0-9;'\/\-=`]$/.test(k)) return 'Use a single letter or number.'
  if (RESERVED_KEYS.includes(k)) return `${k} is used by the editor itself (${k === 'X' ? 'mirror' : 'fit view'}).`
  const me = ALL_TOOLS.find((t) => t.id === id)
  if (!me) return 'Unknown tool.'
  const other = ALL_TOOLS.find((t) => t.id !== id && keyOf(t) === k)
  const mine = keyOf(me)
  overrides = { ...overrides, [id]: k }
  if (other) overrides[other.id] = mine
  for (const t of ALL_TOOLS) if (overrides[t.id] === t.key) delete overrides[t.id]
  saveKeys()
  return null
}

export const SHORTCUTS: [string, string][] = [
  ['Undo / Redo', 'Ctrl+Z / Ctrl+Shift+Z'],
  ['Save now', 'Ctrl+S'],
  ['Pan canvas', 'Hold Space and drag'],
  ['Zoom', 'Mouse wheel or pinch'],
  ['Rotate canvas', 'Shift + wheel, or two-finger twist'],
  ['Smaller / larger brush', '[  and  ]'],
  ['Previous / next frame', ',  and  .'],
  ['Play / pause', 'Enter'],
  ['Finish polygon', 'Enter or double-click'],
  ['Cancel / deselect', 'Esc'],
  ['Delete selection', 'Delete or Backspace'],
  ['Nudge selection', 'Arrow keys (Shift = 10 px)'],
  ['Copy / cut / paste selection', 'Ctrl+C / Ctrl+X / Ctrl+V'],
  ['Paste guide as a drawing', 'Ctrl+Shift+V'],
  ['Mirror drawing', 'X'],
  ['Hide / show interface', 'Tab'],
  ['Fit canvas to view', 'F'],
]
