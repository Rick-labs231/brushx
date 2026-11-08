import { celOf } from '../engine/projectOps.ts'
import { frameLayersKey, getCel, renderFinalFrame } from '../engine/render.ts'
import type { Frame, Project } from '../engine/types.ts'

const cache = new WeakMap<Frame, { key: string; bg: string | null; url: string }>()

/** Small preview of one frame. Cached per frame object and only re-rendered when that frame or the layers it uses change. */
export function frameThumb(p: Project, f: Frame): string {
  const key = frameLayersKey(p, f)
  const hit = cache.get(f)
  if (hit && hit.key === key && hit.bg === p.background) return hit.url
  let url = ''
  try {
    const canvas = renderFinalFrame(p, f, { scale: Math.min(1, 140 / p.width), transparent: false })
    // guides never export, but show them faintly so guide-only frames don't look empty
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
    for (const l of p.layers) {
      if (!l.guide || !l.visible) continue
      ctx.globalAlpha = 0.7
      const under = l.base?.length ? getCel(l.base, p.width, p.height) : null
      if (under) ctx.drawImage(under, 0, 0, canvas.width, canvas.height)
      const cel = getCel(celOf(f, l.id), p.width, p.height)
      if (cel) ctx.drawImage(cel, 0, 0, canvas.width, canvas.height)
    }
    ctx.globalAlpha = 1
    url = canvas.toDataURL('image/jpeg', 0.7)
  } catch {
    url = ''
  }
  cache.set(f, { key, bg: p.background, url })
  return url
}
