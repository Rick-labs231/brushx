import { figureShapes, type Pose } from './figure.ts'
import { headShapes } from './head.ts'
import { circ, curve, ell, line, type GuideShape } from './shapes.ts'

const TAU = Math.PI * 2
const smooth = (u: number) => u * u * (3 - 2 * u)
const lerp = (a: number, b: number, u: number) => a + (b - a) * u
const lerp2 = (a: [number, number], b: [number, number], u: number): [number, number] => [lerp(a[0], b[0], u), lerp(a[1], b[1], u)]

export function lerpPose(a: Pose, b: Pose, u: number): Pose {
  return {
    lean: lerp(a.lean, b.lean, u),
    head: lerp(a.head, b.head, u),
    armL: lerp2(a.armL, b.armL, u),
    armR: lerp2(a.armR, b.armR, u),
    legL: lerp2(a.legL, b.legL, u),
    legR: lerp2(a.legR, b.legR, u),
    lift: lerp(a.lift ?? 0, b.lift ?? 0, u),
    free: a.free && b.free,
  }
}

type Key = [number, Pose]
/** Eased interpolation through keyed poses; t in 0..1. Keys must start at 0 and end at 1. */
export function keyed(keys: Key[], t: number): Pose {
  const tt = Math.max(0, Math.min(1, t))
  for (let i = 0; i < keys.length - 1; i += 1) {
    const [t0, p0] = keys[i]
    const [t1, p1] = keys[i + 1]
    if (tt <= t1) return lerpPose(p0, p1, smooth((tt - t0) / Math.max(1e-6, t1 - t0)))
  }
  return keys[keys.length - 1][1]
}

const P = (lean: number, head: number, armL: [number, number], armR: [number, number], legL: [number, number], legR: [number, number], extra: Partial<Pose> = {}): Pose => ({ lean, head, armL, armR, legL, legR, ...extra })

export const POSES = {
  standing: P(0, 0, [6, 8], [-6, 8], [3, 0], [-3, 0]),
  walking: P(4, 0, [-26, 14], [26, 14], [28, 4], [-22, 22]),
  running: P(16, 2, [-55, 85], [48, 90], [-48, 75], [52, 28], { free: true, lift: 0.0 }),
  jumping: P(0, -4, [150, 14], [160, 12], [28, 62], [8, 54], { free: true, lift: 0.07 }),
  sitting: P(2, 0, [18, 40], [8, 50], [90, 90], [86, 90]),
  kneeling: P(4, 0, [14, 50], [-4, 60], [80, 80], [2, 90]),
  falling: P(68, 30, [125, 20], [-30, 25], [-62, 40], [-18, 62], { free: true, lift: 0.1 }),
  fighting: P(-4, 0, [42, 112], [24, 122], [30, 14], [-28, 10]),
  reaching: P(10, -6, [152, 8], [-12, 24], [10, 0], [-8, 0]),
  turning: P(2, 55, [10, 20], [-14, 30], [8, 0], [-10, 4]),
} satisfies Record<string, Pose>

export interface CycleDef {
  id: string
  title: string
  description: string
  defaultFrames: number
  /** whether the last frame leads back into the first */
  loops: boolean
  /** construction lines for frame i of n */
  frame: (i: number, n: number) => GuideShape[]
}

const phase = (i: number, n: number, loops: boolean) => (loops ? i / n : n <= 1 ? 0 : i / (n - 1))

function walkPose(t: number): Pose {
  const f = TAU * t
  const leg = (ph: number): [number, number] => [28 * Math.sin(ph), 6 + 38 * Math.max(0, Math.cos(ph))]
  const arm = (ph: number): [number, number] => [-24 * Math.sin(ph), 14 + 8 * Math.max(0, Math.cos(ph))]
  return P(3, 2 * Math.sin(f * 2), arm(f), arm(f + Math.PI), leg(f), leg(f + Math.PI))
}

