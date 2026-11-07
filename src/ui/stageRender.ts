import { strokeBounds, transformStroke, matrixTranslate, unionRect } from '../engine/geometry.ts'
import { drawPerspective, drawTemplate } from '../engine/guides.ts'
import { celOf } from '../engine/projectOps.ts'
import { cameraAt, cameraMatrix, hasCamera } from '../engine/camera.ts'
import { flattenBezier } from '../engine/bezier.ts'
import { flattenFrame, getCel, makeCanvas, renderStroke, tinted } from '../engine/render.ts'
import { mirrorStroke } from '../engine/geometry.ts'
import { uid } from '../engine/ids.ts'
import type { Frame, Project, Rect, Stroke } from '../engine/types.ts'
import { viewportMatrix, type Dims } from '../engine/viewport.ts'
import type { AppState } from '../state/app.ts'
import { session } from '../state/session.ts'

const WORKSPACE = '#080A0F'
const PURPLE = '#9B5CFF'
const HIGHLIGHT = '#6DB8FF'

let scratch: HTMLCanvasElement | null = null
function getScratch(w: number, h: number) {
  if (!scratch || scratch.width !== w || scratch.height !== h) scratch = makeCanvas(w, h)
  const ctx = scratch.getContext('2d') as CanvasRenderingContext2D
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.clearRect(0, 0, w, h)
  return { canvas: scratch, ctx }
}

/** Draft strokes plus their mirror images when symmetry is on. */
export function withMirror(strokes: Stroke[], symmetry: boolean, width: number): Stroke[] {
  if (!symmetry) return strokes
  return [...strokes, ...strokes.map((s) => mirrorStroke(s, width / 2, uid()))]
}

export interface StageSize {
  w: number
  h: number
  dpr: number
}

export function drawStage(ctx: CanvasRenderingContext2D, st: AppState, size: StageSize) {
  const { dpr } = size
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = WORKSPACE
  ctx.fillRect(0, 0, size.w * dpr, size.h * dpr)
  const project = st.project
  if (!project) return
  const frame = project.frames.find((f) => f.id === st.frameId) ?? project.frames[0]
  const dims: Dims = { stageW: size.w, stageH: size.h, artW: project.width, artH: project.height }
  const m = viewportMatrix(st.viewport, dims)
  const zoom = st.viewport.zoom
  const px = 1 / zoom // one screen pixel in art units
  const w = project.width
  const h = project.height

  ctx.save()
  ctx.setTransform(dpr * m.a, dpr * m.b, dpr * m.c, dpr * m.d, dpr * m.e, dpr * m.f)

  // artboard + soft shadow
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = 36 * dpr
  ctx.shadowOffsetY = 8 * dpr
  ctx.fillStyle = project.background ?? '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
  if (project.background === null) drawChecker(ctx, w, h, zoom)

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, w, h)
  ctx.clip()

  const playing = st.playing

  if (st.onion.enabled && !playing) drawOnion(ctx, st, project, frame.id)

  if (!playing) {
    drawTemplate(ctx, st.guide, w, h, px)
    drawPerspective(ctx, st.perspective, w, h, px)
  }

  if (playing && hasCamera(project)) {
    // play back through the camera
    const m = cameraMatrix(project, cameraAt(project, project.frames.indexOf(frame)))
    ctx.save()
    ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f)
    drawArtwork(ctx, st, project, frame)
    ctx.restore()
  } else {
    drawArtwork(ctx, st, project, frame)
  }

  if (!playing) drawOverlays(ctx, st, project, frame.id, px, w, h)
  ctx.restore()

  if (!playing && hasCamera(project)) drawCameraFrame(ctx, project, project.frames.indexOf(frame), px)

  // artboard outline
  ctx.strokeStyle = 'rgba(245,247,250,0.14)'
  ctx.lineWidth = px
  ctx.strokeRect(0, 0, w, h)
  ctx.restore()

  // screen-space cursor ring
  if (!playing) drawCursor(ctx, st, dpr)
}

function drawChecker(ctx: CanvasRenderingContext2D, w: number, h: number, zoom: number) {
  const tile = Math.max(16 / zoom, Math.max(w, h) / 80)
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, w, h)
  ctx.clip()
  ctx.fillStyle = '#e8ebf0'
  for (let y = 0, r = 0; y < h; y += tile, r += 1) {
    for (let x = (r % 2) * tile; x < w; x += tile * 2) ctx.fillRect(x, y, tile, tile)
  }
  ctx.restore()
}

