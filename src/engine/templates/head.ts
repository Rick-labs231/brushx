import { ell, line, type GuideShape, type V } from './shapes.ts'

// Loomis-style head built from a real sphere, so the angle can be turned
// smoothly (e.g. 20° → 45° → 70°). Only the front-facing parts are drawn.

const R = 0.2
const CY = -0.08
const rad = (d: number) => (d * Math.PI) / 180

type P3 = [number, number, number] // x right, y down, z toward viewer

function rotate(p: P3, yaw: number, pitch: number): P3 {
  const cy = Math.cos(rad(yaw))
  const sy = Math.sin(rad(yaw))
  const x = p[0] * cy + p[2] * sy
  const z1 = -p[0] * sy + p[2] * cy
  const cp = Math.cos(rad(pitch))
  const sp = Math.sin(rad(pitch))
  return [x, p[1] * cp - z1 * sp, p[1] * sp + z1 * cp]
}

const sph = (lat: number, lon: number): P3 => [Math.cos(rad(lat)) * Math.sin(rad(lon)), Math.sin(rad(lat)), Math.cos(rad(lat)) * Math.cos(rad(lon))]

/** Projects a 3D path and keeps only the runs facing the viewer. */
function visible(path: P3[], yaw: number, pitch: number, scale = 1): GuideShape[] {
  const out: GuideShape[] = []
  let run: V[] = []
  for (const p of path) {
    const q = rotate(p, yaw, pitch)
    if (q[2] >= -0.02) run.push([q[0] * R * scale, CY + q[1] * R * scale])
    else {
      if (run.length > 1) out.push(line(...run))
      run = []
    }
  }
  if (run.length > 1) out.push(line(...run))
  return out
}

const arc = (f: (t: number) => P3, a: number, b: number, n = 28): P3[] => Array.from({ length: n + 1 }, (_, i) => f(a + ((b - a) * i) / n))

export function headShapes(yaw: number, pitch: number): GuideShape[] {
  const s: GuideShape[] = [ell(0, CY, R, R)]
  // face centre line and horizontal rings: brow, nose, mouth
  s.push(...visible(arc((l) => sph(l, 0), -90, 90), yaw, pitch))
  for (const lat of [0, 26, 46]) s.push(...visible(arc((l) => sph(lat, l), -180, 180, 48), yaw, pitch))
  // side planes (the Loomis "cut")
  for (const lon of [-62, 62]) s.push(...visible(arc((l) => sph(l, lon), -90, 90), yaw, pitch))
  // jaw: ear -> jaw corner -> chin
  const jaw = (side: number): P3[] => [sph(14, 82 * side), sph(40, 62 * side), sph(58, 40 * side), sph(70, 14 * side), sph(74, 0)]
  s.push(...visible(jaw(-1), yaw, pitch, 1.02), ...visible(jaw(1), yaw, pitch, 1.02))
  // nose and eyes sit on the sphere surface
  const tip = rotate([0, Math.sin(rad(30)) * 1.14, Math.cos(rad(30)) * 1.14], yaw, pitch)
  const bridge = rotate(sph(0, 0), yaw, pitch)
  if (tip[2] > 0) s.push(line([bridge[0] * R, CY + bridge[1] * R], [tip[0] * R, CY + tip[1] * R]))
  for (const side of [-1, 1]) {
    const e = rotate(sph(3, 27 * side), yaw, pitch)
    if (e[2] > 0.05) s.push(ell(e[0] * R, CY + e[1] * R, 0.045 * Math.max(0.25, e[2]), 0.022))
    const ear = rotate(sph(8, 90 * side), yaw, pitch)
    if (ear[2] > -0.05) s.push(ell(ear[0] * R * 1.04, CY + ear[1] * R, 0.012 + 0.04 * Math.abs(Math.sin(rad(yaw))), 0.06))
  }
  // neck
  const nx = Math.sin(rad(yaw)) * 0.02
  s.push(line([-0.07 + nx, CY + R * 0.78], [-0.07 + nx, 0.34]), line([0.07 + nx, CY + R * 0.78], [0.07 + nx, 0.34]))
  return s
}
