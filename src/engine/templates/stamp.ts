import { defaultToolSettings, newStroke } from '../brushes.ts'
import type { GuideState } from '../guides.ts'
import type { Stroke } from '../types.ts'
import { shapeToPolylines, type GuideShape, type V } from './shapes.ts'

export const GUIDE_COLOR = '#6DB8FF'

export type Mapper = (v: V) => { x: number; y: number }

/** Maps the unit box onto the canvas exactly as the on-screen guide is drawn. */
export function guideMapper(g: Pick<GuideState, 'x' | 'y' | 'scale' | 'stretchX' | 'rotation' | 'flipX'>, w: number, h: number): Mapper {
  const unit = Math.min(w, h)
  const sx = g.scale * g.stretchX * (g.flipX ? -1 : 1)
  const sy = g.scale
  const a = (g.rotation * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return ([vx, vy]) => {
    const px = vx * unit * sx
    const py = vy * unit * sy
    return { x: w / 2 + g.x + px * cos - py * sin, y: h / 2 + g.y + px * sin + py * cos }
  }
}

/** Guide lines as real, editable strokes. */
export function shapesToStrokes(shapes: GuideShape[], map: Mapper, o: { size: number; opacity?: number; color?: string }): Stroke[] {
  const base = defaultToolSettings().line
  const out: Stroke[] = []
  for (const s of shapes) {
    for (const pl of shapeToPolylines(s)) {
      if (pl.length < 2) continue
      const st = newStroke('line', { ...base, size: o.size, opacity: o.opacity ?? 0.6 }, { color: o.color ?? GUIDE_COLOR, shapeFill: 'none', tolerance: 0 })
      out.push({ ...st, points: pl.map((v) => ({ ...map(v), p: 1 })) })
    }
  }
  return out
}

export const guideLineSize = (w: number, h: number) => Math.max(1.5, (Math.min(w, h) / 360) * 1.6)
