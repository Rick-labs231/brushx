import { G, type Pt } from './draw'
import { drawHead } from './head'

/**
 * Construction mannequin. Angles are absolute, measured from "straight down", positive = toward the
 * direction the figure faces (+x). Everything is derived from forward kinematics, so every pose and
 * motion cycle shares the same proportions and the same ground contact logic.
 */
export interface Pose {
  lean: number
  head: number
  armA: [number, number]
  armB: [number, number]
  legA: [number, number]
  legB: [number, number]
  air: number // head-heights above the ground (grounded poses: extra lift)
  rot: number // whole-body rotation about the pelvis (falls)
  breath: number
}

const P = (
  lean: number, head: number, armA: [number, number], armB: [number, number],
  legA: [number, number], legB: [number, number], air = 0, rot = 0, breath = 0,
): Pose => ({ lean, head, armA, armB, legA, legB, air, rot, breath })

export const STAND = P(0, 0, [4, 8], [-2, 2], [3, 0], [-3, 0])

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const ease = (t: number) => t * t * (3 - 2 * t)

function mix(a: Pose, b: Pose, t: number): Pose {
  const m = (x: number, y: number) => lerp(x, y, t)
  const m2 = (x: [number, number], y: [number, number]): [number, number] => [m(x[0], y[0]), m(x[1], y[1])]
  return {
    lean: m(a.lean, b.lean), head: m(a.head, b.head), armA: m2(a.armA, b.armA), armB: m2(a.armB, b.armB),
    legA: m2(a.legA, b.legA), legB: m2(a.legB, b.legB), air: m(a.air, b.air), rot: m(a.rot, b.rot), breath: m(a.breath, b.breath),
  }
}

/** Interpolate evenly spaced key poses across phase 0..1 (inclusive of the last key). */
export function blendKeys(keys: Pose[], phase: number): Pose {
  if (keys.length === 1) return keys[0]
  const t = Math.min(0.99999, Math.max(0, phase)) * (keys.length - 1)
  const i = Math.floor(t)
  return mix(keys[i], keys[i + 1], ease(t - i))
}

const rad = (d: number) => (d * Math.PI) / 180
const TAU = Math.PI * 2

export function walkPose(phase: number): Pose {
  const leg = (ph: number): [number, number] => {
    const th = 28 * Math.cos(TAU * ph)
    const f = ((ph % 1) + 1) % 1
    const bend = f >= 0.5 ? 62 * Math.sin(Math.PI * (2 * f - 1)) : 14 * Math.sin(Math.PI * 2 * f)
    return [th, th - bend]
  }
  const a = -22 * Math.cos(TAU * phase)
  const b = 22 * Math.cos(TAU * phase)
  return P(4, 0, [a, a + 24 + Math.max(0, -a) * 0.4], [b, b + 24 + Math.max(0, -b) * 0.4], leg(phase), leg(phase + 0.5))
}

export function runPose(phase: number): Pose {
  const leg = (ph: number): [number, number] => {
    const f = ((ph % 1) + 1) % 1
    const th = 46 * Math.cos(TAU * ph)
    const bend = f >= 0.5 ? 112 * Math.sin(Math.PI * (2 * f - 1)) : 30 * Math.sin(Math.PI * 2 * f)
    return [th, th - bend]
  }
  const a = -48 * Math.cos(TAU * phase)
  const b = 48 * Math.cos(TAU * phase)
  const air = 0.28 * Math.pow(Math.sin(TAU * phase), 2)
  return P(14, 2, [a, a + 88], [b, b + 88], leg(phase), leg(phase + 0.5), air)
}

export function idlePose(phase: number, amount = 1): Pose {
  const s = Math.sin(TAU * phase)
  return P(0.8 * s * amount, 2 * s * amount, [4 + 3 * s * amount, 8 + 4 * s * amount], [-2 - 2 * s * amount, 2 + 3 * s * amount], [3, 0], [-3, 0], 0, 0, s * amount)
}

