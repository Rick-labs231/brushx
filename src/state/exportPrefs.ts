// What the export dialog remembers between visits, and which format it opens on.

export type ExportKind = 'png' | 'gif' | 'seq' | 'video'
const KIND = 'brushx:export-kind'
const FORMAT = 'brushx:export-vformat'
const MARK = 'brushx:export-watermark'

const get = (k: string): string | null => { try { return localStorage.getItem(k) } catch { return null } }
const put = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* storage blocked: it just won't be remembered */ } }

/** A single drawing opens on PNG. An animation opens on Video, or on the moving format the person used last. */
export function pickDefaultKind(frameCount: number, remembered: string | null): ExportKind {
  if (frameCount <= 1) return 'png'
  return remembered === 'gif' || remembered === 'seq' || remembered === 'video' ? remembered : 'video'
}

export const loadKind = (frameCount: number): ExportKind => pickDefaultKind(frameCount, get(KIND))
export const saveKind = (k: ExportKind) => put(KIND, k)
export const loadVideoFormat = (): 'mp4' | 'webm' => (get(FORMAT) === 'webm' ? 'webm' : 'mp4')
export const saveVideoFormat = (f: 'mp4' | 'webm') => put(FORMAT, f)
/** The watermark is on unless the person switched it off. */
export const loadWatermark = (): boolean => get(MARK) !== '0'
export const saveWatermark = (on: boolean) => put(MARK, on ? '1' : '0')