function drawOnion(ctx: CanvasRenderingContext2D, st: AppState, project: Project, frameId: string) {
  const idx = project.frames.findIndex((f) => f.id === frameId)
  const base = st.onion.opacity
  for (let i = st.onion.prev; i >= 1; i -= 1) {
    const f = project.frames[idx - i]
    if (!f) continue
    ctx.globalAlpha = base * Math.pow(0.55, i - 1)
    ctx.drawImage(tinted(flattenFrame(project, f), st.onion.prevColor), 0, 0)
  }
  for (let i = st.onion.next; i >= 1; i -= 1) {
    const f = project.frames[idx + i]
    if (!f) continue
    ctx.globalAlpha = base * Math.pow(0.55, i - 1)
    ctx.drawImage(tinted(flattenFrame(project, f), st.onion.nextColor), 0, 0)
  }
  ctx.globalAlpha = 1
}

function drawArtwork(ctx: CanvasRenderingContext2D, st: AppState, project: Project, frame: Frame) {
  const w = project.width
  const h = project.height
  const draft = session.draft.length ? withMirror(session.draft, st.symmetry, w) : []
  const moving = session.moveBase && session.moveStrokes && session.moveOffset && st.selection
  for (const layer of project.layers) {
    if (!layer.visible) continue
    if (layer.base?.length) {
      const under = getCel(layer.base, w, h)
      if (under) {
        ctx.globalAlpha = layer.opacity
        ctx.drawImage(under, 0, 0)
      }
    }
    const strokes = celOf(frame, layer.id)
    const isDraft = draft.length > 0 && session.draftLayerId === layer.id
    const isMove = !!moving && st.selection?.layerId === layer.id
    if (!isDraft && !isMove) {
      const cel = getCel(strokes, w, h)
      if (!cel) continue
      ctx.globalAlpha = layer.opacity
      ctx.drawImage(cel, 0, 0)
      continue
    }
    const { canvas, ctx: sctx } = getScratch(w, h)
    if (isMove) {
      const base = getCel(session.moveBase as Stroke[], w, h)
      if (base) sctx.drawImage(base, 0, 0)
      const off = session.moveOffset as { dx: number; dy: number }
      for (const s of session.moveStrokes as Stroke[]) renderStroke(sctx, transformStroke(s, matrixTranslate(off.dx, off.dy)))
    } else {
      const cel = getCel(strokes, w, h)
      if (cel) sctx.drawImage(cel, 0, 0)
      for (const d of draft) renderStroke(sctx, d)
    }
    ctx.globalAlpha = layer.opacity
    ctx.drawImage(canvas, 0, 0)
  }
  ctx.globalAlpha = 1
}

