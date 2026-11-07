import { encodeGif, type GifFrame } from '../engine/gif.ts'
import { holdOf, playSequence, totalTicks } from '../engine/projectOps.ts'
import { renderFinalFrame } from '../engine/render.ts'
import type { Project } from '../engine/types.ts'
import { zipBytes, type ZipEntry } from '../engine/zip.ts'
import { muxMp4, type Mp4Audio, type Mp4Sample } from '../engine/mp4.ts'
import { muxWebm, type WebmAudio } from '../engine/webm.ts'
import { frameSpan, mixRange } from '../engine/audio.ts'
import { channelsOf, decodeTrack } from './audio.ts'
import { VIDEO_CODEC, beatAtVideoFrame, evenDim, fitContain, presetById, videoBitrate, videoFrameCount, type VideoFormat, type VideoQuality } from '../engine/video.ts'
import { store } from './app.ts'
import { downloadBlob, safeName } from './persist.ts'
import { toast } from './toast.ts'

export interface AnimExportOptions {
  scale: number
  transparent: boolean
  /** true = only the work range */
  useRange: boolean
  /** PNG sequence: write one file per tick so held frames keep their timing */
  expandHolds?: boolean
  loop?: boolean
  onProgress?: (done: number, total: number) => void
}

/** Rough RGBA memory the GIF encoder needs, so the dialog can warn before the tab dies. */
export function gifMemoryMB(p: Project, o: Pick<AnimExportOptions, 'scale' | 'useRange'>): number {
  const n = playSequence(p, o.useRange).length
  return (n * Math.round(p.width * o.scale) * Math.round(p.height * o.scale) * 4) / 1_048_576
}
export const GIF_MEMORY_LIMIT_MB = 300

const tick = () => new Promise<void>((r) => setTimeout(r, 0))

const toPng = (c: HTMLCanvasElement) =>
  new Promise<Uint8Array>((resolve, reject) => {
    c.toBlob((b) => {
      if (!b) return reject(new Error('png failed'))
      void b.arrayBuffer().then((ab) => resolve(new Uint8Array(ab)), reject)
    }, 'image/png')
  })

function current(): Project {
  const p = store.getState().project
  if (!p) throw new Error('No project open')
  return p
}

export async function exportGif(o: AnimExportOptions): Promise<void> {
  const p = current()
  const seq = playSequence(p, o.useRange)
  const w = Math.round(p.width * o.scale)
  const h = Math.round(p.height * o.scale)
  const frames: GifFrame[] = []
  for (let i = 0; i < seq.length; i += 1) {
    const canvas = renderFinalFrame(p, p.frames[seq[i].index], { scale: o.scale, transparent: o.transparent })
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
    frames.push({ data: ctx.getImageData(0, 0, w, h).data, delay: (100 * seq[i].ticks) / p.fps })
    o.onProgress?.(i + 1, seq.length)
    await tick()
  }
  const bytes = encodeGif({ width: w, height: h, frames, transparent: o.transparent, loop: o.loop ?? true })
  downloadBlob(new Blob([bytes as BlobPart], { type: 'image/gif' }), `${safeName(p.name)}.gif`)
  toast(`GIF exported (${seq.length} frame${seq.length === 1 ? '' : 's'}).`, 'success')
}

export async function exportPngSequence(o: AnimExportOptions): Promise<void> {
  const p = current()
  const seq = playSequence(p, o.useRange)
  const entries: ZipEntry[] = []
  const base = safeName(p.name)
  let n = 0
  for (let i = 0; i < seq.length; i += 1) {
    const frame = p.frames[seq[i].index]
    const data = await toPng(renderFinalFrame(p, frame, { scale: o.scale, transparent: o.transparent }))
    const copies = o.expandHolds === false ? 1 : holdOf(frame)
    for (let c = 0; c < copies; c += 1) {
      n += 1
      entries.push({ name: `${base}-${String(n).padStart(4, '0')}.png`, data })
    }
    o.onProgress?.(i + 1, seq.length)
    await tick()
  }
  downloadBlob(new Blob([zipBytes(entries) as BlobPart], { type: 'application/zip' }), `${base}-frames.zip`)
  toast(`PNG sequence exported (${entries.length} image${entries.length === 1 ? '' : 's'}).`, 'success')
}

// ------------------------------------------------------------------- video

