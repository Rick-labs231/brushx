import { G, type Pt } from './draw'

export interface HeadOpts { yaw: number; pitch: number; roll: number; r: number }

type V3 = [number, number, number]

/**
 * Loomis-style head construction projected from 3D. x right, y down, z toward the viewer.
 * Draws the cranium, side planes, brow/eye/nose/mouth lines, jaw, and neck for any turn angle.
 */
export function drawHead(g: G, o: HeadOpts, cx = 0, cy = 0): void {
  const r = o.r
  const yaw = (o.yaw * Math.PI) / 180
  const pit = (o.pitch * Math.PI) / 180
  const rol = (o.roll * Math.PI) / 180
  const proj = (p: V3): { x: number; y: number; z: number } => {
    let [x, y, z] = p
    const x1 = x * Math.cos(yaw) + z * Math.sin(yaw)
    const z1 = -x * Math.sin(yaw) + z * Math.cos(yaw)
    x = x1; z = z1
    const y2 = y * Math.cos(pit) - z * Math.sin(pit)
    const z2 = y * Math.sin(pit) + z * Math.cos(pit)
    y = y2; z = z2
    const x3 = x * Math.cos(rol) - y * Math.sin(rol)
    const y3 = x * Math.sin(rol) + y * Math.cos(rol)
    return { x: cx + x3, y: cy + y3, z }
  }
  const P = (x: number, y: number, z: number) => proj([x * r, y * r, z * r])
  const pt = (p: { x: number; y: number }): Pt => [p.x, p.y]

  // neck (behind everything)
  const nl = P(-0.42, 1.0, -0.15), nr = P(0.42, 1.0, -0.15)
  const nl2 = P(-0.5, 2.7, -0.3), nr2 = P(0.5, 2.7, -0.3)
  g.line(nl.x, nl.y, nl2.x, nl2.y, 'faint')
  g.line(nr.x, nr.y, nr2.x, nr2.y, 'faint')

  // cranium outline is always a circle
  g.circle(cx, cy, r)

  // side planes (Loomis cuts)
  for (const s of [-1, 1]) {
    const pts: Pt[] = []
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2
      const x = s * 0.74
      const rr = Math.sqrt(1 - x * x)
      pts.push(pt(P(x, rr * Math.sin(a), rr * Math.cos(a))))
    }
    g.curve(pts, 'faint', true)
  }

  // meridian (centre line) and latitude lines; front half solid, back half faint
  const arc = (build: (a: number) => V3, a0: number, a1: number, kind: 'main' | 'axis') => {
    const front: Pt[] = []
    const back: Pt[] = []
    for (let i = 0; i <= 40; i++) {
      const a = a0 + ((a1 - a0) * i) / 40
      const p = build(a)
      const q = P(p[0], p[1], p[2])
      ;(q.z >= -0.05 * r ? front : back).push([q.x, q.y])
    }
    if (front.length > 1) g.curve(front, kind)
    if (back.length > 1) g.curve(back, 'faint')
  }
  arc((a) => [0, Math.sin(a) * 1.0, Math.cos(a) * 1.0], -Math.PI, Math.PI, 'axis') // centre line
  const lat = (y: number, rad: number) => (a: number): V3 => [Math.sin(a) * rad, y, Math.cos(a) * rad]
  arc(lat(0.05, 1.0), -Math.PI, Math.PI, 'main') // brow
  arc(lat(0.45, 0.93), -Math.PI * 0.5, Math.PI * 0.5, 'main') // eye line
  arc(lat(1.0, 0.82), -Math.PI * 0.5, Math.PI * 0.5, 'main') // nose base
  arc(lat(1.42, 0.7), -Math.PI * 0.5, Math.PI * 0.5, 'faint') // mouth

  // face mass: temple -> jaw angle -> chin
  const chin = P(0, 1.85, 0.8)
  const nose = P(0, 1.0, 1.28)
  for (const s of [-1, 1]) {
    const temple = P(0.8 * s, 0.1, 0.35)
    const cheek = P(0.78 * s, 0.95, 0.5)
    const jaw = P(0.78 * s, 1.3, -0.05)
    g.curve([pt(temple), pt(cheek), pt(jaw), pt(chin)], 'main')
    // ear
    const ear = P(0.97 * s, 0.7, -0.12)
    if (ear.z > -0.35 * r) g.ellipse(ear.x, ear.y, r * 0.13, r * 0.3, o.roll * Math.PI / 180, 'faint')
  }
  const c0 = P(0, 0.05, 1.0)
  g.line(c0.x, c0.y, nose.x, nose.y, 'faint')
  g.joint(nose.x, nose.y, 3)
  g.joint(chin.x, chin.y, 3)
}
