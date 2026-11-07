import { useEffect, useRef } from 'react'
import { isPaintTool } from '../engine/brushes.ts'
import { Stabilizer, dist, distToPolyline, normRect, pointInPolygon, shapePointsFromDrag, strokeBounds } from '../engine/geometry.ts'
import { snapToPerspective } from '../engine/guides.ts'
import { celOf } from '../engine/projectOps.ts'
import { sampleFrameColor } from '../engine/render.ts'
import type { Pt, Viewport } from '../engine/types.ts'
import { fitViewport, gestureViewport, toArt, touchInfo, zoomAt, type Dims, type Touch2 } from '../engine/viewport.ts'
import { openDialog, patch, setColor, selectionBounds, selectionStrokes, setPlaying, setSelection, strokesInPolygon, strokesInRect, moveSelection } from '../state/actions.ts'
import { store, useApp } from '../state/app.ts'
import { canDraw, commitDraft, finishBezier, finishPolygon, strokeForTool } from '../state/drawing.ts'
import { clearGesture, onSession, pokeSession, session } from '../state/session.ts'
import { drawStage, type StageSize } from './stageRender.ts'

type Mode = 'none' | 'pan' | 'gesture' | 'draw' | 'shape' | 'pick' | 'marquee' | 'lasso' | 'move' | 'bezier' | 'crop' | 'ignore'

