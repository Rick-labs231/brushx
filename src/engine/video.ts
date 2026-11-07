import type { Beat } from './projectOps.ts'

export type VideoQuality = 'low' | 'medium' | 'high'

export interface VideoPreset {
  id: string
  label: string
  /** null = use the project's own size (times the chosen scale) */
  w: number | null
  h: number | null
  fps: number | null
  note?: string
}

/** Sizes the social platforms ask for. Artwork is scaled to fit and centred. */
export const VIDEO_PRESETS: VideoPreset[] = [
  { id: 'project', label: 'Project size', w: null, h: null, fps: null },
  { id: 'youtube', label: 'YouTube', w: 1920, h: 1080, fps: 30, note: '1920×1080, 30 fps' },
  { id: 'tiktok', label: 'TikTok', w: 1080, h: 1920, fps: 30, note: '1080×1920, 30 fps' },
  { id: 'instagram', label: 'Instagram Reel', w: 1080, h: 1920, fps: 30, note: '1080×1920, 30 fps' },
  { id: 'instagram-post', label: 'Instagram Post', w: 1080, h: 1350, fps: 30, note: '1080×1350 (4:5), 30 fps' },
  { id: 'x', label: 'X', w: 1280, h: 720, fps: 30, note: '1280×720, 30 fps' },
]

export const presetById = (id: string) => VIDEO_PRESETS.find((p) => p.id === id) ?? VIDEO_PRESETS[0]

/** H.264 and most players need even dimensions. */
export const evenDim = (n: number) => Math.max(2, Math.round(n) - (Math.round(n) % 2))

export interface Fit {
  x: number
  y: number
  w: number
  h: number
}

/** Largest centred rectangle of the source's shape that fits inside the target. */
export function fitContain(srcW: number, srcH: number, dstW: number, dstH: number): Fit {
  const k = Math.min(dstW / srcW, dstH / srcH)
  const w = srcW * k
  const h = srcH * k
  return { x: (dstW - w) / 2, y: (dstH - h) / 2, w, h }
}

const BPP: Record<VideoQuality, number> = { low: 0.05, medium: 0.1, high: 0.18 }

export function videoBitrate(w: number, h: number, fps: number, q: VideoQuality): number {
  return Math.max(250_000, Math.round(w * h * fps * BPP[q]))
}

/** Seconds of animation in a sequence. */
export const sequenceSeconds = (seq: Beat[], projectFps: number) => seq.reduce((a, b) => a + b.ticks, 0) / projectFps

/** How many video frames cover the animation at the export rate. */
export function videoFrameCount(seq: Beat[], projectFps: number, outFps: number): number {
  return Math.max(1, Math.round(sequenceSeconds(seq, projectFps) * outFps))
}

/** Which beat is on screen at video frame k. Holds keep their length even when the rates differ. */
export function beatAtVideoFrame(seq: Beat[], k: number, projectFps: number, outFps: number): number {
  const tick = Math.floor((k * projectFps) / outFps + 1e-6)
  let acc = 0
  for (let i = 0; i < seq.length; i += 1) {
    acc += seq[i].ticks
    if (tick < acc) return i
  }
  return seq.length - 1
}

export type VideoFormat = 'mp4' | 'webm'
export const VIDEO_CODEC: Record<VideoFormat, string> = { mp4: 'avc1.640028', webm: 'vp09.00.10.08' }
