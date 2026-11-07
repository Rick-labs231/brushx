import { uid } from './ids.ts'
import { holdOf } from './projectOps.ts'
import type { Frame, Project } from './types.ts'

/** A scene starts at one frame and runs until the next scene starts. */
export interface Scene {
  id: string
  name: string
  frameId: string
}

export interface SceneSpan {
  id: string
  name: string
  /** frame indexes, inclusive */
  start: number
  end: number
  /** position in the scene list */
  index: number
  color: string
}

export const SCENE_COLORS = ['#168CFF', '#9B5CFF', '#2EC4B6', '#F5A524', '#FF6B8A', '#6DB8FF']
export const MAX_SCENE_NAME = 40

const touch = (p: Project): Project => ({ ...p, updatedAt: Date.now() })

/**
 * Scenes in timeline order. Scenes whose start frame is gone are ignored, two scenes can't
 * start on the same frame, and the first scene always begins at frame 1.
 */
export function scenesOf(p: Project): SceneSpan[] {
  const found = (p.scenes ?? [])
    .map((s) => ({ s, i: p.frames.findIndex((f) => f.id === s.frameId) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => a.i - b.i)
  const uniq = found.filter((x, k) => k === 0 || x.i !== found[k - 1].i)
  return uniq.map((x, k) => ({
    id: x.s.id,
    name: x.s.name,
    start: k === 0 ? 0 : x.i,
    end: k + 1 < uniq.length ? uniq[k + 1].i - 1 : p.frames.length - 1,
    index: k,
    color: SCENE_COLORS[k % SCENE_COLORS.length],
  }))
}

export const hasScenes = (p: Project): boolean => scenesOf(p).length > 0

export const sceneAtFrame = (p: Project, frameIndex: number): SceneSpan | undefined => scenesOf(p).find((s) => frameIndex >= s.start && frameIndex <= s.end)

/** Length of a scene in seconds, counting each frame's hold. */
export const sceneSeconds = (p: Project, s: Pick<SceneSpan, 'start' | 'end'>): number => p.frames.slice(s.start, s.end + 1).reduce((a, f) => a + holdOf(f), 0) / p.fps

/** Takes all scene markers away (the frames stay). */
export function clearScenes(p: Project): Project {
  if (!p.scenes) return p
  const { scenes: _s, ...rest } = p
  return touch(rest as Project)
}

const store = (p: Project, spans: { id: string; name: string; start: number }[], frames: Frame[] = p.frames): Project => {
  const { scenes: _old, ...rest } = p
  if (!spans.length) return touch({ ...rest, frames } as Project)
  return touch({ ...rest, frames, scenes: spans.map((s) => ({ id: s.id, name: s.name, frameId: frames[s.start].id })) })
}

const cleanName = (n: string, fallback: string) => n.trim().slice(0, MAX_SCENE_NAME) || fallback

/** Starts a scene at a frame. The first call also names everything before it "Scene 1". */
export function addSceneAt(p: Project, frameId: string, name?: string): Project {
  const at = p.frames.findIndex((f) => f.id === frameId)
  if (at < 0) return p
  const spans = scenesOf(p)
  if (spans.some((s) => s.start === at)) return p
  const base = spans.length ? spans : [{ id: uid(), name: 'Scene 1', start: 0 }]
  if (!spans.length && at === 0) return store(p, base)
  const next = [...base.map((s) => ({ id: s.id, name: s.name, start: s.start })), { id: uid(), name: cleanName(name ?? '', `Scene ${base.length + 1}`), start: at }].sort((a, b) => a.start - b.start)
  return store(p, next)
}

export function renameScene(p: Project, id: string, name: string): Project {
  const spans = scenesOf(p)
  const s = spans.find((x) => x.id === id)
  if (!s) return p
  const clean = cleanName(name, s.name)
  if (clean === s.name) return p
  return store(p, spans.map((x) => (x.id === id ? { ...x, name: clean } : x)))
}

/** Removes the boundary; the scene's frames join the one before it. */
export function removeScene(p: Project, id: string): Project {
  const spans = scenesOf(p)
  if (!spans.some((s) => s.id === id)) return p
  const left = spans.filter((s) => s.id !== id)
  // the first remaining scene always starts at the top
  return store(p, left.map((s, k) => (k === 0 ? { ...s, start: 0 } : s)))
}

/** Swaps a scene with its neighbour (dir −1 = earlier, +1 = later), moving all its frames. */
export function moveScene(p: Project, id: string, dir: -1 | 1): Project {
  const spans = scenesOf(p)
  const i = spans.findIndex((s) => s.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= spans.length) return p
  const blocks = spans.map((s) => ({ ...s, frames: p.frames.slice(s.start, s.end + 1) }))
  ;[blocks[i], blocks[j]] = [blocks[j], blocks[i]]
  const frames = blocks.flatMap((b) => b.frames)
  let at = 0
  const starts = blocks.map((b) => { const start = at; at += b.frames.length; return { id: b.id, name: b.name, start } })
  const { range: _r, ...rest } = p // frame numbers changed, so the old work range no longer means anything
  return store(rest as Project, starts, frames)
}

/** Copies a scene's frames right after it as a new scene. */
export function duplicateScene(p: Project, id: string): { project: Project; frameId: string } | null {
  const spans = scenesOf(p)
  const s = spans.find((x) => x.id === id)
  if (!s) return null
  const copies: Frame[] = p.frames.slice(s.start, s.end + 1).map((f) => ({ ...f, id: uid(), cels: { ...f.cels } }))
  const frames = [...p.frames.slice(0, s.end + 1), ...copies, ...p.frames.slice(s.end + 1)]
  const grow = copies.length
  const newId = uid()
  const next = [
    ...spans.map((x) => ({ id: x.id, name: x.name, start: x.start > s.end ? x.start + grow : x.start })),
    { id: newId, name: cleanName(`${s.name} copy`, 'Scene copy'), start: s.end + 1 },
  ].sort((a, b) => a.start - b.start)
  const { range: _r, ...rest } = p
  return { project: store(rest as Project, next, frames), frameId: copies[0].id }
}

/** Work range set to one scene, so Play and Export cover just that scene. */
export function rangeToScene(p: Project, id: string): Project {
  const s = scenesOf(p).find((x) => x.id === id)
  return s ? touch({ ...p, range: { start: s.start, end: s.end } }) : p
}
