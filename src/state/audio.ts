import { MAX_AUDIO_BYTES, computePeaks, frameSpan, patchAudio, removeAudio, timelineSeconds, type AudioTrack } from '../engine/audio.ts'
import { addFrame } from '../engine/projectOps.ts'
import type { Project } from '../engine/types.ts'
import { commit } from './actions.ts'
import { store } from './app.ts'
import { toast } from './toast.ts'

let ctx: AudioContext | null = null
const audioCtx = (): AudioContext => {
  ctx ??= new AudioContext()
  return ctx
}

const decoded = new WeakMap<Uint8Array, AudioBuffer>()

/** Decodes the project's sound once and remembers it. */
export async function decodeTrack(a: AudioTrack): Promise<AudioBuffer> {
  const hit = decoded.get(a.data)
  if (hit) return hit
  const buf = await audioCtx().decodeAudioData(a.data.slice().buffer)
  decoded.set(a.data, buf)
  return buf
}

export const channelsOf = (b: AudioBuffer): Float32Array[] => Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i))

export async function importAudioFile(file: File): Promise<boolean> {
  const project = store.getState().project
  if (!project) return false
  if (file.size > MAX_AUDIO_BYTES) {
    toast(`That sound is ${(file.size / 1048576).toFixed(0)} MB. Brush X takes up to ${MAX_AUDIO_BYTES / 1048576} MB; try a shorter or compressed clip.`, 'error')
    return false
  }
  try {
    const data = new Uint8Array(await file.arrayBuffer())
    const buf = await audioCtx().decodeAudioData(data.slice().buffer)
    const track: AudioTrack = {
      name: file.name,
      mime: file.type || 'audio/mpeg',
      data,
      duration: buf.duration,
      offset: 0,
      volume: 1,
      muted: false,
      peaks: computePeaks(channelsOf(buf), buf.sampleRate),
    }
    decoded.set(data, buf)
    const now = store.getState().project
    if (!now) return false
    commit({ ...now, audio: track, updatedAt: Date.now() })
    toast(`Added “${file.name}” (${buf.duration.toFixed(1)} s).`, 'success')
    return true
  } catch {
    toast('Couldn’t read that sound. Try an MP3, WAV, OGG or M4A file.', 'error')
    return false
  }
}

// -------------------------------------------------------------- playback

let source: AudioBufferSourceNode | null = null
let gen = 0

export function stopAudio() {
  gen += 1
  try { source?.stop() } catch { /* already stopped */ }
  source?.disconnect()
  source = null
}

/** Plays the sound from the start of frame `frameIndex`. */
export async function startAudio(project: Project, frameIndex: number) {
  stopAudio()
  const a = project.audio
  if (!a || a.muted || a.volume <= 0) return
  const mine = gen
  try {
    const buf = await decodeTrack(a)
    if (mine !== gen) return
    const c = audioCtx()
    if (c.state === 'suspended') await c.resume()
    const t = frameSpan(project, frameIndex)[0] - a.offset
    if (t >= buf.duration) return
    const node = c.createBufferSource()
    node.buffer = buf
    const gain = c.createGain()
    gain.gain.value = a.volume
    node.connect(gain).connect(c.destination)
    if (t >= 0) node.start(0, t)
    else node.start(c.currentTime - t, 0)
    source = node
  } catch {
    /* no sound is better than a broken play button */
  }
}

// ---------------------------------------------------------------- editing

let lastEdit = 0

/** Volume / offset / mute edits; a slider drag collapses into one undo step. */
export function patchAudioAction(patch: Partial<Pick<AudioTrack, 'volume' | 'muted' | 'offset'>>) {
  const p = store.getState().project
  if (!p?.audio) return
  const now = Date.now()
  const coalesce = now - lastEdit < 700
  lastEdit = now
  commit(patchAudio(p, patch), { record: !coalesce })
}

export function removeAudioAction() {
  const p = store.getState().project
  if (p?.audio) commit(removeAudio(p))
}

/** Starts the sound at the beginning of the selected frame. */
export function startSoundHereAction() {
  const s = store.getState()
  const p = s.project
  if (!p?.audio) return
  const i = Math.max(0, p.frames.findIndex((f) => f.id === s.frameId))
  patchAudioAction({ offset: frameSpan(p, i)[0] })
}

/** Adds blank frames at the end until the timeline is as long as the sound. */
export function coverSoundAction() {
  const p = store.getState().project
  if (!p?.audio) return
  const need = Math.ceil((Math.max(0, p.audio.offset) + p.audio.duration - timelineSeconds(p)) * p.fps - 1e-6)
  if (need <= 0) { toast('The animation is already as long as the sound.', 'info'); return }
  let next = p
  for (let i = 0; i < need; i += 1) next = addFrame(next, next.frames[next.frames.length - 1].id).project
  commit(next)
  toast(`Added ${need} frame${need === 1 ? '' : 's'}.`, 'success')
}