function runPose(t: number): Pose {
  const f = TAU * t
  const leg = (ph: number): [number, number] => [46 * Math.sin(ph), 18 + 78 * Math.max(0, Math.cos(ph))]
  const arm = (ph: number): [number, number] => [-46 * Math.sin(ph), 88]
  return P(16, 0, arm(f), arm(f + Math.PI), leg(f), leg(f + Math.PI), { free: true, lift: 0.015 + 0.05 * Math.max(0, -Math.cos(2 * f)) })
}

const stand = POSES.standing
const crouch = P(22, 4, [-30, 30], [-34, 30], [34, 74], [28, 70])
const tuck = P(6, 0, [120, 30], [128, 28], [40, 80], [34, 76], { free: true, lift: 0.1 })
const stretch = P(-4, -4, [155, 8], [162, 8], [6, 4], [-4, 6], { free: true, lift: 0.12 })

function jumpPose(t: number): Pose {
  return keyed([[0, stand], [0.18, crouch], [0.3, stretch], [0.5, tuck], [0.74, P(2, 0, [100, 20], [108, 18], [14, 20], [6, 16], { free: true, lift: 0.1 })], [0.86, crouch], [1, stand]], t)
}

const idleA = P(0, 0, [6, 8], [-6, 8], [3, 0], [-3, 0])
const idleB = P(1.5, 2, [9, 12], [-3, 10], [3, 3], [-3, 3])

const punchKeys: Key[] = [[0, POSES.fighting], [0.3, P(-14, 0, [30, 125], [-40, 120], [30, 18], [-28, 12])], [0.45, P(14, 0, [30, 125], [82, 4], [34, 16], [-30, 14])], [0.7, P(14, 0, [30, 125], [82, 4], [34, 16], [-30, 14])], [1, POSES.fighting]]
const kickKeys: Key[] = [[0, POSES.fighting], [0.3, P(-8, 0, [40, 110], [20, 120], [-6, 18], [-26, 70])], [0.55, P(-14, 0, [50, 100], [30, 110], [2, 4], [86, 6])], [0.75, P(-14, 0, [50, 100], [30, 110], [2, 4], [86, 6])], [1, POSES.fighting]]
const throwKeys: Key[] = [[0, stand], [0.35, P(-12, -6, [-40, 20], [-150, 80], [22, 8], [-26, 10])], [0.6, P(14, 6, [20, 30], [90, 8], [30, 6], [-24, 20])], [1, P(6, 2, [10, 20], [30, 12], [20, 8], [-14, 14])]]
const fallKeys: Key[] = [[0, P(4, 0, [30, 20], [-10, 20], [6, 4], [-6, 4])], [0.5, POSES.falling], [1, P(72, 20, [95, 30], [40, 40], [-70, 20], [-60, 30])]]
const landKeys: Key[] = [[0, P(2, 0, [100, 20], [108, 18], [14, 20], [6, 16], { free: true, lift: 0.1 })], [0.4, P(20, 4, [-20, 30], [-26, 30], [30, 70], [26, 64])], [0.7, P(26, 6, [-24, 36], [-30, 36], [38, 84], [34, 80])], [1, stand]]

function wavePose(t: number): Pose {
  const wag = Math.sin(TAU * t * 2)
  return P(0, 4 * wag, [6, 8], [158 + 4 * wag, 24 + 34 * wag], [3, 0], [-3, 0])
}

function blink(i: number, n: number): GuideShape[] {
  const t = phase(i, n, true)
  const open = 1 - Math.exp(-Math.pow((t - 0.5) / 0.14, 2)) // closes mid-cycle, opens again
  const ry = 0.015 + 0.085 * open
  return [
    ell(0, 0, 0.22, ry),
    curve([-0.22, 0], [0, -ry * 2], [0.22, 0]),
    curve([-0.22, 0], [0, ry * 2], [0.22, 0]),
    circ(0, 0, 0.06 * Math.min(1, open * 1.2 + 0.1)),
    curve([-0.24, -0.1 - ry * 0.5], [0, -0.3 - ry], [0.24, -0.1 - ry * 0.5]),
    line([-0.3, 0], [0.3, 0]),
    line([0, -0.3], [0, 0.2]),
  ]
}

