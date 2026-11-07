import type { Rect } from './types.ts'
import { CATALOG, type TemplateDef } from './templates/catalog.ts'
import type { GuideShape } from './templates/shapes.ts'

export type { GuideShape } from './templates/shapes.ts'
export type { TemplateDef } from './templates/catalog.ts'

export const TEMPLATES: TemplateDef[] = CATALOG

export function templateById(id: string | null): TemplateDef | null {
  return TEMPLATES.find((t) => t.id === id) ?? null
}

/** The lines to draw for a template at the guide's current angle settings. */
export function guideShapes(t: TemplateDef, g: Pick<GuideState, 'yaw' | 'pitch'>): GuideShape[] {
  return t.build ? t.build({ yaw: g.yaw, pitch: g.pitch }) : t.shapes
}

export interface GuideState {
  template: string | null
  visible: boolean
  locked: boolean
  opacity: number
  thickness: number
  x: number
  y: number
  scale: number
  rotation: number // degrees
  flipX: boolean
  /** horizontal stretch for proportion tweaks, 1 = unchanged */
  stretchX: number
  /** head angle for turnable templates, degrees */
  yaw: number
  pitch: number
}

export const defaultGuide = (): GuideState => ({
  template: null,
  visible: true,
  locked: false,
  opacity: 0.6,
  thickness: 1.5,
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  flipX: false,
  stretchX: 1,
  yaw: 35,
  pitch: 0,
})

export type PerspectiveMode =
  | 'one-point'
  | 'two-point'
  | 'three-point'
  | 'birds-eye'
  | 'worms-eye'
  | 'four-point'
  | 'isometric'
  | 'fisheye'
  | 'curvilinear'

export const PERSPECTIVE_MODES: { id: PerspectiveMode; label: string; hint: string }[] = [
  { id: 'one-point', label: '1-point', hint: 'Roads, corridors, rooms seen head-on' },
  { id: 'two-point', label: '2-point', hint: 'Buildings and objects seen from a corner' },
  { id: 'three-point', label: '3-point', hint: 'Looking down on tall subjects' },
  { id: 'birds-eye', label: 'Bird’s-eye', hint: 'Steep view from above' },
  { id: 'worms-eye', label: 'Worm’s-eye', hint: 'Looking up from the ground' },
  { id: 'four-point', label: '4-point', hint: 'Two horizontal and two vertical vanishing points' },
  { id: 'isometric', label: 'Isometric', hint: 'Parallel 30° grid, no vanishing' },
  { id: 'fisheye', label: 'Fisheye / 5-point', hint: 'Barrel-curved grid in a circle' },
  { id: 'curvilinear', label: 'Curvilinear', hint: 'Curved horizontals, straight verticals' },
]

export interface PerspectiveState {
  enabled: boolean
  mode: PerspectiveMode
  horizon: number // 0..1 of canvas height
  density: number // rays per vanishing point
  opacity: number
  /** how far the vanishing points sit from the centre, 1 = default */
  spread: number
  /** snap line-tool strokes to the grid's directions */
  snap: boolean
}

export const defaultPerspective = (): PerspectiveState => ({ enabled: false, mode: 'two-point', horizon: 0.45, density: 14, opacity: 0.4, spread: 1, snap: false })

type Pt2 = { x: number; y: number }

/** Vanishing points for the vanishing-point modes. Empty for isometric and curved grids. */
export function vanishingPoints(p: Pick<PerspectiveState, 'mode' | 'horizon' | 'spread'>, w: number, h: number): Pt2[] {
  const hy = h * p.horizon
  const s = Math.max(0.2, p.spread)
  const side = (): Pt2[] => [{ x: w / 2 - w * 0.85 * s, y: hy }, { x: w / 2 + w * 0.85 * s, y: hy }]
  switch (p.mode) {
    case 'one-point': return [{ x: w / 2, y: hy }]
    case 'two-point': return side()
    case 'three-point': return [...side(), { x: w / 2, y: hy + h * 2.2 * s }]
    case 'birds-eye': return [...side(), { x: w / 2, y: hy + h * 1.1 * s }]
    case 'worms-eye': return [...side(), { x: w / 2, y: hy - h * 1.3 * s }]
    case 'four-point': return [...side(), { x: w / 2, y: hy - h * 1.6 * s }, { x: w / 2, y: hy + h * 1.6 * s }]
    default: return []
  }
}

