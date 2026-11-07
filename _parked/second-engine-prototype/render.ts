import type { Doc } from './doc'
import type { CameraKey, OnionSettings, Project, TemplateInstance, View } from './types'
import { ctx2d, makeCanvas } from './util'
import { drawPerspective } from './perspective'
import { G } from './templates/draw'
import { defaultParams, getTemplate, phaseAt, type TemplateDef } from './templates/catalog'

export interface Preview { frameId: string; layerId: string; canvas: HTMLCanvasElement }

let scratchA: HTMLCanvasElement | null = null
let scratchB: HTMLCanvasElement | null = null
function scratch(which: 'a' | 'b', w: number, h: number): HTMLCanvasElement {
  let c = which === 'a' ? scratchA : scratchB
  if (!c || c.width !== w || c.height !== h) {
    c = makeCanvas(w, h)
    if (which === 'a') scratchA = c
    else scratchB = c
  } else {
    ctx2d(c).clearRect(0, 0, w, h)
  }
  return c
}

/** Draw every visible layer of a frame (bottom -> top). `preview` swaps one cel for a live canvas. */
export function compositeFrame(ctx: CanvasRenderingContext2D, doc: Doc, frameIndex: number, preview?: Preview | null): void {
  const f = doc.project.frames[frameIndex]
  if (!f) return
  for (const l of doc.project.layers) {
    if (!l.visible) continue
    const cel = preview && preview.frameId === f.id && preview.layerId === l.id ? preview.canvas : doc.peekCel(f.id, l.id)
    if (!cel) continue
    ctx.globalAlpha = l.opacity
    ctx.drawImage(cel, 0, 0)
  }
  ctx.globalAlpha = 1
}

function drawOnion(ctx: CanvasRenderingContext2D, doc: Doc, frameIndex: number, o: OnionSettings): void {
  const { width: w, height: h } = doc.project
  const draw = (idx: number, color: string, alpha: number) => {
    if (idx < 0 || idx >= doc.project.frames.length) return
    const s = scratch('a', w, h)
    const g = ctx2d(s)
    compositeFrame(g, doc, idx)
    g.globalCompositeOperation = 'source-in'
    g.fillStyle = color
    g.fillRect(0, 0, w, h)
    g.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = alpha
    ctx.drawImage(s, 0, 0)
    ctx.globalAlpha = 1
  }
  for (let i = 1; i <= o.prev; i++) draw(frameIndex - i, o.prevColor, o.prevOpacity * (1 - (i - 1) / (o.prev + 0.5)))
  for (let i = 1; i <= o.next; i++) draw(frameIndex + i, o.nextColor, o.nextOpacity * (1 - (i - 1) / (o.next + 0.5)))
}

function drawChecker(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const s = 16
  ctx.save()
  ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip()
  ctx.fillStyle = '#2a2f3b'; ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#343a48'
  for (let y = 0; y < h; y += s) for (let x = (y / s) % 2 ? 0 : s; x < w; x += s * 2) ctx.fillRect(x, y, s, s)
  ctx.restore()
}

// ---- guides ----------------------------------------------------------------------------------
const defCache = new Map<string, TemplateDef>()
export function drawTemplateInstance(ctx: CanvasRenderingContext2D, t: TemplateInstance, frameIndex: number, selected = false): void {
  let def = defCache.get(t.templateId)
  if (!def) {
    def = getTemplate(t.templateId)
    if (def) defCache.set(t.templateId, def)
  }
  if (!def) return
  ctx.save()
  ctx.translate(t.x, t.y)
  ctx.rotate((t.rotation * Math.PI) / 180)
  ctx.scale(t.flipX ? -t.scale : t.scale, t.scale)
  ctx.globalAlpha = t.opacity
  const g = new G(ctx, t.lineWidth / t.scale)
  def.draw(g, { ...defaultParams(def), ...t.params }, phaseAt(def, t.cycle, frameIndex))
  if (selected) {
    ctx.globalAlpha = 0.9
    ctx.setLineDash([6 / t.scale, 5 / t.scale])
    ctx.strokeStyle = 'rgba(109,184,255,0.9)'
    ctx.lineWidth = 1 / t.scale
    ctx.strokeRect(-250, -250, 500, 500)
  }
  ctx.restore()
}

