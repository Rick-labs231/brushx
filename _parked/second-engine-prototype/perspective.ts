import type { PerspectiveGuide, PerspectiveKind, Vec } from './types'

export const PERSPECTIVE_KINDS: { id: PerspectiveKind; label: string; hint: string }[] = [
  { id: 'one-point', label: 'One-point', hint: 'Roads, corridors, rooms seen straight on' },
  { id: 'two-point', label: 'Two-point', hint: 'Buildings and objects seen at a corner' },
  { id: 'three-point', label: 'Three-point', hint: 'Dramatic angles with a vertical vanishing point' },
  { id: 'four-point', label: 'Four-point', hint: 'Wide scenes with top and bottom vanishing points' },
  { id: 'five-point', label: 'Five-point / fisheye', hint: 'Curved lens view with a centre point' },
  { id: 'curvilinear', label: 'Curvilinear', hint: 'Curved lines through four vanishing points' },
  { id: 'isometric', label: 'Isometric', hint: 'Parallel 30° grid for props and environments' },
  { id: 'birds-eye', label: "Bird's-eye", hint: 'Looking down: verticals converge below' },
  { id: 'worms-eye', label: "Worm's-eye", hint: 'Looking up: verticals converge above' },
]

export function defaultPerspective(kind: PerspectiveKind, w: number, h: number): PerspectiveGuide {
  const hy = h * 0.5
  const vps: Vec[] = []
  switch (kind) {
    case 'one-point': vps.push({ x: w * 0.5, y: hy }); break
    case 'two-point': vps.push({ x: -w * 0.3, y: hy }, { x: w * 1.3, y: hy }); break
    case 'three-point': vps.push({ x: -w * 0.3, y: hy }, { x: w * 1.3, y: hy }, { x: w * 0.5, y: h * 2.2 }); break
    case 'birds-eye': vps.push({ x: -w * 0.3, y: h * 0.25 }, { x: w * 1.3, y: h * 0.25 }, { x: w * 0.5, y: h * 2.4 }); break
    case 'worms-eye': vps.push({ x: -w * 0.3, y: h * 0.75 }, { x: w * 1.3, y: h * 0.75 }, { x: w * 0.5, y: -h * 1.4 }); break
    case 'four-point':
      vps.push({ x: -w * 0.2, y: hy }, { x: w * 1.2, y: hy }, { x: w * 0.5, y: -h * 0.9 }, { x: w * 0.5, y: h * 1.9 }); break
    case 'five-point':
      vps.push({ x: w * 0.5, y: hy }, { x: -w * 0.1, y: hy }, { x: w * 1.1, y: hy }, { x: w * 0.5, y: -h * 0.1 }, { x: w * 0.5, y: h * 1.1 }); break
    case 'curvilinear':
      vps.push({ x: -w * 0.1, y: hy }, { x: w * 1.1, y: hy }, { x: w * 0.5, y: -h * 0.1 }, { x: w * 0.5, y: h * 1.1 }); break
    case 'isometric': break
  }
  return { kind, vps, density: kind === 'isometric' ? 28 : 16, snap: false, visible: true, opacity: 0.55 }
}

const rad = (d: number) => (d * Math.PI) / 180

/** Unit directions a snapped stroke starting at `from` may follow. */
export function snapDirections(g: PerspectiveGuide, from: Vec): Vec[] {
  if (g.kind === 'isometric') {
    return [rad(30), rad(150), rad(90)].map((a) => ({ x: Math.cos(a), y: Math.sin(a) }))
  }
  const out: Vec[] = []
  g.vps.forEach((vp, i) => {
    if ((g.kind === 'five-point' || g.kind === 'curvilinear')) return
    const dx = vp.x - from.x
    const dy = vp.y - from.y
    const d = Math.hypot(dx, dy)
    if (d > 1e-3 && i >= 0) out.push({ x: dx / d, y: dy / d })
  })
  // parallel verticals / horizontals where no vanishing point exists for them
  const hasVertical = g.vps.length >= 3 && g.kind !== 'five-point'
  if (!hasVertical) out.push({ x: 0, y: 1 })
  if (g.kind === 'one-point') out.push({ x: 1, y: 0 })
  return out
}

/** Constrain a drag from `start` to `p` along the nearest guide direction (within tolerance). */
export function snapPoint(g: PerspectiveGuide, start: Vec, p: Vec, tolDeg = 16): Vec {
  const dx = p.x - start.x
  const dy = p.y - start.y
  const len = Math.hypot(dx, dy)
  if (len < 6) return p
  let best: Vec | null = null
  let bestAng = rad(tolDeg)
  for (const d of snapDirections(g, start)) {
    for (const s of [1, -1]) {
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * d.x * s + dy * d.y * s) / len)))
      if (ang < bestAng) { bestAng = ang; best = { x: d.x * s, y: d.y * s } }
    }
  }
  if (!best) return p
  const t = dx * best.x + dy * best.y
  return { x: start.x + best.x * t, y: start.y + best.y * t }
}

