import { useEffect, useRef, type ReactNode } from 'react'
import { dismissToast } from '../state/toast.ts'
import { useApp } from '../state/app.ts'
import { Icon } from './Icon.tsx'

export function SliderRow(p: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
  disabled?: boolean
}) {
  const id = `s-${p.label.replace(/\W+/g, '')}`
  return (
    <div className="slider-row">
      <label htmlFor={id}>{p.label}</label>
      <input id={id} type="range" min={p.min} max={p.max} step={p.step ?? 1} value={p.value} disabled={p.disabled} onChange={(e) => p.onChange(Number(e.target.value))} />
      <output>{p.format ? p.format(p.value) : Math.round(p.value * 100) / 100}</output>
    </div>
  )
}

export function Toggle(p: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="switch">
      <span>
        {p.label}
        {p.hint && <span className="hint" style={{ display: 'block' }}>{p.hint}</span>}
      </span>
      <input type="checkbox" checked={p.checked} onChange={(e) => p.onChange(e.target.checked)} style={{ width: '1.2rem', height: '1.2rem', accentColor: 'var(--blue)' }} />
    </label>
  )
}

export function Dialog(p: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('input,select,button')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        p.onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      prev?.focus?.()
    }
  }, [])
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={p.title} ref={ref}>
        <header>
          <h2>{p.title}</h2>
          <button className="icon-btn" onClick={p.onClose} aria-label="Close"><Icon name="x" /></button>
        </header>
        {p.children}
        {p.footer && <footer>{p.footer}</footer>}
      </div>
    </div>
  )
}

export function ToastHost() {
  const toasts = useApp((s) => s.toasts)
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span>{t.text}</span>
          <span className="acts">
            {t.actions?.map((a) => (
              <button key={a.label} className="btn sm secondary" onClick={() => { a.run(); dismissToast(t.id) }}>{a.label}</button>
            ))}
            <button className="icon-btn sm" aria-label="Dismiss" onClick={() => dismissToast(t.id)}><Icon name="x" size={14} /></button>
          </span>
        </div>
      ))}
    </div>
  )
}

export function timeAgo(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`
  return new Date(ts).toLocaleDateString()
}
