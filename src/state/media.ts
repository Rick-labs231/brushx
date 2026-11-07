// Bringing pictures and video into a project (browser side: decoding).
import { frameSpan, patchAudio } from '../engine/audio.ts'
import { MAX_PICTURE_SIDE, addMediaLayer, bitmapStroke, containRect, placeOnFrames, planClip } from '../engine/media.ts'
import { commit } from './actions.ts'
import { importAudioFile } from './audio.ts'
import { store } from './app.ts'
import { toast } from './toast.ts'

export interface MediaOptions {
  /** true: a trace/reference layer that is not exported. false: part of the animation. */
  reference: boolean
  /** add frames so the whole clip fits */
  extend: boolean
  /** also take the clip's sound */
  sound: boolean
}

export const mediaPrefs: MediaOptions = { reference: true, extend: true, sound: false }

const MAX_FILE_BYTES = 400 * 1024 * 1024

function mk(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

const baseName = (f: File) => f.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Media'

export async function importPicture(file: File, opts: MediaOptions = mediaPrefs): Promise<boolean> {
  const project = store.getState().project
  if (!project) return false
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(file)
  } catch {
    toast('Couldn’t read that picture. Try a PNG, JPG, WebP or GIF.', 'error')
    return false
  }
  const place = containRect(bmp.width, bmp.height, project.width, project.height)
  const k = Math.min(1, MAX_PICTURE_SIDE / Math.max(place.w, place.h), bmp.width / place.w)
  const w = Math.max(2, Math.round(place.w * k))
  const h = Math.max(2, Math.round(place.h * k))
  const c = mk(w, h)
  const ctx = c.getContext('2d') as CanvasRenderingContext2D
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const data = ctx.getImageData(0, 0, w, h).data
  const now = store.getState().project
  if (!now || now.id !== project.id) {
    toast('Picture not added: you switched projects while it was loading.', 'info')
    return false
  }
  const stroke = bitmapStroke(data, w, h, place)
  const r = addMediaLayer(now, `Picture · ${baseName(file)}`, opts.reference, [stroke])
  commit(r.project)
  toast(opts.reference ? 'Picture added under your drawing as a trace layer: shown while you draw, left out of exports.' : 'Picture added as a layer under your drawing, on every frame. It will be in your exports.', 'success')
  return true
}

function once(el: HTMLVideoElement, ok: string, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { cleanup(); reject(new Error('timeout')) }, ms)
    const done = () => { cleanup(); resolve() }
    const fail = () => { cleanup(); reject(new Error('video error')) }
    const cleanup = () => { clearTimeout(t); el.removeEventListener(ok, done); el.removeEventListener('error', fail) }
    el.addEventListener(ok, done)
    el.addEventListener('error', fail)
  })
}

export async function importVideo(file: File, opts: MediaOptions = mediaPrefs, onProgress?: (done: number, total: number) => void): Promise<boolean> {
  const start = store.getState()
  const project = start.project
  if (!project) return false
  if (file.size > MAX_FILE_BYTES) {
    toast('That video is too big (over 400 MB). Trim it first, or use a shorter clip.', 'error')
    return false
  }
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.preload = 'auto'
  video.playsInline = true
  try {
    video.src = url
    await once(video, 'loadedmetadata', 15000)
    if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth) throw new Error('no length')
    const plan = planClip(video.duration, project.fps, video.videoWidth, video.videoHeight, project.width, project.height)
    const c = mk(plan.px.w, plan.px.h)
    const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
    ctx.imageSmoothingQuality = 'high'
    const strokes = []
    for (let i = 0; i < plan.count; i += 1) {
      const t = Math.min(i / project.fps, Math.max(0, video.duration - 0.001))
      if (Math.abs(video.currentTime - t) > 1e-4 || i === 0) {
        const seeked = once(video, 'seeked', 8000)
        video.currentTime = t
        await seeked
      }
      ctx.clearRect(0, 0, c.width, c.height)
      ctx.drawImage(video, 0, 0, c.width, c.height)
      strokes.push(bitmapStroke(new Uint8ClampedArray(ctx.getImageData(0, 0, c.width, c.height).data), c.width, c.height, plan.place))
      onProgress?.(i + 1, plan.count)
    }
    const now = store.getState().project
    if (!now || now.id !== project.id) {
      toast('Video not added: you switched projects while it was loading.', 'info')
      return false
    }
    const { project: withLayer, layerId } = addMediaLayer(now, `Video · ${baseName(file)}`, opts.reference)
    const from = Math.max(0, withLayer.frames.findIndex((f) => f.id === start.frameId))
    const r = placeOnFrames(withLayer, layerId, from, strokes, opts.extend)
    commit(r.project)
    let note = ''
    if (opts.sound) {
      const had = store.getState().project?.audio
      const ok = await importAudioFile(file)
      const p2 = store.getState().project
      if (ok && p2) commit(patchAudio(p2, { offset: frameSpan(p2, from)[0] }))
      else if (!ok && had) note = ' (its sound couldn’t be read, your old sound is unchanged)'
      else if (!ok) note = ' (it has no sound Brush X could read)'
    }
    const cut = plan.count > r.placed ? ` Only ${r.placed} of ${plan.count} frames fit; turn on “Add frames” to keep the rest.` : ''
    toast(`Video added: ${r.placed} frames${opts.reference ? ' as a trace layer' : ''}.${cut}${note}`, 'success')
    return true
  } catch {
    toast('Couldn’t read that video. Try an MP4 or WebM that plays in your browser.', 'error')
    return false
  } finally {
    URL.revokeObjectURL(url)
    video.removeAttribute('src')
    video.load()
  }
}

export function isVideoFile(f: File): boolean {
  return f.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv)$/i.test(f.name)
}
export function isPictureFile(f: File): boolean {
  return f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(f.name)
}

/** Handles files dropped on the editor. */
export async function importDropped(files: File[]) {
  for (const f of files) {
    if (isVideoFile(f)) await importVideo(f)
    else if (isPictureFile(f)) await importPicture(f)
  }
}