function fan(ctx: CanvasRenderingContext2D, vp: Vec, w: number, h: number, n: number): void {
  const L = Math.hypot(w, h) * 6
  const inside = vp.x > -w * 0.05 && vp.x < w * 1.05 && vp.y > -h * 0.05 && vp.y < h * 1.05
  let a0 = 0
  let span = Math.PI * 2
  if (!inside) {
    const cx = w / 2 - vp.x
    const cy = h / 2 - vp.y
    const ac = Math.atan2(cy, cx)
    let lo = 0
    let hi = 0
    for (const [px, py] of [[0, 0], [w, 0], [w, h], [0, h]]) {
      let d = Math.atan2(py - vp.y, px - vp.x) - ac
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      lo = Math.min(lo, d)
      hi = Math.max(hi, d)
    }
    a0 = ac + lo
    span = hi - lo
  }
  const count = Math.max(2, n)
  ctx.beginPath()
  for (let i = 0; i < count; i++) {
    const t = inside ? i / count : i / (count - 1)
    const a = a0 + span * t
    ctx.moveTo(vp.x, vp.y)
    ctx.lineTo(vp.x + Math.cos(a) * L, vp.y + Math.sin(a) * L)
  }
  ctx.stroke()
}

function parallels(ctx: CanvasRenderingContext2D, w: number, h: number, vertical: boolean, step: number): void {
  ctx.beginPath()
  if (vertical) for (let x = 0; x <= w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h) }
  else for (let y = 0; y <= h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y) }
  ctx.stroke()
}

/** Family of lens-shaped curves through two vanishing points (curvilinear / fisheye grids). */
function lens(ctx: CanvasRenderingContext2D, a: Vec, b: Vec, n: number): void {
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  ctx.beginPath()
  const k = Math.max(2, Math.round(n / 2))
  for (let i = -k; i <= k; i++) {
    const off = (i / k) * len * 0.9
    ctx.moveTo(a.x, a.y)
    ctx.quadraticCurveTo(mx + nx * off * 2, my + ny * off * 2, b.x, b.y)
  }
  ctx.stroke()
}

export function drawPerspective(ctx: CanvasRenderingContext2D, g: PerspectiveGuide, w: number, h: number, zoom: number): void {
  if (!g.visible) return
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, w, h)
  ctx.clip()
  ctx.lineWidth = 1 / zoom
  ctx.globalAlpha = g.opacity
  ctx.strokeStyle = 'rgba(155, 92, 255, 0.55)'
  const step = Math.max(24, w / g.density)
  const n = g.density

  switch (g.kind) {
    case 'one-point':
      fan(ctx, g.vps[0], w, h, n * 2)
      parallels(ctx, w, h, false, step)
      parallels(ctx, w, h, true, step)
      break
    case 'two-point':
      g.vps.forEach((vp) => fan(ctx, vp, w, h, n))
      parallels(ctx, w, h, true, step)
      break
    case 'three-point': case 'birds-eye': case 'worms-eye':
      g.vps.forEach((vp) => fan(ctx, vp, w, h, n))
      break
    case 'four-point':
      g.vps.forEach((vp) => fan(ctx, vp, w, h, Math.round(n * 0.8)))
      break
    case 'five-point':
      fan(ctx, g.vps[0], w, h, n * 2)
      lens(ctx, g.vps[1], g.vps[2], n)
      lens(ctx, g.vps[3], g.vps[4], n)
      break
    case 'curvilinear':
      lens(ctx, g.vps[0], g.vps[1], n)
      lens(ctx, g.vps[2], g.vps[3], n)
      break
    case 'isometric': {
      const s = Math.max(16, w / g.density)
      const L = Math.hypot(w, h)
      ctx.beginPath()
      for (const ang of [rad(30), rad(150)]) {
        const dx = Math.cos(ang)
        const dy = Math.sin(ang)
        const px = -dy
        const py = dx
        const span = Math.ceil((L * 2) / s)
        for (let i = -span; i <= span; i++) {
          const ox = px * i * s
          const oy = py * i * s
          ctx.moveTo(w / 2 + ox - dx * L, h / 2 + oy - dy * L)
          ctx.lineTo(w / 2 + ox + dx * L, h / 2 + oy + dy * L)
        }
      }
      for (let x = (w / 2) % (s * 1.732); x <= w; x += s * 1.732) { ctx.moveTo(x, 0); ctx.lineTo(x, h) }
      ctx.stroke()
      break
    }
  }

  // horizon line
  const horizonVps = g.vps.filter((_, i) => g.kind !== 'isometric' && i < (g.kind === 'one-point' ? 1 : 2))
  if (horizonVps.length) {
    ctx.strokeStyle = 'rgba(109, 184, 255, 0.9)'
    ctx.lineWidth = 1.5 / zoom
    ctx.setLineDash([10 / zoom, 6 / zoom])
    ctx.globalAlpha = Math.min(1, g.opacity + 0.25)
    ctx.beginPath()
    ctx.moveTo(0, horizonVps[0].y)
    ctx.lineTo(w, horizonVps[0].y)
    ctx.stroke()
  }
  ctx.restore()
}

/** Keep horizon-sharing vanishing points aligned after one of them moves. */
export function moveVanishingPoint(g: PerspectiveGuide, index: number, to: Vec): void {
  const horizonCount = g.kind === 'one-point' ? 1 : g.kind === 'five-point' ? 3 : 2
  const hasHorizon = g.kind === 'five-point' || g.kind === 'curvilinear' ? false : true
  if (g.kind === 'five-point' || g.kind === 'curvilinear') {
    g.vps[index] = to
    return
  }
  if (hasHorizon && index < horizonCount) {
    for (let i = 0; i < horizonCount; i++) g.vps[i] = { x: i === index ? to.x : g.vps[i].x, y: to.y }
  } else {
    g.vps[index] = to
  }
}
