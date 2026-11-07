// Tour state: which tour is running, which step, and which tours the person has already seen.
import { useSyncExternalStore } from 'react'
import type { TourId } from './steps.ts'

interface Saved { seen: Partial<Record<TourId, boolean>>; off: boolean }
const KEY = 'brushx:tours'

function load(): Saved {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (p && typeof p === 'object') return { seen: p.seen && typeof p.seen === 'object' ? p.seen : {}, off: !!p.off }
  } catch { /* storage blocked: tours just show again next time */ }
  return { seen: {}, off: false }
}

let saved = load()
let state = { active: null as TourId | null, index: 0 }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)) } catch { /* ignore */ } }

export const subscribeTour = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }
export const getTour = () => state
export const useTour = () => useSyncExternalStore(subscribeTour, getTour)

export function startTour(id: TourId) { state = { active: id, index: 0 }; emit() }
export function gotoStep(i: number) { state = { ...state, index: Math.max(0, i) }; emit() }

/** Ends the running tour and remembers it as seen. */
export function endTour() {
  if (state.active) saved = { ...saved, seen: { ...saved.seen, [state.active]: true } }
  persist()
  state = { active: null, index: 0 }
  emit()
}

/** "Don't show guides again": stops all automatic tours. */
export function turnOffTours() { saved = { ...saved, off: true }; endTour() }
export function turnOnTours() { saved = { seen: {}, off: false }; persist(); emit() }
export const toursOff = () => saved.off
export const hasSeen = (id: TourId) => !!saved.seen[id]

/** Automatic tours are skipped in automated browsers so they don't block test clicks (set brushx:tour-force to override). */
export function shouldAutoStart(id: TourId): boolean {
  if (saved.off || saved.seen[id] || state.active) return false
  try {
    if (navigator.webdriver && !localStorage.getItem('brushx:tour-force')) return false
  } catch { /* ignore */ }
  return true
}