export function CanvasStage() {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const size = useRef<StageSize>({ w: 0, h: 0, dpr: 1 })
  const raf = useRef(0)
  const needsFit = useRef(true)
  const projectId = useApp((s) => s.project?.id ?? '')
  const tool = useApp((s) => s.tool)
  const playing = useApp((s) => s.playing)

  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const mode = useRef<Mode>('none')
  const gesture = useRef<{ vp: Viewport; from: Touch2 } | null>(null)
  const lastScreen = useRef({ x: 0, y: 0 })
  const stab = useRef<Stabilizer | null>(null)
  const rawLast = useRef<Pt>({ x: 0, y: 0, p: 1 })
  const origin = useRef({ x: 0, y: 0 })
  const originScreen = useRef({ x: 0, y: 0 })
  const lastTap = useRef({ t: 0, x: 0, y: 0 })

  // ------------------------------------------------------------------ helpers
  const dims = (): Dims | null => {
    const p = store.getState().project
    if (!p) return null
    return { stageW: size.current.w, stageH: size.current.h, artW: p.width, artH: p.height }
  }
  const local = (e: { clientX: number; clientY: number }) => {
    const r = (canvas.current as HTMLCanvasElement).getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const art = (sp: { x: number; y: number }, pressure = 1): Pt => {
    const d = dims()
    const a = d ? toArt(store.getState().viewport, d, sp.x, sp.y) : { x: 0, y: 0 }
    return { x: a.x, y: a.y, p: pressure }
  }
  const pressureOf = (e: React.PointerEvent | PointerEvent) => (e.pointerType === 'pen' ? Math.max(0.05, e.pressure || 0.5) : 1)

  // --------------------------------------------------------- draw scheduling
  useEffect(() => {
    const cv = canvas.current as HTMLCanvasElement
    const host = wrap.current as HTMLDivElement
    const ctx = cv.getContext('2d') as CanvasRenderingContext2D

    const paint = () => {
      raf.current = 0
      drawStage(ctx, store.getState(), size.current)
    }
    const schedule = () => {
      if (!raf.current) raf.current = requestAnimationFrame(paint)
    }
    const applySize = () => {
      const r = host.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      size.current = { w: r.width, h: r.height, dpr }
      cv.width = Math.max(1, Math.round(r.width * dpr))
      cv.height = Math.max(1, Math.round(r.height * dpr))
      if (needsFit.current && r.width > 0) {
        const d = dims()
        if (d) {
          store.setState({ viewport: fitViewport(d) })
          needsFit.current = false
        }
      }
      schedule()
    }
    const ro = new ResizeObserver(applySize)
    ro.observe(host)
    applySize()

    const unsubStore = store.subscribe(schedule)
    const unsubSession = onSession(schedule)

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const d = dims()
      if (!d) return
      const vp = store.getState().viewport
      const r = cv.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) {
        const dy = Math.max(-60, Math.min(60, e.deltaY))
        store.setState({ viewport: zoomAt(vp, d, Math.exp(-dy * 0.012), { x: e.clientX - r.left, y: e.clientY - r.top }) })
      } else {
        store.setState({ viewport: { ...vp, panX: vp.panX - e.deltaX, panY: vp.panY - e.deltaY } })
      }
    }
    cv.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      ro.disconnect()
      unsubStore()
      unsubSession()
      cv.removeEventListener('wheel', onWheel)
      cancelAnimationFrame(raf.current)
      raf.current = 0
    }
  }, [])

  // Re-fit when a different project opens.
  useEffect(() => {
    needsFit.current = true
    const d = dims()
    if (d && size.current.w > 0) {
      store.setState({ viewport: fitViewport(d) })
      needsFit.current = false
    }
  }, [projectId])

  // ------------------------------------------------------------------ pointer
  const cancelInProgress = () => {
    clearGesture()
    stab.current = null
    mode.current = 'none'
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = e.currentTarget
    const s = store.getState()
    if (!s.project) return
    cv.setPointerCapture(e.pointerId)
    const sp = local(e)
    pointers.current.set(e.pointerId, sp)
    session.cursorScreen = sp
    if (s.playing) setPlaying(false)

    if (e.pointerType === 'touch' && pointers.current.size === 2) {
      cancelInProgress()
      const [a, b] = [...pointers.current.values()]
      gesture.current = { vp: s.viewport, from: touchInfo(a, b) }
      mode.current = 'gesture'
      return
    }
    if (pointers.current.size > 1) return
    if (e.pointerType === 'mouse' && e.button === 2) return

    if (e.button === 1 || session.spaceHeld || s.tool === 'hand') {
      mode.current = 'pan'
      session.panning = true
      lastScreen.current = sp
      return
    }

    const pt = art(sp, pressureOf(e))
    origin.current = { x: pt.x, y: pt.y }
    originScreen.current = sp
    lastScreen.current = sp
    const tool = s.tool

    if (isPaintTool(tool)) {
      if (!canDraw()) {
        mode.current = 'ignore'
        return
      }
      const st = new Stabilizer(tool === 'eraser' ? s.stabilizer * 0.5 : s.stabilizer)
      stab.current = st
      rawLast.current = pt
      session.draft = [{ ...strokeForTool(tool), points: [st.push(pt)] }]
      session.draftLayerId = s.layerId
      mode.current = 'draw'
    } else if (tool === 'line' || tool === 'rect' || tool === 'ellipse') {
      if (!canDraw()) {
        mode.current = 'ignore'
        return
      }
      session.draft = [{ ...strokeForTool(tool), points: shapePointsFromDrag(tool, pt, pt, false) }]
      session.draftLayerId = s.layerId
      mode.current = 'shape'
    } else if (tool === 'polygon') {
      if (!canDraw()) {
        mode.current = 'ignore'
        return
      }
      const now = performance.now()
      const dbl = now - lastTap.current.t < 350 && Math.hypot(sp.x - lastTap.current.x, sp.y - lastTap.current.y) < 8
      lastTap.current = { t: now, x: sp.x, y: sp.y }
      const pts = session.polygon ?? []
      if (pts.length >= 3) {
        const first = toScreenOf(pts[0])
        if (dbl || (first && Math.hypot(first.x - sp.x, first.y - sp.y) < 12)) {
          session.polygon = pts
          finishPolygon()
          mode.current = 'ignore'
          return
        }
      }
      session.polygon = [...pts, pt]
      mode.current = 'ignore'
      pokeSession()
    } else if (tool === 'bezier') {
      if (!canDraw()) {
        mode.current = 'ignore'
        return
      }
      const now = performance.now()
      const dbl = now - lastTap.current.t < 350 && Math.hypot(sp.x - lastTap.current.x, sp.y - lastTap.current.y) < 8
      lastTap.current = { t: now, x: sp.x, y: sp.y }
      const anchors = session.bezier ?? []
      if (anchors.length >= 2) {
        const first = toScreenOf(anchors[0])
        if (dbl) {
          session.bezier = anchors
          finishBezier(false)
          mode.current = 'ignore'
          return
        }
        if (first && Math.hypot(first.x - sp.x, first.y - sp.y) < 12) {
          session.bezier = anchors
          finishBezier(true)
          mode.current = 'ignore'
          return
        }
      }
      session.bezier = [...anchors, { x: pt.x, y: pt.y, hx: 0, hy: 0 }]
      mode.current = 'bezier'
    } else if (tool === 'text') {
      if (!canDraw()) {
        mode.current = 'ignore'
        return
      }
      patch({ textAt: { x: pt.x, y: pt.y } })
      openDialog('text')
      mode.current = 'ignore'
    } else if (tool === 'crop') {
      session.crop = { x: pt.x, y: pt.y, w: 0, h: 0 }
      mode.current = 'crop'
    } else if (tool === 'fill') {
      if (!canDraw()) {
        mode.current = 'ignore'
        return
      }
      session.draft = [{ ...strokeForTool('fill'), points: [pt] }]
      session.draftLayerId = s.layerId
      commitDraft()
      mode.current = 'ignore'
    } else if (tool === 'eyedropper') {
      mode.current = 'pick'
      pick(pt)
    } else if (tool === 'select') {
      const b = selectionBounds(s)
      const m = 8 / s.viewport.zoom
      if (b && pt.x >= b.x - m && pt.x <= b.x + b.w + m && pt.y >= b.y - m && pt.y <= b.y + b.h + m && canDraw()) {
        const frame = s.project.frames.find((f) => f.id === s.selection?.frameId)
        const ids = new Set(s.selection?.ids)
        if (frame && s.selection) {
          session.moveBase = celOf(frame, s.selection.layerId).filter((x) => !ids.has(x.id))
          session.moveStrokes = selectionStrokes(s)
          session.moveOffset = { dx: 0, dy: 0 }
          mode.current = 'move'
        }
      } else {
        session.marquee = { x: pt.x, y: pt.y, w: 0, h: 0 }
        mode.current = 'marquee'
      }
    } else if (tool === 'lasso') {
      session.lasso = [pt]
      mode.current = 'lasso'
    }
    pokeSession()
  }

  const toScreenOf = (p: { x: number; y: number }) => {
    const d = dims()
    if (!d) return null
    const vp = store.getState().viewport
    const cos = Math.cos(vp.rot) * vp.zoom
    const sin = Math.sin(vp.rot) * vp.zoom
    const cx = d.artW / 2
    const cy = d.artH / 2
    return { x: d.stageW / 2 + vp.panX + cos * (p.x - cx) - sin * (p.y - cy), y: d.stageH / 2 + vp.panY + sin * (p.x - cx) + cos * (p.y - cy) }
  }

  const pick = (pt: Pt) => {
    const s = store.getState()
    if (!s.project) return
    const frame = s.project.frames.find((f) => f.id === s.frameId)
    if (!frame) return
    const c = sampleFrameColor(s.project, frame, pt.x, pt.y)
    if (c) setColor(c)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = store.getState()
    const sp = local(e)
    session.cursorScreen = sp
    session.cursor = art(sp).x === undefined ? null : { x: art(sp).x, y: art(sp).y }
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, sp)
    const d = dims()
    if (!d || !s.project) return

    switch (mode.current) {
      case 'gesture': {
        if (pointers.current.size >= 2 && gesture.current) {
          const [a, b] = [...pointers.current.values()]
          store.setState({ viewport: gestureViewport(gesture.current.vp, d, gesture.current.from, touchInfo(a, b)) })
        }
        return
      }
      case 'pan': {
        const vp = s.viewport
        store.setState({ viewport: { ...vp, panX: vp.panX + sp.x - lastScreen.current.x, panY: vp.panY + sp.y - lastScreen.current.y } })
        lastScreen.current = sp
        return
      }
      case 'draw': {
        const draft = session.draft[0]
        const st = stab.current
        if (!draft || !st) return
        const events = (e.nativeEvent.getCoalescedEvents?.() ?? []).length ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent]
        for (const ev of events) {
          const raw = art(local(ev), pressureOf(ev))
          rawLast.current = raw
          const p = st.push(raw)
          const prev = draft.points[draft.points.length - 1]
          if (!prev || dist(prev, p) >= 0.4) draft.points.push(p)
        }
        break
      }
      case 'shape': {
        const draft = session.draft[0]
        const t = s.tool
        if (!draft || (t !== 'line' && t !== 'rect' && t !== 'ellipse')) return
        const end = t === 'line' && !e.shiftKey && s.project ? snapToPerspective(s.perspective, s.project.width, s.project.height, origin.current, art(sp)) : art(sp)
        draft.points = shapePointsFromDrag(t, origin.current, end, e.shiftKey, e.altKey)
        break
      }
      case 'bezier': {
        const a = session.bezier
        if (!a || a.length === 0) return
        const last = a[a.length - 1]
        const p = art(sp)
        if (Math.hypot(p.x - last.x, p.y - last.y) * s.viewport.zoom > 4) {
          session.bezier = [...a.slice(0, -1), { ...last, hx: p.x - last.x, hy: p.y - last.y }]
        }
        break
      }
      case 'crop': {
        const p = art(sp)
        session.crop = normRect(origin.current.x, origin.current.y, p.x, p.y)
        break
      }
      case 'pick':
        pick(art(sp))
        return
      case 'marquee': {
        const p = art(sp)
        session.marquee = normRect(origin.current.x, origin.current.y, p.x, p.y)
        break
      }
      case 'lasso':
        session.lasso?.push(art(sp))
        break
      case 'move': {
        const p = art(sp)
        session.moveOffset = { dx: p.x - origin.current.x, dy: p.y - origin.current.y }
        break
      }
      default:
        break
    }
    pokeSession()
  }

  const endPointer = (e: React.PointerEvent<HTMLCanvasElement>, cancelled = false) => {
    const m = mode.current
    pointers.current.delete(e.pointerId)
    const sp = local(e)
    const s = store.getState()

    if (m === 'gesture') {
      if (pointers.current.size < 2) {
        mode.current = pointers.current.size === 0 ? 'none' : 'ignore'
        gesture.current = null
      }
      return
    }
    if (pointers.current.size > 0) return
    mode.current = 'none'
    session.panning = false

    if (cancelled) {
      cancelInProgress()
      return
    }
    switch (m) {
      case 'draw': {
        const draft = session.draft[0]
        if (draft && stab.current) {
          for (const p of stab.current.finish(rawLast.current)) draft.points.push(p)
        }
        stab.current = null
        commitDraft()
        break
      }
      case 'shape': {
        const draft = session.draft[0]
        const tiny = draft ? Math.hypot(...draft.points.reduce<[number, number]>((acc, p) => [Math.max(acc[0], Math.abs(p.x - origin.current.x)), Math.max(acc[1], Math.abs(p.y - origin.current.y))], [0, 0])) < 2 : true
        if (tiny) clearGesture()
        else commitDraft()
        break
      }
      case 'marquee': {
        const r = session.marquee
        clearGesture()
        if (!r) break
        if (r.w * s.viewport.zoom < 4 && r.h * s.viewport.zoom < 4) {
          setSelection(hitTest(origin.current.x, origin.current.y))
        } else setSelection(strokesInRect(r))
        break
      }
      case 'lasso': {
        const poly = session.lasso
        clearGesture()
        if (poly && poly.length > 2) setSelection(strokesInPolygon(poly))
        break
      }
      case 'move': {
        const off = session.moveOffset
        // Commit while the preview is still up so there's no flicker, then clear it.
        if (off && (Math.abs(off.dx) > 0.01 || Math.abs(off.dy) > 0.01)) moveSelection(off.dx, off.dy)
        clearGesture()
        break
      }
      case 'crop': {
        const r = session.crop
        clearGesture()
        if (r && r.w * s.viewport.zoom > 8 && r.h * s.viewport.zoom > 8) {
          patch({ crop: r })
          openDialog('crop')
        }
        break
      }
      case 'pick':
      case 'pan':
      default:
        break
    }
    void sp
    pokeSession()
  }

  /** Topmost stroke near a click, for tap-to-select. */
  const hitTest = (x: number, y: number): string[] => {
    const s = store.getState()
    const frame = s.project?.frames.find((f) => f.id === s.frameId)
    if (!frame) return []
    const slop = 6 / s.viewport.zoom
    const cel = celOf(frame, s.layerId)
    for (let i = cel.length - 1; i >= 0; i -= 1) {
      const st = cel[i]
      if (st.tool === 'fill') continue
      if (st.tool === 'bitmap') {
        const b = strokeBounds(st)
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return [st.id]
        continue
      }
      if (st.points.length === 0) continue
      const closedFilled = st.closed && st.shapeFill !== 'none'
      if (closedFilled && pointInPolygon(x, y, st.points)) return [st.id]
      if (distToPolyline(x, y, st.points, st.closed) <= st.size / 2 + slop) return [st.id]
    }
    return []
  }

  const cursorClass =
    playing ? 'cur-default' : tool === 'hand' ? 'cur-grab' : tool === 'select' || tool === 'lasso' ? 'cur-default' : tool === 'eyedropper' || tool === 'fill' ? 'cur-cross' : 'cur-none'

  return (
    <div ref={wrap} className="stage" data-testid="stage">
      <canvas
        ref={canvas}
        className={`stage-canvas ${cursorClass}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endPointer(e)}
        onPointerCancel={(e) => endPointer(e, true)}
        onPointerLeave={() => {
          session.cursorScreen = null
          pokeSession()
        }}
        onDoubleClick={() => {
          if (store.getState().tool === 'hand') {
            const d = dims()
            if (d) store.setState({ viewport: fitViewport(d) })
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  )
}
