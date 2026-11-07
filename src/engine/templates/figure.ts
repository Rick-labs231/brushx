import { circ, joint, line, type GuideShape, type V } from './shapes.ts'

// A forward-kinematics stick figure. Angles are degrees from "straight down";
// positive swings toward +x (the figure faces right).

export interface Pose {
  /** whole-torso lean from upright, degrees, positive = forward */
  lean: number
  /** head tilt relative to the torso */
  head: number
  /** [shoulder angle, elbow bend] */
  armL: [number, number]
  armR: [number, number]
  /** [hip angle, knee bend] - the knee bends backward */
  legL: [number, number]
  legR: [number, number]
  /** lifted off the ground by this much (unit box) */
  lift?: number
  /** skip planting the feet (floating poses like falling) */
  free?: boolean
}

export const BODY = { torso: 0.22, neck: 0.035, head: 0.05, upperArm: 0.12, foreArm: 0.11, thigh: 0.16, shin: 0.16, shoulder: 0.03, hip: 0.025 }
export const GROUND = 0.42

const rad = (d: number) => (d * Math.PI) / 180
const dir = (deg: number): V => [Math.sin(rad(deg)), Math.cos(rad(deg))]
const add = (a: V, b: V, k = 1): V => [a[0] + b[0] * k, a[1] + b[1] * k]

export interface Joints {
  hip: V
  chest: V
  head: V
  shL: V
  shR: V
  elL: V
  elR: V
  haL: V
  haR: V
  hpL: V
  hpR: V
  knL: V
  knR: V
  ftL: V
  ftR: V
}

export function solve(p: Pose): Joints {
  const up = (a: number): V => [Math.sin(rad(a)), -Math.cos(rad(a))]
  const hip: V = [0, 0]
  const chest = add(hip, up(p.lean), BODY.torso)
  const head = add(chest, up(p.lean + p.head * 0.5), BODY.neck + BODY.head)
  const perp: V = [Math.cos(rad(p.lean)), Math.sin(rad(p.lean))]
  const shL = add(chest, perp, -BODY.shoulder)
  const shR = add(chest, perp, BODY.shoulder)
  const hpL = add(hip, perp, -BODY.hip)
  const hpR = add(hip, perp, BODY.hip)
  const arm = (sh: V, [a, b]: [number, number]): [V, V] => {
    const el = add(sh, dir(a), BODY.upperArm)
    return [el, add(el, dir(a + b), BODY.foreArm)]
  }
  const leg = (h: V, [a, b]: [number, number]): [V, V] => {
    const kn = add(h, dir(a), BODY.thigh)
    return [kn, add(kn, dir(a - b), BODY.shin)]
  }
  const [elL, haL] = arm(shL, p.armL)
  const [elR, haR] = arm(shR, p.armR)
  const [knL, ftL] = leg(hpL, p.legL)
  const [knR, ftR] = leg(hpR, p.legR)
  const j: Joints = { hip, chest, head, shL, shR, elL, elR, haL, haR, hpL, hpR, knL, knR, ftL, ftR }
  if (!p.free) {
    // plant the lowest foot (or kneeling knee) on the ground
    const low = Math.max(ftL[1], ftR[1], p.legL[1] > 70 ? knL[1] : -Infinity, p.legR[1] > 70 ? knR[1] : -Infinity)
    const dy = GROUND - low - (p.lift ?? 0)
    for (const k of Object.keys(j) as (keyof Joints)[]) j[k] = [j[k][0], j[k][1] + dy]
  } else {
    const dy = GROUND - BODY.thigh - BODY.shin - (p.lift ?? 0) // hip height of a standing figure, minus the lift
    for (const k of Object.keys(j) as (keyof Joints)[]) j[k] = [j[k][0], j[k][1] + dy]
  }
  return j
}

/** Stick figure as construction lines: head, spine, limbs, joint dots, centre of gravity line. */
export function figureShapes(p: Pose, opts: { ground?: boolean } = {}): GuideShape[] {
  const j = solve(p)
  const neck: V = [j.chest[0] + (j.head[0] - j.chest[0]) * (BODY.neck / (BODY.neck + BODY.head)), j.chest[1] + (j.head[1] - j.chest[1]) * (BODY.neck / (BODY.neck + BODY.head))]
  const out: GuideShape[] = [
    circ(j.head[0], j.head[1], BODY.head),
    line(neck, j.chest, j.hip),
    line(j.shL, j.shR),
    line(j.hpL, j.hpR),
    line(j.shL, j.elL, j.haL),
    line(j.shR, j.elR, j.haR),
    line(j.hpL, j.knL, j.ftL),
    line(j.hpR, j.knR, j.ftR),
    ...[j.elL, j.elR, j.knL, j.knR, j.hip, j.chest].map((v) => joint(v[0], v[1])),
  ]
  if (opts.ground !== false) out.push(line([-0.45, GROUND], [0.45, GROUND]))
  return out
}