export interface VideoExportOptions {
  format: VideoFormat
  presetId: string
  /** used when the preset is "Project size" */
  scale: number
  /** used when the preset is "Project size" */
  fps: number
  quality: VideoQuality
  useRange: boolean
  /** mix the project's sound in (default true) */
  includeSound?: boolean
  onProgress?: (done: number, total: number) => void
}

export interface VideoPlan {
  width: number
  height: number
  fps: number
  frames: number
  bitrate: number
  seconds: number
}

export function planVideo(p: Project, o: Pick<VideoExportOptions, 'presetId' | 'scale' | 'fps' | 'quality' | 'useRange'>): VideoPlan {
  const preset = presetById(o.presetId)
  const width = evenDim(preset.w ?? p.width * o.scale)
  const height = evenDim(preset.h ?? p.height * o.scale)
  const fps = preset.fps ?? o.fps
  const seq = playSequence(p, o.useRange)
  const frames = videoFrameCount(seq, p.fps, fps)
  return { width, height, fps, frames, bitrate: videoBitrate(width, height, fps, o.quality), seconds: frames / fps }
}

/** Whether this browser can encode the format (needs WebCodecs). */
export async function videoSupported(format: VideoFormat): Promise<boolean> {
  try {
    if (typeof VideoEncoder === 'undefined') return false
    const r = await VideoEncoder.isConfigSupported({ codec: VIDEO_CODEC[format], width: 640, height: 360, bitrate: 1_000_000, framerate: 12 })
    return !!r.supported
  } catch {
    return false
  }
}

const AUDIO_RATE = 48000

function opusHead(channels: number): Uint8Array {
  const b = new Uint8Array(19)
  b.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64, 1, channels])
  const v = new DataView(b.buffer)
  v.setUint16(10, 312, true)
  v.setUint32(12, AUDIO_RATE, true)
  return b
}

const bytesOf = (d: unknown): Uint8Array | null => {
  if (!d) return null
  if (d instanceof ArrayBuffer) return new Uint8Array(d.slice(0))
  const v = d as ArrayBufferView
  return new Uint8Array(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength))
}

/** Mixes the project's sound for the exported span and encodes it (AAC when the browser can, otherwise Opus). */
async function encodeSound(p: Project, seq: ReturnType<typeof playSequence>, format: VideoFormat): Promise<{ mp4?: Mp4Audio; webm?: WebmAudio } | null> {
  const a = p.audio
  if (!a || a.muted || a.volume <= 0) return null
  if (typeof AudioEncoder === 'undefined') throw new Error('no audio encoder')
  const t0 = frameSpan(p, seq[0].index)[0]
  const dur = totalTicks(seq) / p.fps
  const buf = await decodeTrack(a)
  const [L, R] = mixRange(channelsOf(buf), buf.sampleRate, a, t0, t0 + dur, AUDIO_RATE)
  let codec = 'opus'
  if (format === 'mp4') {
    try { if ((await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: AUDIO_RATE, numberOfChannels: 2, bitrate: 128_000 })).supported) codec = 'mp4a.40.2' } catch { /* Opus */ }
  }
  const chunks: { data: Uint8Array; timeUs: number; durationUs: number }[] = []
  let description: Uint8Array | null = null
  let failure: unknown = null
  const enc = new AudioEncoder({
    output: (chunk, meta) => {
      const data = new Uint8Array(chunk.byteLength)
      chunk.copyTo(data)
      chunks.push({ data, timeUs: chunk.timestamp, durationUs: chunk.duration ?? 20000 })
      description ??= bytesOf(meta?.decoderConfig?.description)
    },
    error: (e) => { failure = e },
  })
  enc.configure({ codec, sampleRate: AUDIO_RATE, numberOfChannels: 2, bitrate: 128_000 })
  const step = 9600
  for (let at = 0; at < L.length; at += step) {
    const n = Math.min(step, L.length - at)
    const planar = new Float32Array(n * 2)
    planar.set(L.subarray(at, at + n), 0)
    planar.set(R.subarray(at, at + n), n)
    const data = new AudioData({ format: 'f32-planar', sampleRate: AUDIO_RATE, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((at * 1e6) / AUDIO_RATE), data: planar })
    enc.encode(data)
    data.close()
    if (failure) throw failure
    if (enc.encodeQueueSize > 8) await tick()
  }
  await enc.flush()
  enc.close()
  if (failure) throw failure
  if (!chunks.length) return null
  const lastDurationUs = chunks[chunks.length - 1].durationUs
  if (format === 'webm') return { webm: { sampleRate: AUDIO_RATE, channels: 2, codecPrivate: description ?? opusHead(2), samples: chunks } }
  const aac = codec === 'mp4a.40.2'
  if (aac && !description) throw new Error('no aac config')
  return { mp4: { codec: aac ? 'aac' : 'opus', sampleRate: AUDIO_RATE, channels: 2, description: description ?? opusHead(2), samples: chunks, lastDurationUs } }
}