const JUMP: Pose[] = [
  P(26, -8, [-40, -15], [-35, -10], [70, -18], [64, -26]),
  P(8, 6, [140, 150], [130, 140], [8, 2], [-6, -28], 0.06),
  P(4, 0, [120, 100], [105, 90], [78, -8], [70, -14], 1.1),
  P(-2, 4, [75, 55], [60, 40], [18, 6], [8, -8], 0.55),
  P(24, -6, [45, 35], [50, 40], [72, -14], [66, -22]),
  STAND,
]
export const jumpPose = (phase: number) => blendKeys(JUMP, phase)
export const landPose = (phase: number) => blendKeys([JUMP[3], JUMP[4], STAND], phase)
export const JUMP_APEX = JUMP[2]

const FALL: Pose[] = [
  P(-12, -6, [-25, -5], [-35, -10], [10, 5], [-15, -12]),
  P(-30, -16, [-70, -50], [-85, -60], [28, 10], [10, -5], 0.25),
  P(-12, -25, [120, 100], [140, 115], [40, 15], [25, 0], 2.4, -28),
  P(0, -10, [70, 40], [90, 55], [20, 5], [10, -5], 0.9, -72),
  P(0, -4, [20, 10], [-10, -5], [5, 0], [-5, -2], 0, -90),
]
export const fallPose = (phase: number) => blendKeys(FALL, phase)

export const PUNCH_KEYS: Pose[] = [
  P(8, 0, [50, 125], [30, 110], [28, 18], [-30, -35]),
  P(2, 0, [-35, 60], [30, 110], [28, 18], [-30, -35]),
  P(16, 4, [88, 90], [30, 110], [34, 20], [-34, -38]),
  P(8, 0, [50, 125], [30, 110], [28, 18], [-30, -35]),
]
export const KICK_KEYS: Pose[] = [
  P(8, 0, [50, 125], [30, 110], [28, 18], [-30, -35]),
  P(-6, 0, [70, 110], [-20, 40], [70, -10], [-4, -8]),
  P(-18, 0, [80, 120], [-40, 30], [88, 84], [-6, -10]),
  P(8, 0, [50, 125], [30, 110], [28, 18], [-30, -35]),
]
export const THROW_KEYS: Pose[] = [
  P(0, 0, [4, 8], [-2, 2], [3, 0], [-3, 0]),
  P(-14, -6, [-100, -150], [40, 60], [18, 4], [-22, -20]),
  P(10, 4, [95, 100], [40, 60], [24, 10], [-26, -26]),
  P(16, 6, [40, 10], [40, 60], [28, 14], [-24, -30]),
]
export const REACH_POSE = P(10, -10, [128, 135], [20, 40], [6, 0], [-14, -22])
export const SIT_POSE = P(4, 0, [20, 78], [14, 70], [88, 2], [86, 0])
export const KNEEL_POSE = P(3, 0, [14, 70], [8, 64], [88, 2], [-6, -88])
export const FIGHT_POSE = PUNCH_KEYS[0]

export function wavePose(phase: number): Pose {
  return P(0, 3, [150, 170 + 28 * Math.sin(TAU * phase * 2)], [-2, 2], [3, 0], [-3, 0])
}

// ---------------------------------------------------------------------------------------------
interface Joints {
  pelvis: Pt; chest: Pt; headC: Pt; headAng: number
  armA: Pt[]; armB: Pt[]; legA: Pt[]; legB: Pt[]
  H: number
}

