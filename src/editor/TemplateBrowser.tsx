import { useEffect, useMemo, useRef, useState } from 'react'
import { TEMPLATES, templateById } from '../engine/guides.ts'
import { CATEGORIES } from '../engine/templates/catalog.ts'
import { CYCLES, cycleById } from '../engine/templates/cycles.ts'
import { chooseTemplate, insertCycleAction, toggleFavorite } from '../state/actions.ts'
import { useApp } from '../state/app.ts'
import { GuidePreview } from '../ui/GuidePreview.tsx'

type Tab = 'All' | 'Favorites' | (typeof CATEGORIES)[number] | 'Motion cycles'
const TABS: Tab[] = ['All', 'Favorites', ...CATEGORIES, 'Motion cycles']
const FRAME_CHOICES = [4, 6, 8, 10, 12, 16]

function CyclePlayer({ id, frames }: { id: string; frames: number }) {
  const cycle = cycleById(id)
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((v) => v + 1), 140)
    return () => clearInterval(t)
  }, [])
  if (!cycle) return null
  return <GuidePreview className="cycle-preview" shapes={cycle.frame(i % frames, frames)} />
}

export function TemplateBrowser() {
  const guide = useApp((s) => s.guide)
  const favorites = useApp((s) => s.favorites)
  const [tab, setTab] = useState<Tab>('All')
  const [query, setQuery] = useState('')
  const [cycleId, setCycleId] = useState<string | null>(null)
  const [frames, setFrames] = useState(8)
  const boxRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (cycleId) boxRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }) }, [cycleId])
  const q = query.trim().toLowerCase()
  const match = (title: string, desc: string) => !q || `${title} ${desc}`.toLowerCase().includes(q)

  const templates = useMemo(
    () => TEMPLATES.filter((t) => (tab === 'All' || (tab === 'Favorites' ? favorites.includes(t.id) : t.category === tab)) && match(t.title, t.description)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab, favorites, q],
  )
  const cycles = tab === 'All' || tab === 'Motion cycles' || tab === 'Favorites' ? CYCLES.filter((c) => (tab !== 'Favorites' || favorites.includes(`cycle:${c.id}`)) && match(c.title, c.description)) : []
  const cycle = cycleById(cycleId ?? '')
  const current = templateById(guide.template)

  return (
    <div>
      <div className="panel-title"><span>Templates</span><span className="faint">{templates.length + cycles.length}</span></div>
      <input className="input" type="search" placeholder="Search templates" aria-label="Search templates" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="tab-chips" role="group" aria-label="Template categories">
        {TABS.map((t) => <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t === 'Favorites' ? '★ Favorites' : t}</button>)}
      </div>
      <div className="tpl-grid" data-testid="template-grid">
        {templates.map((t) => (
          <div key={t.id} className="tpl-card" data-selected={guide.template === t.id}>
            <button className="tpl-pick" aria-pressed={guide.template === t.id} aria-label={`${t.title}. ${t.description}`} onClick={() => chooseTemplate(guide.template === t.id ? null : t.id)}>
              <GuidePreview shapes={t.shapes} />
              <strong>{t.title}</strong>
              <small>{t.category}</small>
            </button>
            <button className="tpl-star" aria-label={favorites.includes(t.id) ? `Remove ${t.title} from favorites` : `Add ${t.title} to favorites`} aria-pressed={favorites.includes(t.id)} onClick={() => toggleFavorite(t.id)}>{favorites.includes(t.id) ? '★' : '☆'}</button>
          </div>
        ))}
        {cycles.map((c) => (
          <div key={c.id} className="tpl-card" data-selected={cycleId === c.id} data-cycle>
            <button className="tpl-pick" aria-pressed={cycleId === c.id} aria-label={`${c.title} cycle. ${c.description}`} onClick={() => { setCycleId(cycleId === c.id ? null : c.id); setFrames(c.defaultFrames) }}>
              <GuidePreview shapes={c.frame(Math.floor(c.defaultFrames / 3), c.defaultFrames)} />
              <strong>{c.title}</strong>
              <small>Motion · {c.defaultFrames} frames</small>
            </button>
            <button className="tpl-star" aria-label={favorites.includes(`cycle:${c.id}`) ? `Remove ${c.title} from favorites` : `Add ${c.title} to favorites`} aria-pressed={favorites.includes(`cycle:${c.id}`)} onClick={() => toggleFavorite(`cycle:${c.id}`)}>{favorites.includes(`cycle:${c.id}`) ? '★' : '☆'}</button>
          </div>
        ))}
        {templates.length + cycles.length === 0 && <p className="hint" style={{ gridColumn: '1 / -1' }}>{tab === 'Favorites' ? 'Tap the star on a template to keep it here.' : 'Nothing matches that search.'}</p>}
      </div>
      {cycle && (
        <div className="cycle-box" data-testid="cycle-box" ref={boxRef}>
          <CyclePlayer key={cycle.id + frames} id={cycle.id} frames={frames} />
          <div>
            <strong>{cycle.title}</strong>
            <p className="hint">{cycle.description}</p>
            <label className="row" style={{ marginTop: '.4rem' }}>Frames
              <select className="select" aria-label="Number of frames" value={frames} onChange={(e) => setFrames(Number(e.target.value))}>
                {[...new Set([...FRAME_CHOICES, cycle.defaultFrames])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <button className="btn primary sm" style={{ marginTop: '.5rem', width: '100%' }} onClick={() => insertCycleAction(cycle.id, frames)}>Insert {frames} frames</button>
            <p className="hint" style={{ marginTop: '.4rem' }}>Adds frames after the current one with a guide layer you can draw over. Guides never export.</p>
          </div>
        </div>
      )}
      {current && <p className="hint" style={{ marginTop: '.5rem' }}><strong>{current.title}:</strong> {current.description}</p>}
    </div>
  )
}