export async function exportVideo(o: VideoExportOptions): Promise<void> {
  const p = current()
  if (!(await videoSupported(o.format))) throw new Error('unsupported')
  const plan = planVideo(p, o)
  const seq = playSequence(p, o.useRange)
  const fit = fitContain(p.width, p.height, plan.width, plan.height)
  const out = document.createElement('canvas')
  out.width = plan.width
  out.height = plan.height
  const ctx = out.getContext('2d') as CanvasRenderingContext2D
  ctx.imageSmoothingQuality = 'high'

  const samples: Mp4Sample[] = []
  let avcC: Uint8Array | null = null
  let failure: unknown = null
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      const data = new Uint8Array(chunk.byteLength)
      chunk.copyTo(data)
      samples.push({ data, timeUs: chunk.timestamp, isKey: chunk.type === 'key' })
      const d = meta?.decoderConfig?.description
      if (d && !avcC) avcC = new Uint8Array(d instanceof ArrayBuffer ? d : (d as ArrayBufferView).buffer.slice((d as ArrayBufferView).byteOffset, (d as ArrayBufferView).byteOffset + (d as ArrayBufferView).byteLength))
    },
    error: (e) => { failure = e },
  })
  encoder.configure({
    codec: VIDEO_CODEC[o.format],
    width: plan.width,
    height: plan.height,
    bitrate: plan.bitrate,
    framerate: plan.fps,
    latencyMode: 'quality',
    ...(o.format === 'mp4' ? { avc: { format: 'avc' as const } } : {}),
  })

  let cachedBeat = -1
  const keyEvery = Math.max(1, Math.round(plan.fps * 2))
  for (let k = 0; k < plan.frames; k += 1) {
    if (failure) throw failure
    const beat = beatAtVideoFrame(seq, k, p.fps, plan.fps)
    if (beat !== cachedBeat) {
      cachedBeat = beat
      const art = renderFinalFrame(p, p.frames[seq[beat].index], { scale: fit.w / p.width, transparent: false })
      ctx.fillStyle = p.background ?? '#ffffff'
      ctx.fillRect(0, 0, plan.width, plan.height)
      ctx.drawImage(art, fit.x, fit.y, fit.w, fit.h)
    }
    const frame = new VideoFrame(out, { timestamp: Math.round((k * 1e6) / plan.fps), duration: Math.round(1e6 / plan.fps) })
    encoder.encode(frame, { keyFrame: k % keyEvery === 0 })
    frame.close()
    o.onProgress?.(k + 1, plan.frames)
    while (encoder.encodeQueueSize > 6) await tick()
    if (k % 4 === 0) await tick()
  }
  await encoder.flush()
  encoder.close()
  if (failure) throw failure
  const lastDurationUs = Math.round(1e6 / plan.fps)
  let sound: Awaited<ReturnType<typeof encodeSound>> = null
  let soundFailed = false
  if (o.includeSound !== false && p.audio) {
    try { sound = await encodeSound(p, seq, o.format) } catch { soundFailed = true }
  }
  let bytes: Uint8Array
  if (o.format === 'mp4') {
    if (!avcC) throw new Error('no avc config')
    bytes = muxMp4({ width: plan.width, height: plan.height, avcC, samples, lastDurationUs, audio: sound?.mp4 })
  } else {
    bytes = muxWebm({ width: plan.width, height: plan.height, codec: 'V_VP9', samples, lastDurationUs, audio: sound?.webm })
  }
  if (soundFailed) toast('The video was exported without sound because this browser couldn’t encode it.', 'info')
  downloadBlob(new Blob([bytes as BlobPart], { type: o.format === 'mp4' ? 'video/mp4' : 'video/webm' }), `${safeName(p.name)}.${o.format}`)
  toast(`${o.format.toUpperCase()} exported (${plan.frames} frames, ${plan.seconds.toFixed(1)} s).`, 'success')
}
