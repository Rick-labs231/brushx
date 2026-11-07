import { holdOf } from './projectOps.ts'
import type { Project } from './types.ts'

export interface AudioTrack {
  name: string
  mime: string
  /** the original file, decoded again when needed */
  data: Uint8Array
  /** seconds */
  duration: number
  /** where the sound starts on the timeline, seconds. Negative = skip the first part of the sound. */
  offset: number
  /** 0..1 */
  volume: number
  muted: boolean
  /** loudness envelope, 0..255, PEAKS_PER_SEC values per second of sound */
  peaks: Uint8Array
}

export const PEAKS_PER_SEC = 100
export const MAX_AUDIO_BYTES = 20 * 1024 * 1024
export const MIN_OFFSET = -600
export const MAX_OFFSET = 3600

/** Loudest sample per window across channels, so the waveform shows the real shape. */
export function computePeaks(channels: Float32Array[], sampleRate: number): Uint8Array {
  const length = channels[0]?.length ?? 0
  const win = Math.max(1, Math.round(sampleRate / PEAKS_PER_SEC))
  const n = Math.ceil(length / win)
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i += 1) {
    let m = 0
    const end = Math.min(length, (i + 1) * win)
    for (const ch of channels) for (let j = i * win; j < end; j += 1) { const v = Math.abs(ch[j]); if (v > m) m = v }
    out[i] = Math.min(255, Math.round(m * 255))
  }
  return out
}

/** Seconds on the timeline where frame `index` starts and ends. */
export function frameSpan(p: Project, index: number): [number, number] {
  let ticks = 0
  for (let i = 0; i < index; i += 1) ticks += holdOf(p.frames[i])
  return [ticks / p.fps, (ticks + holdOf(p.frames[index])) / p.fps]
}

export const timelineSeconds = (p: Project): number => p.frames.reduce((a, f) => a + holdOf(f), 0) / p.fps

/** `n` loudness values (0..1) covering timeline seconds t0..t1. Silence where the sound isn't playing. */
export function peaksForSpan(a: AudioTrack, t0: number, t1: number, n: number): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i += 1) {
    const from = ((t0 + ((t1 - t0) * i) / n) - a.offset) * PEAKS_PER_SEC
    const to = ((t0 + ((t1 - t0) * (i + 1)) / n) - a.offset) * PEAKS_PER_SEC
    const s = Math.max(0, Math.floor(from))
    const e = Math.min(a.peaks.length, Math.max(s + 1, Math.ceil(to)))
    let m = 0
    for (let j = s; j < e; j += 1) if (a.peaks[j] > m) m = a.peaks[j]
    out.push(to <= 0 || from >= a.peaks.length ? 0 : m / 255)
  }
  return out
}

export const setAudioOffset = (p: Project, offset: number): Project =>
  p.audio ? { ...p, updatedAt: Date.now(), audio: { ...p.audio, offset: Math.max(MIN_OFFSET, Math.min(MAX_OFFSET, offset)) } } : p

export const patchAudio = (p: Project, patch: Partial<Pick<AudioTrack, 'volume' | 'muted' | 'offset'>>): Project =>
  p.audio
    ? { ...p, updatedAt: Date.now(), audio: { ...p.audio, ...patch, ...(patch.volume !== undefined ? { volume: Math.max(0, Math.min(1, patch.volume)) } : {}), ...(patch.offset !== undefined ? { offset: Math.max(MIN_OFFSET, Math.min(MAX_OFFSET, patch.offset)) } : {}) } }
    : p

export function removeAudio(p: Project): Project {
  if (!p.audio) return p
  const { audio: _drop, ...rest } = p
  return { ...rest, updatedAt: Date.now() } as Project
}

/**
 * The sound as it should be heard from timeline second t0 to t1, as planar float
 * channels at `outRate` (stereo). Volume and offset applied; silence outside the clip.
 */
export function mixRange(channels: Float32Array[], sampleRate: number, a: Pick<AudioTrack, 'offset' | 'volume' | 'muted'>, t0: number, t1: number, outRate: number): Float32Array[] {
  const n = Math.max(0, Math.round((t1 - t0) * outRate))
  const left = new Float32Array(n)
  const right = new Float32Array(n)
  if (!a.muted && a.volume > 0 && channels.length) {
    const L = channels[0]
    const R = channels[1] ?? channels[0]
    const gain = a.volume
    for (let i = 0; i < n; i += 1) {
      const pos = (t0 + i / outRate - a.offset) * sampleRate
      if (pos < 0) continue
      const i0 = Math.floor(pos)
      if (i0 >= L.length - 1) { if (i0 >= L.length) continue }
      const i1 = Math.min(L.length - 1, i0 + 1)
      const f = pos - i0
      left[i] = (L[i0] + (L[i1] - L[i0]) * f) * gain
      right[i] = (R[i0] + (R[i1] - R[i0]) * f) * gain
    }
  }
  return [left, right]
}