function breathing(i: number, n: number): GuideShape[] {
  const k = 0.5 - 0.5 * Math.cos(TAU * phase(i, n, true))
  const chest = 0.15 + 0.025 * k
  return [
    ell(0, -0.12 - 0.01 * k, chest, 0.14 + 0.012 * k),
    ell(0, 0.15, 0.12, 0.09),
    line([0, -0.3 - 0.01 * k], [0, 0.24]),
    line([-0.24, -0.2 - 0.018 * k], [0.24, -0.2 - 0.018 * k]),
    curve([-chest, -0.12], [0, -0.04 + 0.03 * k], [chest, -0.12]),
    line([-0.3, -0.34], [0.3, -0.34]),
    line([-0.3, -0.34 - 0.02 * k], [0.3, -0.34 - 0.02 * k]),
  ]
}

const fig = (pose: (t: number) => Pose, loops: boolean) => (i: number, n: number) => figureShapes(pose(phase(i, n, loops)))

export const CYCLES: CycleDef[] = [
  { id: 'walk', title: 'Walk cycle', description: 'Contact, down, passing, up - arms swing opposite the legs', defaultFrames: 8, loops: true, frame: fig(walkPose, true) },
  { id: 'run', title: 'Run cycle', description: 'Leaned stride with airborne frames', defaultFrames: 8, loops: true, frame: fig(runPose, true) },
  { id: 'jump', title: 'Jump', description: 'Crouch, launch, tuck, land', defaultFrames: 10, loops: false, frame: fig(jumpPose, false) },
  { id: 'idle', title: 'Idle', description: 'Weight shifts and a slow breath', defaultFrames: 6, loops: true, frame: (i, n) => figureShapes(keyed([[0, idleA], [0.5, idleB], [1, idleA]], phase(i, n, true))) },
  { id: 'turnaround', title: 'Turnaround', description: 'Head rotating a full 360°', defaultFrames: 8, loops: true, frame: (i, n) => headShapes(phase(i, n, true) * 360, 0) },
  { id: 'head-turn', title: 'Head turn', description: 'Front to three-quarter to profile', defaultFrames: 6, loops: false, frame: (i, n) => headShapes(phase(i, n, false) * 80, 0) },
  { id: 'falling', title: 'Falling', description: 'Loss of balance into a fall', defaultFrames: 8, loops: false, frame: fig((t) => keyed(fallKeys, t), false) },
  { id: 'landing', title: 'Landing', description: 'Impact squash and recovery', defaultFrames: 6, loops: false, frame: fig((t) => keyed(landKeys, t), false) },
  { id: 'punch', title: 'Punch', description: 'Wind-up, strike, recoil', defaultFrames: 6, loops: false, frame: fig((t) => keyed(punchKeys, t), false) },
  { id: 'kick', title: 'Kick', description: 'Chamber, extend, retract', defaultFrames: 6, loops: false, frame: fig((t) => keyed(kickKeys, t), false) },
  { id: 'throw', title: 'Throw', description: 'Reach back, release, follow-through', defaultFrames: 6, loops: false, frame: fig((t) => keyed(throwKeys, t), false) },
  { id: 'wave', title: 'Wave', description: 'Raised arm with a waving forearm', defaultFrames: 8, loops: true, frame: fig(wavePose, true) },
  { id: 'blink', title: 'Eye blink', description: 'Lids close and open', defaultFrames: 6, loops: true, frame: blink },
  { id: 'breathing', title: 'Breathing', description: 'Chest and shoulders rise and fall', defaultFrames: 8, loops: true, frame: breathing },
]

export const cycleById = (id: string): CycleDef | null => CYCLES.find((c) => c.id === id) ?? null