function solve(p: Pose, heads: number): Joints {
  const H = 400 / heads
  const legLen = (heads - 3.9) * H
  const thigh = legLen * 0.52
  const shin = legLen * 0.48
  const dir = (a: number): Pt => [Math.sin(rad(a)), Math.cos(rad(a))]
  const leg = (a: [number, number]): Pt[] => {
    const d1 = dir(a[0]), d2 = dir(a[1])
    const knee: Pt = [d1[0] * thigh, d1[1] * thigh]
    const ankle: Pt = [knee[0] + d2[0] * shin, knee[1] + d2[1] * shin]
    const f = rad(-0.55 * a[1])
    const toe: Pt = [ankle[0] + Math.cos(f) * H * 0.9, ankle[1] + Math.sin(f) * H * 0.9]
    return [[0, 0], knee, ankle, toe]
  }
  const la = leg(p.legA), lb = leg(p.legB)
  const reach = Math.max(la[2][1], lb[2][1])
  const feetX = (la[2][0] + lb[2][0]) / 2
  const spine = 2.5 * H * (1 + 0.012 * p.breath)
  const up: Pt = [Math.sin(rad(p.lean)), -Math.cos(rad(p.lean))]
  const chest: Pt = [up[0] * spine, up[1] * spine]
  const hAng = p.lean + p.head
  const headUp: Pt = [Math.sin(rad(hAng)), -Math.cos(rad(hAng))]
  const headC: Pt = [chest[0] + headUp[0] * 0.8 * H, chest[1] + headUp[1] * 0.8 * H]
  const arm = (a: [number, number], off: number): Pt[] => {
    const d1 = dir(a[0]), d2 = dir(a[1])
    const sh: Pt = [chest[0] + off, chest[1] + 0.02 * H]
    const el: Pt = [sh[0] + d1[0] * 1.4 * H, sh[1] + d1[1] * 1.4 * H]
    const wr: Pt = [el[0] + d2[0] * 1.15 * H, el[1] + d2[1] * 1.15 * H]
    const hd: Pt = [wr[0] + d2[0] * 0.38 * H, wr[1] + d2[1] * 0.38 * H]
    return [sh, el, wr, hd]
  }
  let aa = arm(p.armA, 0.04 * H), ab = arm(p.armB, -0.06 * H)
  let pel: Pt
  let ch = chest
  let hc = headC
  const rotated = Math.abs(p.rot) > 1
  if (rotated) pel = [0, 200 - (0.3 + p.air) * H]
  else pel = [-feetX, 200 - reach - p.air * H]
  const rotate = (q: Pt): Pt => {
    if (!rotated) return q
    const r = rad(p.rot)
    return [q[0] * Math.cos(r) - q[1] * Math.sin(r), q[0] * Math.sin(r) + q[1] * Math.cos(r)]
  }
  const T = (q: Pt): Pt => {
    const r = rotate(q)
    return [r[0] + (rotated ? 0 : -feetX), r[1] + pel[1]]
  }
  aa = aa.map(T); ab = ab.map(T)
  ch = T(ch); hc = T(hc)
  return {
    pelvis: T([0, 0]), chest: ch, headC: hc, headAng: hAng + (rotated ? p.rot : 0), armA: aa, armB: ab,
    legA: la.map(T), legB: lb.map(T), H,
  }
}

export interface FigureFlags { masses: boolean; action: boolean; ground: boolean }

function mass(g: G, a: Pt, b: Pt, thick: number, kind: 'main' | 'faint' = 'faint'): void {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  g.ellipse(mx, my, len / 2 + thick * 0.15, thick, Math.atan2(b[1] - a[1], b[0] - a[0]), kind)
}

export function drawSideFigure(g: G, pose: Pose, heads: number, f: FigureFlags): void {
  const J = solve(pose, heads)
  const H = J.H
  if (f.ground) g.line(-260, 200, 260, 200, 'axis')

  const limb = (pts: Pt[], t1: number, t2: number, far: boolean, leg: boolean) => {
    const kind = far ? 'faint' : 'main'
    if (f.masses) {
      mass(g, pts[0], pts[1], t1 * H, 'faint')
      mass(g, pts[1], pts[2], t2 * H, 'faint')
    }
    g.poly(pts.slice(0, 3), false, kind)
    if (leg) g.poly([pts[2], pts[3]], false, kind)
    else g.circle(pts[3][0], pts[3][1], 0.13 * H, kind)
    pts.slice(0, 3).forEach((q) => g.joint(q[0], q[1], far ? 2.5 : 3.5))
  }
  limb(J.legB, 0.19, 0.14, true, true)
  limb(J.armB, 0.15, 0.11, true, false)

  // torso: rib cage, pelvis, spine
  const { pelvis: pv, chest: ch } = J
  const sx = ch[0] - pv[0], sy = ch[1] - pv[1]
  const ang = Math.atan2(sy, sx)
  if (f.masses) {
    g.ellipse(pv[0] + sx * 0.7, pv[1] + sy * 0.7, 1.0 * H, 0.52 * H, ang, 'main')
    g.ellipse(pv[0], pv[1], 0.42 * H, 0.5 * H, ang + Math.PI / 2, 'main')
  }
  g.line(pv[0], pv[1], ch[0], ch[1], 'axis')
  g.line(ch[0], ch[1], J.headC[0], J.headC[1], 'faint')
  g.joint(pv[0], pv[1], 4.5)
  g.joint(ch[0], ch[1], 4)

  // head
  const ha = (J.headAng * Math.PI) / 180
  g.ellipse(J.headC[0], J.headC[1], 0.42 * H, 0.5 * H, ha, 'main')
  const fx = Math.cos(ha), fy = Math.sin(ha)
  g.line(J.headC[0] - fx * 0.42 * H, J.headC[1] - fy * 0.42 * H, J.headC[0] + fx * 0.52 * H, J.headC[1] + fy * 0.52 * H, 'axis')

  limb(J.legA, 0.19, 0.14, false, true)
  limb(J.armA, 0.15, 0.11, false, false)

  if (f.action) {
    const top: Pt = [J.headC[0] - Math.sin(ha) * 0.5 * H, J.headC[1] + Math.cos(ha) * -0.5 * H]
    const mid: Pt = [(J.pelvis[0] + J.chest[0]) / 2 + 0.12 * H, (J.pelvis[1] + J.chest[1]) / 2]
    const base: Pt = [(J.legA[2][0] + J.legB[2][0]) / 2, Math.max(J.legA[2][1], J.legB[2][1])]
    g.curve([top, mid, J.pelvis, base], 'axis')
  }
}

