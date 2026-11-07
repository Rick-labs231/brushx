import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { patch } from '../state/actions.ts'
import { useRoute } from '../state/router.ts'
import { TOURS, type TourId } from './steps.ts'
import { endTour, gotoStep, shouldAutoStart, startTour, turnOffTours, useTour } from './tour.ts'

interface Box { x: number; y: number; w: number; h: number }
const PAD = 6
/** The size the person actually sees (phones can report a wider layout viewport). */
const viewSize = () => ({ w: Math.round(window.visualViewport?.width ?? window.innerWidth), h: Math.round(window.visualViewport?.height ?? window.innerHeight) })

function findTarget(selector: string | undefined): Element | null {
  if (!selector) return null
  for (const el of Array.from(document.querySelectorAll(selector))) {
    const r = el.getBoundingClientRect()
    if (r.width > 4 && r.height > 4) return el
  }
  return null
}

const routeToTour = (name: string): TourId | null => (name === 'home' ? 'home' : name === 'projects' ? 'projects' : name === 'profile' ? 'profile' : name === 'editor' ? 'editor' : null)

/** Starts the right guide the first time a screen is opened. */
function useAutoStart() {
  const route = useRoute()
  useEffect(() => {
    const id = routeToTour(route.name)
    if (!id) return
    const t = window.setTimeout(() => {
      if (id === 'editor' && !document.querySelector('[data-testid=editor]')) return
      if (shouldAutoStart(id)) startTour(id)
    }, id === 'editor' ? 1200 : 1600)
    return () => window.clearTimeout(t)
  }, [route.name])
}

export function TourHost() {
  useAutoStart()
  const route = useRoute()
  const { active, index } = useTour()
  const tourFor = routeToTour(route.name)
  // a guide belongs to its screen: leaving the screen ends it
  useEffect(() => { if (active && tourFor !== active) endTour() }, [active, tourFor])
  if (!active || tourFor !== active) return null
  return <TourCard key={active} id={active} index={index} />
}

function TourCard({ id, index }: { id: TourId; index: number }) {
  const tour = TOURS[id]
  const step = tour.steps[Math.min(index, tour.steps.length - 1)]
  const last = index >= tour.steps.length - 1
  const [box, setBox] = useState<Box | null>(null)
  const [vp, setVp] = useState(viewSize)
  const card = useRef<HTMLDivElement>(null)
  const [cardSize, setCardSize] = useState({ w: 320, h: 200 })
  const next = useRef<HTMLButtonElement>(null)

  // open the right panel / tab for this step
  useEffect(() => {
    patch({ drawerOpen: !!step.panel })
    if (step.tab) {
      const t = Array.from(document.querySelectorAll('.side [role=tab]')).find((b) => b.textContent?.trim() === step.tab) as HTMLElement | undefined
      t?.click()
    }
  }, [step])

  // follow the target while things move or appear
  useEffect(() => {
    let raf = 0
    let timer = 0
    const measure = () => {
      const el = findTarget(step.target)
      if (el) {
        const r = el.getBoundingClientRect()
        const x = Math.max(0, r.left - PAD)
        const y = Math.max(0, r.top - PAD)
        const w = Math.min(viewSize().w - x, r.width + PAD * 2)
        const h = Math.min(viewSize().h - y, r.height + PAD * 2)
        setBox((b) => (b && Math.abs(b.x - x) < 1 && Math.abs(b.y - y) < 1 && Math.abs(b.w - w) < 1 && Math.abs(b.h - h) < 1 ? b : { x, y, w, h }))
      } else setBox((b) => (b ? null : b))
      const n = viewSize()
      setVp((v) => (v.w === n.w && v.h === n.h ? v : n))
    }
    const loop = () => { measure(); timer = window.setTimeout(() => { raf = requestAnimationFrame(loop) }, 150) }
    loop()
    const el0 = findTarget(step.target)
    el0?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    return () => { cancelAnimationFrame(raf); window.clearTimeout(timer) }
  }, [step])

  useLayoutEffect(() => {
    const r = card.current?.getBoundingClientRect()
    if (r && (Math.abs(r.width - cardSize.w) > 1 || Math.abs(r.height - cardSize.h) > 1)) setCardSize({ w: r.width, h: r.height })
  })

  useEffect(() => { next.current?.focus() }, [index])
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); endTour() }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { if (document.activeElement?.tagName === 'BUTTON' && e.key === 'Enter') return; e.preventDefault(); e.stopImmediatePropagation(); if (last) endTour(); else gotoStep(index + 1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); if (index > 0) gotoStep(index - 1) }
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [index, last])

  // card position: beside the target when there is room, otherwise docked at the bottom
  const narrow = vp.w < 700
  const W = Math.min(cardSize.w, vp.w - 16)
  let left = (vp.w - W) / 2
  let top = (vp.h - cardSize.h) / 2
  if (box) {
    if (narrow) {
      left = (vp.w - W) / 2
      top = box.y + box.h / 2 < vp.h / 2 ? vp.h - cardSize.h - 12 : 12
    } else {
      const spaceR = vp.w - (box.x + box.w)
      const spaceL = box.x
      const spaceB = vp.h - (box.y + box.h)
      if (spaceR >= W + 24) { left = box.x + box.w + 14; top = box.y }
      else if (spaceL >= W + 24) { left = box.x - W - 14; top = box.y }
      else if (spaceB >= cardSize.h + 24) { left = box.x + box.w / 2 - W / 2; top = box.y + box.h + 14 }
      else { left = box.x + box.w / 2 - W / 2; top = box.y - cardSize.h - 14 }
    }
  }
  left = Math.max(8, Math.min(left, vp.w - W - 8))
  top = Math.max(8, Math.min(top, vp.h - cardSize.h - 8))

  const hole = box
  const clip = hole
    ? `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${hole.x}px ${hole.y}px, ${hole.x}px ${hole.y + hole.h}px, ${hole.x + hole.w}px ${hole.y + hole.h}px, ${hole.x + hole.w}px ${hole.y}px, ${hole.x}px ${hole.y}px)`
    : undefined

  return (
    <div className="tour" data-testid="tour" role="presentation">
      <div className="tour-block" style={{ clipPath: clip }} onClick={(e) => e.stopPropagation()} />
      {hole && <div className="tour-spot" style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h }} />}
      <div ref={card} className="tour-card" role="dialog" aria-label={`Guide: ${step.title}`} style={{ left, top, width: Math.min(340, vp.w - 16) }}>
        <div className="tour-meta"><span>{tour.label} guide · {index + 1} / {tour.steps.length}</span><button className="tour-x" aria-label="Close guide" onClick={endTour}>×</button></div>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        {step.tryIt && <p className="tour-try">{step.tryIt}</p>}
        <div className="tour-dots" aria-hidden="true">{tour.steps.map((_, i) => <i key={i} data-on={i === index} />)}</div>
        <div className="tour-actions">
          <button className="btn ghost sm" onClick={endTour}>Skip</button>
          <span className="grow" />
          {index > 0 && <button className="btn secondary sm" onClick={() => gotoStep(index - 1)}>Back</button>}
          <button ref={next} className="btn primary sm" onClick={() => (last ? endTour() : gotoStep(index + 1))}>{last ? 'Finish' : index === 0 ? 'Start' : 'Next'}</button>
        </div>
        {index === 0 && <button className="tour-off" onClick={turnOffTours}>Don’t show guides again</button>}
      </div>
    </div>
  )
}