function drawOverlays(ctx: CanvasRenderingContext2D, st: AppState, project: Project, frameId: string, px: number, w: number, h: number) {
  ctx.save()
  ctx.lineWidth = px * 1.25
  // symmetry axis
  if (st.symmetry) {
    ctx.strokeStyle = PURPLE
    ctx.globalAlpha = 0.7
    ctx.setLineDash([8 * px, 6 * px])
    ctx.beginPath()
    ctx.moveTo(w / 2, 0)
    ctx.lineTo(w / 2, h)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
  }
  // selection box
  if (st.selection && st.selection.frameId === frameId) {
    const ids = new Set(st.selection.ids)
    const frame = project.frames.find((f) => f.id === frameId)
    let b: Rect | null = null
    if (frame) for (const s of celOf(frame, st.selection.layerId)) if (ids.has(s.id)) b = unionRect(b, strokeBounds(s))
    if (b) {
      const dx = session.moveOffset?.dx ?? 0
      const dy = session.moveOffset?.dy ?? 0
      ctx.strokeStyle = HIGHLIGHT
      ctx.fillStyle = 'rgba(22,140,255,0.08)'
      ctx.setLineDash([6 * px, 4 * px])
      ctx.fillRect(b.x + dx, b.y + dy, b.w, b.h)
      ctx.strokeRect(b.x + dx, b.y + dy, b.w, b.h)
      ctx.setLineDash([])
      ctx.fillStyle = HIGHLIGHT
      const hs = 4 * px
      for (const [cx, cy] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]) ctx.fillRect(cx + dx - hs, cy + dy - hs, hs * 2, hs * 2)
    }
  }
  if (session.marquee) {
    const r = session.marquee
    ctx.strokeStyle = HIGHLIGHT
    ctx.fillStyle = 'rgba(22,140,255,0.1)'
    ctx.setLineDash([5 * px, 4 * px])
    ctx.fillRect(r.x, r.y, r.w, r.h)
    ctx.strokeRect(r.x, r.y, r.w, r.h)
    ctx.setLineDash([])
  }
  if (session.lasso && session.lasso.length > 1) {
    ctx.strokeStyle = HIGHLIGHT
    ctx.setLineDash([5 * px, 4 * px])
    ctx.beginPath()
    ctx.moveTo(session.lasso[0].x, session.lasso[0].y)
    for (const p of session.lasso) ctx.lineTo(p.x, p.y)
    ctx.stroke()
    ctx.setLineDash([])
  }
  if (session.polygon && session.polygon.length > 0) {
    const pts = session.polygon
    ctx.strokeStyle = st.color
    ctx.lineWidth = Math.max(px, st.toolSettings.polygon.size)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.globalAlpha = 0.9
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (const p of pts) ctx.lineTo(p.x, p.y)
    if (session.cursor) ctx.lineTo(session.cursor.x, session.cursor.y)
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.fillStyle = HIGHLIGHT
    for (const p of pts) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 3.5 * px, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = px
    ctx.beginPath()
    ctx.arc(pts[0].x, pts[0].y, 7 * px, 0, Math.PI * 2)
    ctx.stroke()
  }
  if (session.bezier && session.bezier.length > 0) {
    const anchors = session.bezier
    const preview = session.cursor && !session.panning ? [...anchors, { x: session.cursor.x, y: session.cursor.y, hx: 0, hy: 0 }] : anchors
    const pts = flattenBezier(preview, false)
    ctx.strokeStyle = st.color
    ctx.lineWidth = Math.max(px, st.toolSettings.polygon.size)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.globalAlpha = 0.9
    if (pts.length > 1) {
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (const p of pts) ctx.lineTo(p.x, p.y)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    ctx.strokeStyle = PURPLE
    ctx.lineWidth = px
    ctx.fillStyle = PURPLE
    for (const a of anchors) {
      if (a.hx === 0 && a.hy === 0) continue
      ctx.beginPath()
      ctx.moveTo(a.x - a.hx, a.y - a.hy)
      ctx.lineTo(a.x + a.hx, a.y + a.hy)
      ctx.stroke()
      for (const k of [-1, 1]) {
        ctx.beginPath()
        ctx.arc(a.x + k * a.hx, a.y + k * a.hy, 3 * px, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.fillStyle = HIGHLIGHT
    for (const a of anchors) ctx.fillRect(a.x - 3.5 * px, a.y - 3.5 * px, 7 * px, 7 * px)
    ctx.strokeStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(anchors[0].x, anchors[0].y, 7 * px, 0, Math.PI * 2)
    ctx.stroke()
  }
  if (session.crop) {
    const c = session.crop
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.beginPath()
    ctx.rect(-4000, -4000, w + 8000, h + 8000)
    ctx.rect(c.x, c.y, c.w, c.h)
    ctx.fill('evenodd')
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = px
    ctx.setLineDash([6 * px, 4 * px])
    ctx.strokeRect(c.x, c.y, c.w, c.h)
    ctx.setLineDash([])
  }
  ctx.restore()
}

function drawCursor(ctx: CanvasRenderingContext2D, st: AppState, dpr: number) {
  const c = session.cursorScreen
  if (!c || session.panning) return
  const t = st.tool
  const sizeTool = t in st.toolSettings && t !== 'fill'
  if (!sizeTool || t === 'polygon') return
  const r = Math.max(2, (st.toolSettings[t].size * st.viewport.zoom) / 2)
  ctx.save()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(0,0,0,0.65)'
  ctx.beginPath()
  ctx.arc(c.x, c.y, r + 0.75, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.beginPath()
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

/** The camera's view on this frame, drawn over the artboard (it can extend past it when zoomed out). */
function drawCameraFrame(ctx: CanvasRenderingContext2D, project: Project, index: number, px: number) {
  const pose = cameraAt(project, index)
  const hw = project.width / pose.zoom / 2
  const hh = project.height / pose.zoom / 2
  ctx.save()
  ctx.translate(pose.x, pose.y)
  ctx.rotate((pose.rot * Math.PI) / 180)
  ctx.strokeStyle = '#9B5CFF'
  ctx.lineWidth = 2 * px
  ctx.setLineDash([8 * px, 5 * px])
  ctx.strokeRect(-hw, -hh, hw * 2, hh * 2)
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.moveTo(-6 * px, 0); ctx.lineTo(6 * px, 0); ctx.moveTo(0, -6 * px); ctx.lineTo(0, 6 * px)
  ctx.stroke()
  ctx.restore()
}