/** Directions (radians, mod π) a line may take on this grid when drawn from `a`. */
function gridAngles(p: PerspectiveState, w: number, h: number, a: Pt2): number[] {
  if (p.mode === 'isometric') return [Math.PI / 6, -Math.PI / 6, Math.PI / 2]
  const vps = vanishingPoints(p, w, h)
  const out = vps.map((v) => Math.atan2(v.y - a.y, v.x - a.x))
  if (p.mode === 'one-point') out.push(0, Math.PI / 2) // frontal lines stay horizontal/vertical
  if (p.mode === 'two-point' || p.mode === 'curvilinear') out.push(Math.PI / 2)
  if (p.mode === 'curvilinear') out.push(0)
  return out
}

const TOLERANCE = (9 * Math.PI) / 180

/** Pulls the end of a line onto the nearest grid direction when it is already close. */
export function snapToPerspective(p: PerspectiveState, w: number, h: number, a: Pt2, b: Pt2): Pt2 {
  if (!p.enabled || !p.snap || p.mode === 'fisheye') return b
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < 4) return b
  const ang = Math.atan2(dy, dx)
  let best: number | null = null
  let bestDiff = TOLERANCE
  for (const c of gridAngles(p, w, h, a)) {
    const diff = Math.abs(Math.atan2(Math.sin(ang - c), Math.cos(ang - c)))
    const folded = Math.min(diff, Math.PI - diff)
    if (folded < bestDiff) { bestDiff = folded; best = c }
  }
  if (best === null) return b
  const ux = Math.cos(best)
  const uy = Math.sin(best)
  const k = dx * ux + dy * uy
  return { x: a.x + ux * k, y: a.y + uy * k }
}

const GUIDE_BLUE = '#6DB8FF'
const GUIDE_PURPLE = '#9B5CFF'

/** Draws a template in art space. `px` is one screen pixel in art units. */
export function drawTemplate(ctx: CanvasRenderingContext2D, g: GuideState, w: number, h: number, px: number) {
  const t = templateById(g.template)
  if (!t || !g.visible) return
  const unit = Math.min(w, h)
  ctx.save()
  ctx.translate(w / 2 + g.x, h / 2 + g.y)
  ctx.rotate((g.rotation * Math.PI) / 180)
  ctx.scale(g.scale * g.stretchX * (g.flipX ? -1 : 1), g.scale)
  ctx.scale(unit, unit)
  ctx.globalAlpha = g.opacity
  ctx.lineWidth = (g.thickness * px) / (g.scale * unit)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = GUIDE_BLUE
  for (const s of guideShapes(t, g)) {
    ctx.beginPath()
    if (s.k === 'line') {
      ctx.moveTo(s.pts[0][0], s.pts[0][1])
      for (let i = 1; i < s.pts.length; i += 1) ctx.lineTo(s.pts[i][0], s.pts[i][1])
    } else if (s.k === 'ellipse') {
      ctx.ellipse(s.c[0], s.c[1], s.r[0], s.r[1], 0, 0, Math.PI * 2)
    } else {
      ctx.moveTo(s.p[0][0], s.p[0][1])
      ctx.quadraticCurveTo(s.p[1][0], s.p[1][1], s.p[2][0], s.p[2][1])
    }
    ctx.stroke()
  }
  ctx.restore()
}

