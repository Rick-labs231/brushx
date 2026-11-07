import type { Project } from './types.ts'

export type CameraEase = 'smooth' | 'linear' | 'hold'

export interface CameraPose {
  /** centre of what the camera sees, in canvas pixels */
  x: number
  y: number
  /** 1 = whole canvas, 2 = twice as close */
  zoom: number
  /** degrees, clockwise */
  rot: number
}

/** A camera key sits on a frame. `ease` shapes the move from this key to the next. */
export interface CameraKey extends CameraPose {
  frameId: string
  ease: CameraEase
}

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 4

export const defaultPose = (p: Pick<Project, 'width' | 'height'>): CameraPose => ({ x: p.width / 2, y: p.height / 2, zoom: 1, rot: 0 })

const clampPose = (p: Project, pose: CameraPose): CameraPose => ({
  x: Math.max(-p.width, Math.min(p.width * 2, pose.x)),
  y: Math.max(-p.height, Math.min(p.height * 2, pose.y)),
  zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pose.zoom)),
  rot: Math.max(-360, Math.min(360, pose.rot)),
})

export const hasCamera = (p: Project): boolean => cameraKeys(p).length > 0

/** Keys whose frame still exists, in timeline order. */
export function cameraKeys(p: Project): (CameraKey & { index: number })[] {
  const out: (CameraKey & { index: number })[] = []
  for (const k of p.camera ?? []) {
    const index = p.frames.findIndex((f) => f.id === k.frameId)
    if (index >= 0) out.push({ ...k, index })
  }
  return out.sort((a, b) => a.index - b.index)
}

export const keyOn = (p: Project, frameId: string): CameraKey | undefined => (p.camera ?? []).find((k) => k.frameId === frameId)

const smooth = (t: number) => t * t * (3 - 2 * t)

/** Where the camera is on a given frame. No keys = the whole canvas, still. */
export function cameraAt(p: Project, index: number): CameraPose {
  const keys = cameraKeys(p)
  if (!keys.length) return defaultPose(p)
  const first = keys[0]
  if (index <= first.index) return pick(first)
  const last = keys[keys.length - 1]
  if (index >= last.index) return pick(last)
  let a = first
  let b = last
  for (let i = 0; i < keys.length - 1; i += 1) {
    if (index >= keys[i].index && index < keys[i + 1].index) { a = keys[i]; b = keys[i + 1]; break }
  }
  if (a.ease === 'hold') return pick(a)
  const lin = (index - a.index) / (b.index - a.index)
  const t = a.ease === 'smooth' ? smooth(lin) : lin
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    zoom: a.zoom * Math.pow(b.zoom / a.zoom, t), // zoom feels even when interpolated in log space
    rot: a.rot + (b.rot - a.rot) * t,
  }
}

const pick = (k: CameraPose): CameraPose => ({ x: k.x, y: k.y, zoom: k.zoom, rot: k.rot })

export const isDefaultPose = (p: Project, pose: CameraPose) => {
  const d = defaultPose(p)
  return Math.abs(pose.x - d.x) < 0.5 && Math.abs(pose.y - d.y) < 0.5 && Math.abs(pose.zoom - 1) < 0.001 && Math.abs(pose.rot) < 0.05
}

export interface CamMatrix { a: number; b: number; c: number; d: number; e: number; f: number }

/** Maps canvas coordinates to what the camera shows in an output of the same size. */
export function cameraMatrix(p: Pick<Project, 'width' | 'height'>, pose: CameraPose): CamMatrix {
  const th = (-pose.rot * Math.PI) / 180
  const cos = Math.cos(th) * pose.zoom
  const sin = Math.sin(th) * pose.zoom
  return { a: cos, b: sin, c: -sin, d: cos, e: p.width / 2 - (cos * pose.x - sin * pose.y), f: p.height / 2 - (sin * pose.x + cos * pose.y) }
}

// ------------------------------------------------------------------- edits

const touch = (p: Project): Project => ({ ...p, updatedAt: Date.now() })

export function setCameraKey(p: Project, frameId: string, pose: CameraPose, ease?: CameraEase): Project {
  if (!p.frames.some((f) => f.id === frameId)) return p
  const old = keyOn(p, frameId)
  const key: CameraKey = { frameId, ...clampPose(p, pose), ease: ease ?? old?.ease ?? 'smooth' }
  const rest = (p.camera ?? []).filter((k) => k.frameId !== frameId && p.frames.some((f) => f.id === k.frameId))
  return touch({ ...p, camera: [...rest, key] })
}

export function removeCameraKey(p: Project, frameId: string): Project {
  if (!keyOn(p, frameId)) return p
  const rest = (p.camera ?? []).filter((k) => k.frameId !== frameId)
  const { camera: _drop, ...without } = p
  return touch(rest.length ? { ...p, camera: rest } : (without as Project))
}

export function clearCamera(p: Project): Project {
  if (!p.camera) return p
  const { camera: _drop, ...without } = p
  return touch(without as Project)
}

/** Keep camera centres where they were relative to the artwork when the canvas is resized. */
export function shiftCamera(p: Project, dx: number, dy: number): Project {
  if (!p.camera || (dx === 0 && dy === 0)) return p
  return { ...p, camera: p.camera.map((k) => ({ ...k, x: k.x + dx, y: k.y + dy })) }
}
