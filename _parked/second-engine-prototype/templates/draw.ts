export type LineKind = 'main' | 'axis' | 'faint'
export type Pt = [number, number]

const COLORS = { main: 'rgb(109,184,255)', axis: 'rgb(155,92,255)', faint: 'rgba(109,184,255,0.45)' }

/** Tiny drawing helper that gives every template the same construction-line look. */
export class G {
  ctx: CanvasRenderingContext2D
  lw: number
  constructor(ctx: CanvasRenderingContext2D, lw: number) {
    this.ctx = ctx
    this.lw = lw
  }
  private style(kind: LineKind): void {
    const c = this.ctx
    c.strokeStyle = COLORS[kind]
    c.lineWidth = kind === 'faint' ? this.lw * 0.75 : this.lw
    c.setLineDash(kind === 'axis' ? [this.lw * 5, this.lw * 4] : [])
    c.lineCap = 'round'
    c.lineJoin = 'round'
  }
  line(x1: number, y1: number, x2: number, y2: number, kind: LineKind = 'main'): void {
    this.style(kind)
    this.ctx.beginPath()
    this.ctx.moveTo(x1, y1)
    this.ctx.lineTo(x2, y2)
    this.ctx.stroke()
  }
  circle(x: number, y: number, r: number, kind: LineKind = 'main'): void {
    this.ellipse(x, y, r, r, 0, kind)
  }
  ellipse(x: number, y: number, rx: number, ry: number, rot = 0, kind: LineKind = 'main', a0 = 0, a1 = Math.PI * 2): void {
    this.style(kind)
    this.ctx.beginPath()
    this.ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, a0, a1)
    this.ctx.stroke()
  }
  poly(pts: Pt[], closed = false, kind: LineKind = 'main'): void {
    if (pts.length < 2) return
    this.style(kind)
    const c = this.ctx
    c.beginPath()
    c.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1])
    if (closed) c.closePath()
    c.stroke()
  }
  /** Smooth curve through points (Catmull-Rom). */
  curve(pts: Pt[], kind: LineKind = 'main', closed = false): void {
    if (pts.length < 3) return this.poly(pts, closed, kind)
    this.style(kind)
    const c = this.ctx
    const n = pts.length
    const at = (i: number): Pt => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))])
    c.beginPath()
    c.moveTo(pts[0][0], pts[0][1])
    const segs = closed ? n : n - 1
    for (let i = 0; i < segs; i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2)
      c.bezierCurveTo(
        p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
        p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6,
        p2[0], p2[1],
      )
    }
    if (closed) c.closePath()
    c.stroke()
  }
  rect(x: number, y: number, w: number, h: number, kind: LineKind = 'main'): void {
    this.poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true, kind)
  }
  joint(x: number, y: number, r = 4): void {
    const c = this.ctx
    c.setLineDash([])
    c.fillStyle = COLORS.axis
    c.beginPath()
    c.arc(x, y, r, 0, Math.PI * 2)
    c.fill()
  }
  text(s: string, x: number, y: number, size = 14): void {
    const c = this.ctx
    c.fillStyle = COLORS.main
    c.font = `${size}px Inter, system-ui, sans-serif`
    c.textAlign = 'center'
    c.fillText(s, x, y)
  }
}