/** Perspective grid. */
export function drawPerspective(ctx: CanvasRenderingContext2D, p: PerspectiveState, w: number, h: number, px: number) {
  if (!p.enabled) return
  const horizonY = h * p.horizon
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, w, h)
  ctx.clip()
  ctx.lineWidth = px
  ctx.globalAlpha = p.opacity
  const n = Math.max(3, Math.round(p.density))
  const far = Math.hypot(w, h) * 4
  if (p.mode === 'isometric') {
    ctx.strokeStyle = GUIDE_PURPLE
    const step = Math.max(w, h) / n
    for (const ang of [Math.PI / 6, -Math.PI / 6, Math.PI / 2]) {
      ctx.strokeStyle = ang === Math.PI / 2 ? GUIDE_BLUE : GUIDE_PURPLE
      const ux = Math.cos(ang), uy = Math.sin(ang)
      const nx = -uy, ny = ux
      const count = Math.ceil(far / step / 2)
      for (let k = -count; k <= count; k += 1) {
        const cx = w / 2 + nx * k * step
        const cy = h / 2 + ny * k * step
        ctx.beginPath()
        ctx.moveTo(cx - ux * far, cy - uy * far)
        ctx.lineTo(cx + ux * far, cy + uy * far)
        ctx.stroke()
      }
    }
  } else if (p.mode === 'fisheye' || p.mode === 'curvilinear') {
    const fish = p.mode === 'fisheye'
    ctx.strokeStyle = GUIDE_PURPLE
    const cx = w / 2
    const cy = fish ? h / 2 : horizonY
    for (let i = 0; i < n; i += 1) {
      const u = (i + 0.5) / n
      // verticals
      const x = u * w
      ctx.beginPath()
      if (fish) {
        ctx.moveTo(cx + (x - cx) * 0.45, 0)
        ctx.quadraticCurveTo(cx + (x - cx) * 1.55, h / 2, cx + (x - cx) * 0.45, h)
      } else {
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
      }
      ctx.stroke()
      // horizontals (bowed away from the horizon)
      const y = u * h
      ctx.beginPath()
      const bow = (y - cy) * (fish ? 0.55 : 0.8)
      ctx.moveTo(0, fish ? cy + (y - cy) * 0.45 : y)
      ctx.quadraticCurveTo(w / 2, (fish ? cy + (y - cy) * 1.55 : y + bow), w, fish ? cy + (y - cy) * 0.45 : y)
      ctx.stroke()
    }
    if (fish) {
      ctx.strokeStyle = GUIDE_BLUE
      ctx.beginPath()
      ctx.ellipse(cx, cy, Math.min(w, h) * 0.49, Math.min(w, h) * 0.49, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
  } else {
    const vps = vanishingPoints(p, w, h)
    vps.forEach((vp, idx) => {
      ctx.strokeStyle = idx >= 2 ? GUIDE_BLUE : GUIDE_PURPLE
      const toCentre = Math.atan2(h / 2 - vp.y, w / 2 - vp.x)
      const fan = p.mode === 'one-point' ? Math.PI * 0.98 : Math.PI * 0.5
      for (let i = 0; i < n; i += 1) {
        const a = toCentre - fan / 2 + (fan * (i + 0.5)) / n
        ctx.beginPath()
        ctx.moveTo(vp.x, vp.y)
        ctx.lineTo(vp.x + Math.cos(a) * far, vp.y + Math.sin(a) * far)
        ctx.stroke()
      }
    })
  }
  if (p.mode !== 'isometric' && p.mode !== 'fisheye') {
    ctx.strokeStyle = GUIDE_BLUE
    ctx.globalAlpha = Math.min(1, p.opacity + 0.35)
    ctx.lineWidth = px * 1.4
    ctx.beginPath()
    ctx.moveTo(0, horizonY)
    ctx.lineTo(w, horizonY)
    ctx.stroke()
  }
  ctx.restore()
}

export function guideBounds(g: GuideState, w: number, h: number): Rect {
  const unit = Math.min(w, h) * g.scale
  return { x: w / 2 + g.x - unit / 2, y: h / 2 + g.y - unit / 2, w: unit, h: unit }
}
