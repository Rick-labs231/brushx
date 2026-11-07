import { defaultToolSettings, type ToolSettings } from '../engine/brushes.ts'
import { defaultGuide, defaultPerspective, type GuideState, type PerspectiveState } from '../engine/guides.ts'
import { emptyHistory, type History } from '../engine/history.ts'
import type { ProjectMeta } from '../engine/storage.ts'
import type { Project, ShapeFill, Stroke, ToolId, Viewport } from '../engine/types.ts'
import { createStore, useStoreSelector } from './store.ts'

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'success' | 'error'
  actions?: { label: string; run: () => void }[]
}

export interface Prefs {
  uiScale: number
  highContrast: boolean
  leftHanded: boolean
}

export type Dialog = null | 'new-project' | 'export' | 'shortcuts' | 'project' | 'versions' | 'text' | 'crop'
export interface CloudState {
  /** address and key are known (from the build or typed in) */
  configured: boolean
  /** address and key came with the build, so Profile doesn't ask for them */
  fromBuild: boolean
  user: { id: string; email: string } | null
  status: 'idle' | 'syncing' | 'error' | 'offline'
  lastSync: number | null
  message: string | null
  autoSync: boolean
  /** per project: what was in step with the cloud at the last sync (drives card badges) */
  bases: Record<string, { local: number; remote: number }>
  /** cloud storage used, bytes */
  usedBytes: number
}

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

export interface OnionState {
  enabled: boolean
  prev: number
  next: number
  opacity: number
  prevColor: string
  nextColor: string
}

export interface Selection {
  frameId: string
  layerId: string
  ids: string[]
}

export interface Clipboard {
  strokes: Stroke[]
  /** where it was copied from, so pasting on top of the source can nudge it */
  frameId: string
  layerId: string
  pastes: number
}

export interface AppState {
  // library
  library: ProjectMeta[]
  libraryLoaded: boolean
  persistent: boolean
  // open project
  project: Project | null
  history: History<Project>
  frameId: string
  layerId: string
  saveStatus: SaveStatus
  cloud: CloudState
  // tools
  tool: ToolId
  toolSettings: Record<string, ToolSettings>
  color: string
  recentColors: string[]
  stabilizer: number
  symmetry: boolean
  shapeFill: ShapeFill
  fillTolerance: number
  // canvas
  viewport: Viewport
  selection: Selection | null
  clipboard: Clipboard | null
  // animation
  playing: boolean
  loop: boolean
  onion: OnionState
  // guides
  guide: GuideState
  /** a copied guide, kept after the guide is removed so it can be pasted later */
  guideClip: GuideState | null
  /** where the next text goes, and the rectangle the crop dialog is working on (art space) */
  textAt: { x: number; y: number } | null
  crop: { x: number; y: number; w: number; h: number } | null
  favorites: string[]
  perspective: PerspectiveState
  // chrome
  prefs: Prefs
  focusMode: boolean
  drawerOpen: boolean
  dialog: Dialog
  toasts: Toast[]
}

export const PALETTE = ['#F5F7FA', '#168CFF', '#9B5CFF', '#6DB8FF', '#36D399', '#F5B942', '#FF5C6C', '#10131A']

function loadPrefs(): Prefs {
  const fallback: Prefs = { uiScale: 1, highContrast: false, leftHanded: false }
  try {
    const raw = localStorage.getItem('brushx:prefs')
    if (!raw) return fallback
    const p = JSON.parse(raw) as Partial<Prefs>
    return { uiScale: typeof p.uiScale === 'number' ? Math.min(1.3, Math.max(0.85, p.uiScale)) : 1, highContrast: !!p.highContrast, leftHanded: !!p.leftHanded }
  } catch {
    return fallback
  }
}

function loadFavorites(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem('brushx:favorites') ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export const initialState = (): AppState => ({
  library: [],
  libraryLoaded: false,
  persistent: true,
  project: null,
  history: emptyHistory(),
  frameId: '',
  layerId: '',
  saveStatus: 'idle',
  cloud: { configured: false, fromBuild: false, user: null, status: 'idle', lastSync: null, message: null, autoSync: true, bases: {}, usedBytes: 0 },
  tool: 'brush',
  toolSettings: defaultToolSettings(),
  color: '#168CFF',
  recentColors: [],
  stabilizer: 0.2,
  symmetry: false,
  shapeFill: 'none',
  fillTolerance: 32,
  viewport: { panX: 0, panY: 0, zoom: 1, rot: 0 },
  selection: null,
  clipboard: null,
  playing: false,
  loop: true,
  onion: { enabled: true, prev: 1, next: 1, opacity: 0.35, prevColor: '#168CFF', nextColor: '#9B5CFF' },
  guide: defaultGuide(),
  guideClip: null,
  textAt: null,
  crop: null,
  favorites: loadFavorites(),
  perspective: defaultPerspective(),
  prefs: loadPrefs(),
  focusMode: false,
  drawerOpen: false,
  dialog: null,
  toasts: [],
})

export const store = createStore<AppState>(initialState())

export function useApp<S>(selector: (s: AppState) => S): S {
  return useStoreSelector(store, selector)
}
