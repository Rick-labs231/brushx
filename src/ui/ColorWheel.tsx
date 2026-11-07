import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { hexToHsv, hsvToHex, type Hsv } from '../engine/color.ts'

const SIZE = 200
const RING_IN = 0.78 // inner edge of the hue ring, as a share of the radius

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/**
 * Hue ring with a saturation/brightness square inside. Keeps its own hue so dragging
 * through grey or black doesn't lose the hue you were on.
 */
export function ColorWheel({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value))
  const last = useRef(value.toLowerCase())

  // follow outside changes (swatches, eyedropper, hex box) without clobbering the hue
  useEffect(() => {
    if (value.toLowerCase() === last.current) return
    last.current = value.toLowerCase()
    const next = hexToHsv(value)
    setHsv((cur) => ({ h: next.s === 0 || next.v === 0 ? cur.h : next.h, s: next.s, v: next.v }))
  }, [value])

  const apply = (n: Hsv) => {
    setHsv(n)
    const hex = hsvToHex(n.h, n.s, n.v).toUpperCase()
    last.current = hex.toLowerCase()
    onChange(hex)
  }

  const ringRef = useRef<HTMLDivElement>(null)
  const sqRef = useRef<HTMLDivElement>(null)

  /** Where on the ring a pointer is, as a share of the radius (0 centre, 1 outer edge). */
  const radial = (e: PointerEvent) => {
    const r = ringRef.current?.getBoundingClientRect()
    if (!r) return Infinity
    return Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) / (r.width / 2)
  }
  const hueFrom = (e: PointerEvent) => {
    const r = ringRef.current?.getBoundingClientRect()
    if (!r) return
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top + r.height / 2)
    apply({ ...hsv, h: ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360 })
  }
  const svFrom = (e: PointerEvent) => {
    const r = sqRef.current?.getBoundingClientRect()
    if (!r) return
    apply({ ...hsv, s: clamp01((e.clientX - r.left) / r.width), v: clamp01(1 - (e.clientY - r.top) / r.height) })
  }
  const drag = (fn: (e: PointerEvent) => void, accept: (e: PointerEvent) => boolean = () => true) => ({
    onPointerDown: (e: PointerEvent) => {
      if (!accept(e)) return
      e.currentTarget.setPointerCapture(e.pointerId)
      fn(e)
    },
    onPointerMove: (e: PointerEvent) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) fn(e) },
  })

  const hueKey = (e: KeyboardEvent) => {
    const d = e.shiftKey ? 15 : 3
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); apply({ ...hsv, h: (hsv.h + d) % 360 }) }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); apply({ ...hsv, h: (hsv.h - d + 360) % 360 }) }
  }
  const svKey = (e: KeyboardEvent) => {
    const d = e.shiftKey ? 0.1 : 0.02
    if (e.key === 'ArrowRight') { e.preventDefault(); apply({ ...hsv, s: clamp01(hsv.s + d) }) }
    if (e.key === 'ArrowLeft') { e.preventDefault(); apply({ ...hsv, s: clamp01(hsv.s - d) }) }
    if (e.key === 'ArrowUp') { e.preventDefault(); apply({ ...hsv, v: clamp01(hsv.v + d) }) }
    if (e.key === 'ArrowDown') { e.preventDefault(); apply({ ...hsv, v: clamp01(hsv.v - d) }) }
  }

  const rad = ((hsv.h - 90) * Math.PI) / 180
  const ringR = (SIZE / 2) * ((1 + RING_IN) / 2)
  const hx = SIZE / 2 + Math.cos(rad) * ringR
  const hy = SIZE / 2 + Math.sin(rad) * ringR
  const side = Math.floor(SIZE * RING_IN / Math.SQRT2 * 0.98)
  const cur = hsvToHex(hsv.h, hsv.s, hsv.v)

  return (
    <div className="wheel" style={{ width: SIZE, height: SIZE }} data-testid="color-wheel">
      <div
        ref={ringRef}
        className="wheel-ring"
        role="slider"
        tabIndex={0}
        aria-label="Hue"
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={Math.round(hsv.h)}
        onKeyDown={hueKey}
        {...drag(hueFrom, (e) => { const d = radial(e); return d >= RING_IN - 0.02 && d <= 1.02 })}
      />
      <span className="wheel-dot" style={{ left: hx, top: hy, background: hsvToHex(hsv.h, 1, 1) }} />
      <div
        ref={sqRef}
        className="wheel-sq"
        role="slider"
        tabIndex={0}
        aria-label="Saturation and brightness"
        aria-valuetext={`saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
        aria-valuenow={Math.round(hsv.s * 100)}
        onKeyDown={svKey}
        style={{ width: side, height: side, ['--hue' as string]: `hsl(${hsv.h} 100% 50%)` }}
        {...drag(svFrom)}
      >
        <span className="wheel-dot sq" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: cur }} />
      </div>
    </div>
  )
}