export function drawGuides(ctx: CanvasRenderingContext2D, p: Project, frameIndex: number, zoom: number, selectedTemplate: string | null): void {
  drawPerspective(ctx, p.guide, p.width, p.height, zoom)
  for (const t of p.templates) if (!t.hidden) drawTemplateInstance(ctx, t, frameIndex, t.id === selectedTemplate)
}

// ---- camera ----------------------------------------------------------------------------------
export function cameraAt(p: Project, frame: number): CameraKey {
  const keys = [...p.camera].sort((a, b) => a.frame - b.frame)
  const base: CameraKey = { frame, x: 0, y: 0, zoom: 1, rot: 0 }
  if (!keys.length) return base
  if (frame <= keys[0].frame) return { ...keys[0], frame }
  const last = keys[keys.length - 1]
  if (frame >= last.frame) return { ...last, frame }
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1]
    if (frame >= a.frame && frame <= b.frame) {
      const t0 = (frame - a.frame) / (b.frame - a.frame || 1)
      const t = t0 * t0 * (3 - 2 * t0)
      const l = (x: number, y: number) => x + (y - x) * t
      return { frame, x: l(a.x, b.x), y: l(a.y, b.y), zoom: l(a.zoom, b.zoom), rot: l(a.rot, b.rot) }
    }
  }
  return base
}

export function applyCamera(ctx: CanvasRenderingContext2D, cam: CameraKey, w: number, h: number): void {
  ctx.translate(w / 2, h / 2)
  ctx.rotate((-cam.rot * Math.PI) / 180)
  ctx.scale(cam.zoom, cam.zoom)
  ctx.translate(-(w / 2 + cam.x), -(h / 2 + cam.y))
}

// ---- viewport --------------------------------------------------------------------------------
export interface SceneInput {
  ctx: CanvasRenderingContext2D
  cssW: number
  cssH: number
  dpr: number
  doc: Doc
  frameIndex: number
  view: View
  onion: OnionSettings
  preview: Preview | null
  showGuides: boolean
  selectedTemplate: string | null
  useCamera: boolean
  overlay?: (ctx: CanvasRenderingContext2D, view: View) => void
}

export function renderViewport(s: SceneInput): void {
  const { ctx, doc, view } = s
  const { width: w, height: h, background } = doc.project
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#06080c'
  ctx.fillRect(0, 0, s.cssW * s.dpr, s.cssH * s.dpr)
  ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0)
  ctx.translate(view.x, view.y)
  ctx.rotate(view.rot)
  ctx.scale(view.zoom, view.zoom)

  // paper
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = 40
  ctx.shadowOffsetY = 8
  ctx.fillStyle = background === 'transparent' ? '#2a2f3b' : background
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
  if (background === 'transparent') drawChecker(ctx, w, h)

  ctx.save()
  ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip()
  if (s.useCamera) applyCamera(ctx, cameraAt(doc.project, s.frameIndex), w, h)
  if (s.onion.enabled && !s.useCamera) drawOnion(ctx, doc, s.frameIndex, s.onion)
  compositeFrame(ctx, doc, s.frameIndex, s.preview)
  ctx.restore()

  if (s.showGuides && !s.useCamera) {
    ctx.save()
    drawGuides(ctx, doc.project, s.frameIndex, view.zoom, s.selectedTemplate)
    ctx.restore()
  }
  if (s.overlay && !s.useCamera) {
    ctx.save()
    s.overlay(ctx, view)
    ctx.restore()
  }
  // paper outline
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 1 / view.zoom
  ctx.strokeRect(0, 0, w, h)
}

