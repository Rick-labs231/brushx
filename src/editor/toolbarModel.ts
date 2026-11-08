// Which tools sit on the toolbar. The full set is always available from the "+" picker,
// and every tool keeps its keyboard shortcut whether or not it is on the toolbar.
import { ALL_TOOLS } from './tools.ts'

export const SYMMETRY_ID = 'symmetry'
/** The popular, beginner-friendly starting set. */
export const DEFAULT_TOOLBAR: string[] = ['select', 'hand', 'pencil', 'brush', 'eraser', 'fill', 'eyedropper', SYMMETRY_ID]
export const ALL_TOOLBAR_IDS: string[] = [...ALL_TOOLS.map((t) => t.id as string), SYMMETRY_ID]

/** Keeps only known ids, removes repeats and puts them in the toolbar's fixed order. Empty or unreadable → the default set. */
export function sanitizeToolbar(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_TOOLBAR]
  const want = new Set(raw.filter((x): x is string => typeof x === 'string'))
  const out = ALL_TOOLBAR_IDS.filter((id) => want.has(id))
  return out.length ? out : [...DEFAULT_TOOLBAR]
}

/** Adds the tool if it is missing, removes it if it is there. Never leaves the toolbar empty. */
export function toggleId(current: string[], id: string): string[] {
  if (!ALL_TOOLBAR_IDS.includes(id)) return current
  const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
  return sanitizeToolbar(next.length ? next : current)
}