export function drawFrontFigure(g: G, heads: number, yawDeg: number, f: FigureFlags): void {
  const H = 400 / heads
  const yaw = rad(yawDeg)
  const cs = Math.cos(yaw), sn = Math.sin(yaw)
  const ac = Math.abs(cs)
  const top = -200
  const headY = top + 0.5 * H
  const shY = top + 1.35 * H
  const pelY = top + 3.7 * H
  const half = (0.5 + 0.38 * ac) * H
  const hip = (0.3 + 0.18 * ac) * H
  if (f.ground) g.line(-260, 200, 260, 200, 'axis')

  // head (shared 3D construction)
  drawHead(g, { yaw: yawDeg, pitch: 0, roll: 0, r: 0.5 * H }, 0, headY)
  // trunk
  g.line(-half, shY, half, shY, 'main')
  g.joint(-half, shY, 3.5); g.joint(half, shY, 3.5)
  if (f.masses) {
    g.ellipse(0, shY + 1.0 * H, half * 0.82, 1.05 * H, 0, 'main')
    g.ellipse(0, pelY, hip * 1.05, 0.46 * H, 0, 'main')
  }
  g.line(0, shY, 0, pelY, 'axis')
  g.joint(0, pelY, 4.5)
  // limbs
  const legLen = (heads - 3.9) * H
  for (const s of [-1, 1]) {
    const lx = s * hip * 0.62
    const knee: Pt = [lx * 1.02, pelY + legLen * 0.52]
    const ank: Pt = [lx * 1.04, 200 - 0.05 * H]
    g.poly([[lx, pelY], knee, ank], false, 'main')
    if (f.masses) { mass(g, [lx, pelY], knee, 0.19 * H); mass(g, knee, ank, 0.14 * H) }
    g.line(ank[0], ank[1], ank[0] + s * 0.5 * H * Math.max(0.2, ac), 200, 'main')
    ;[[lx, pelY], knee, ank].forEach((q) => g.joint(q[0], q[1], 3))
    const sh: Pt = [s * half, shY]
    const el: Pt = [s * (half + 0.12 * H * ac), shY + 1.4 * H]
    const wr: Pt = [s * (half + 0.2 * H * ac), shY + 2.55 * H]
    g.poly([sh, el, wr], false, 'main')
    if (f.masses) { mass(g, sh, el, 0.15 * H); mass(g, el, wr, 0.11 * H) }
    g.circle(wr[0], wr[1] + 0.2 * H, 0.13 * H)
    ;[sh, el, wr].forEach((q) => g.joint(q[0], q[1], 3))
  }
  void sn
}

const KEY_NAMES: [number, string][] = [[0, 'Contact'], [0.125, 'Down'], [0.25, 'Passing'], [0.375, 'Up'], [0.5, 'Contact'], [0.625, 'Down'], [0.75, 'Passing'], [0.875, 'Up'], [1, 'Contact']]
export function keyPoseName(phase: number, tol = 0.05): string | null {
  for (const [p, n] of KEY_NAMES) if (Math.abs(p - phase) < tol) return n
  return null
}