// ---- thumbnails ------------------------------------------------------------------------------
interface ThumbEntry { key: string; canvas: HTMLCanvasElement; hasArt: boolean }
const thumbs = new WeakMap<Doc, Map<string, ThumbEntry>>()

export function frameThumb(doc: Doc, frameIndex: number, tw = 96): ThumbEntry | null {
  const f = doc.project.frames[frameIndex]
  if (!f) return null
  let m = thumbs.get(doc)
  if (!m) { m = new Map(); thumbs.set(doc, m) }
  const key = `${doc.frameRev.get(f.id) ?? 0}|${doc.layerSig()}|${tw}|${doc.project.background}`
  const hit = m.get(f.id)
  if (hit && hit.key === key) return hit
  const th = Math.max(1, Math.round((tw * doc.project.height) / doc.project.width))
  const art = makeCanvas(tw, th)
  const ag = ctx2d(art)
  ag.imageSmoothingQuality = 'high'
  ag.scale(tw / doc.project.width, th / doc.project.height)
  compositeFrame(ag, doc, frameIndex)
  const px = ag.getImageData(0, 0, tw, th).data
  let hasArt = false
  for (let i = 3; i < px.length; i += 4) if (px[i] > 6) { hasArt = true; break }
  const out = makeCanvas(tw, th)
  const og = ctx2d(out)
  og.fillStyle = doc.project.background === 'transparent' ? '#2a2f3b' : doc.project.background
  og.fillRect(0, 0, tw, th)
  og.drawImage(art, 0, 0)
  const e = { key, canvas: out, hasArt }
  m.set(f.id, e)
  return e
}

// ---- export frame ----------------------------------------------------------------------------
export interface OutputOptions { width: number; height: number; transparent: boolean; camera: boolean; fit: 'fit' | 'fill' }

/** Render one timeline frame to a new canvas at output size, honouring camera keys. */
export function renderOutputFrame(doc: Doc, frameIndex: number, o: OutputOptions): HTMLCanvasElement {
  const { width: pw, height: ph, background } = doc.project
  const out = makeCanvas(o.width, o.height)
  const g = ctx2d(out)
  const sc = o.fit === 'fill' ? Math.max(o.width / pw, o.height / ph) : Math.min(o.width / pw, o.height / ph)
  const bg = background === 'transparent' || o.transparent ? null : background
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, o.width, o.height) }
  g.imageSmoothingQuality = 'high'
  g.save()
  g.translate((o.width - pw * sc) / 2, (o.height - ph * sc) / 2)
  g.scale(sc, sc)
  g.beginPath(); g.rect(0, 0, pw, ph); g.clip()
  if (o.camera) applyCamera(g, cameraAt(doc.project, frameIndex), pw, ph)
  compositeFrame(g, doc, frameIndex)
  g.restore()
  return out
}

/** Flatten a frame (art only, paper colour included) for picking colours or sampling a fill. */
export function flattenFrame(doc: Doc, frameIndex: number, withPaper: boolean): HTMLCanvasElement {
  const { width: w, height: h, background } = doc.project
  const c = scratch('b', w, h)
  const g = ctx2d(c)
  if (withPaper && background !== 'transparent') { g.fillStyle = background; g.fillRect(0, 0, w, h) }
  compositeFrame(g, doc, frameIndex)
  return c
}

/** Thumbnail of a template definition for browsers. */
const tplThumbs = new Map<string, string>()
export function templateThumb(def: TemplateDef, size = 120): string {
  const k = `${def.id}|${size}`
  const hit = tplThumbs.get(k)
  if (hit) return hit
  const c = makeCanvas(size * 2, size * 2)
  const g = ctx2d(c)
  g.scale(size / 250, size / 250)
  g.translate(250, 250)
  const gg = new G(g, 3.2)
  def.draw(gg, defaultParams(def), def.motion?.preview ?? 0)
  const url = c.toDataURL('image/png')
  tplThumbs.set(k, url)
  return url
}
