import { startTour } from '../tour/tour.ts'
import { useEffect, useRef, useState } from 'react'
import { closeProject, openDialog, patch, redo, renameOpenProject, undo } from '../state/actions.ts'
import { useApp } from '../state/app.ts'
import { saveNow } from '../state/persist.ts'
import { navigate } from '../state/router.ts'
import { Icon, Logo } from '../ui/Icon.tsx'

/** Phones: the less-used buttons live behind one "More" button so the project name has room. */
function MoreMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('pointerdown', away)
    window.addEventListener('keydown', esc)
    return () => { window.removeEventListener('pointerdown', away); window.removeEventListener('keydown', esc) }
  }, [open])
  const pick = (fn: () => void) => () => { setOpen(false); fn() }
  return (
    <div className="more-wrap show-sm" ref={ref} style={{ position: 'relative' }}>
      <button className={`icon-btn${open ? ' active' : ''}`} aria-label="More" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="more" /></button>
      {open && (
        <div className="menu" role="menu">
          <button role="menuitem" onClick={pick(() => startTour('editor'))}>Beginner guide</button>
          <button role="menuitem" onClick={pick(() => openDialog('project'))}>Project settings and versions</button>
          <button role="menuitem" onClick={pick(() => void saveNow())}>Save now</button>
          <button role="menuitem" onClick={pick(() => patch({ focusMode: true }))}>Hide interface</button>
        </div>
      )}
    </div>
  )
}

export function TopBar() {
  const name = useApp((s) => s.project?.name ?? '')
  const status = useApp((s) => s.saveStatus)
  const canUndo = useApp((s) => s.history.past.length > 0)
  const canRedo = useApp((s) => s.history.future.length > 0)
  const drawer = useApp((s) => s.drawerOpen)
  const [draft, setDraft] = useState(name)
  useEffect(() => setDraft(name), [name])
  const label = status === 'saving' ? 'Saving…' : status === 'dirty' ? 'Unsaved' : status === 'error' ? 'Not saved' : 'Saved'
  const cls = status === 'error' ? 'err' : status === 'saved' ? 'ok' : 'warn'
  const commitName = () => {
    const n = draft.trim()
    if (n && n !== name) renameOpenProject(n)
    else setDraft(name)
  }
  return (
    <header className="ed-top">
      <button className="icon-btn" aria-label="Back to projects" title="Back to projects" onClick={() => { void saveNow().then((ok) => { if (ok) { closeProject(); navigate({ name: 'projects' }) } }) }}><Icon name="home" /></button>
      <span className="hide-sm"><Logo size={22} /></span>
      <input className="name" aria-label="Project name" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commitName} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
      <span className={`chip ${cls}`} data-testid="save-status" title={label}>{label}</span>
      <span className="grow" />
      <button className="icon-btn hide-sm" aria-label="Beginner guide" title="Replay the beginner guide" onClick={() => startTour('editor')}><span aria-hidden="true" style={{ fontWeight: 700 }}>?</span></button>
      <button className="icon-btn" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}><Icon name="undo" /></button>
      <button className="icon-btn" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}><Icon name="redo" /></button>
      <span className="sep hide-sm" />
      <button className="btn sm secondary hide-sm" onClick={() => void saveNow()}>Save</button>
      <button className="icon-btn hide-sm" aria-label="Project settings" title="Project settings and version history" onClick={() => openDialog('project')}><Icon name="settings" /></button>
      <button className="icon-btn hide-sm" aria-label="Focus mode" title="Hide interface (Tab)" onClick={() => patch({ focusMode: true })}><Icon name="fit" /></button>
      <button className="btn sm primary" onClick={() => openDialog('export')}><Icon name="download" size={16} /><span className="export-label">Export</span></button>
      <button className={`icon-btn show-sm${drawer ? ' active' : ''}`} aria-label="Layers and properties" aria-expanded={drawer} onClick={() => patch({ drawerOpen: !drawer })}><Icon name="panel" /></button>
      <MoreMenu />
    </header>
  )
}
