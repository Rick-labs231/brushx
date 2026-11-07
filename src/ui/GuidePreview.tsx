import type { GuideShape } from '../engine/templates/shapes.ts'

/** Tiny SVG of a template's construction lines. */
export function GuidePreview({ shapes, className }: { shapes: GuideShape[]; className?: string }) {
  return (
    <svg className={className} viewBox="-0.5 -0.5 1 1" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
      {shapes.map((s, i) => {
        if (s.k === 'line') return <polyline key={i} points={s.pts.map((p) => p.join(',')).join(' ')} vectorEffect="non-scaling-stroke" />
        if (s.k === 'ellipse') return <ellipse key={i} cx={s.c[0]} cy={s.c[1]} rx={s.r[0]} ry={s.r[1]} vectorEffect="non-scaling-stroke" />
        return <path key={i} d={`M${s.p[0].join(',')} Q${s.p[1].join(',')} ${s.p[2].join(',')}`} vectorEffect="non-scaling-stroke" />
      })}
    </svg>
  )
}
