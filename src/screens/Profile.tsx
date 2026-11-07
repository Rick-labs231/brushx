import { navigate } from '../state/router.ts'
import { startTour, turnOnTours } from '../tour/tour.ts'
import { openDialog, setPrefs } from '../state/actions.ts'
import { useApp } from '../state/app.ts'
import { SliderRow, Toggle } from '../ui/Controls.tsx'
import { Icon } from '../ui/Icon.tsx'
import { CloudCard } from './CloudCard.tsx'
import { Shell } from './Shell.tsx'

/** A guide belongs to its screen, so go there first. */
function replay(id: 'home' | 'projects') {
  navigate({ name: id })
  window.setTimeout(() => startTour(id), 500)
}

export function Profile() {
  const prefs = useApp((s) => s.prefs)
  const persistent = useApp((s) => s.persistent)
  const count = useApp((s) => s.library.length)
  return (
    <Shell>
      <h1>Profile</h1>
      <div className="grid" style={{ marginTop: '1rem', gridTemplateColumns: 'repeat(auto-fit,minmax(18rem,1fr))' }}>
        <section className="card"><div className="body" style={{ padding: '1rem' }}>
          <h2>Accessibility</h2>
          <SliderRow label="UI scale" value={prefs.uiScale} min={0.85} max={1.3} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setPrefs({ uiScale: v })} />
          <Toggle label="High contrast" hint="Brighter text and stronger borders" checked={prefs.highContrast} onChange={(v) => setPrefs({ highContrast: v })} />
          <Toggle label="Left-handed toolbar" hint="Tools on the right, panels on the left" checked={prefs.leftHanded} onChange={(v) => setPrefs({ leftHanded: v })} />
          <button className="btn secondary" onClick={() => openDialog('shortcuts')}><Icon name="keyboard" size={18} />Keyboard shortcuts</button>
        </div></section>
        <section className="card" data-testid="tour-card"><div className="body" style={{ padding: '1rem', display: 'grid', gap: '.5rem' }}>
          <h2>Beginner guides</h2>
          <p className="muted">Short, interactive tours of every screen. Skip or replay them any time.</p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className="btn secondary sm" onClick={() => replay('home')}>Home</button>
            <button className="btn secondary sm" onClick={() => replay('projects')}>Projects</button>
            <button className="btn secondary sm" onClick={() => startTour('profile')}>This screen</button>
          </div>
          <p className="faint">The editor guide starts from the ? button at the top of the editor. <button className="btn ghost sm" onClick={turnOnTours}>Show guides on every screen again</button></p>
        </div></section>
        <CloudCard />
        <section className="card"><div className="body" style={{ padding: '1rem' }}>
          <h2>This device</h2>
          <p className="muted">{count} {count === 1 ? 'project' : 'projects'} stored in this browser.</p>
          <span className={`chip ${persistent ? 'ok' : 'warn'}`}>{persistent ? 'Autosave on' : 'Storage blocked — projects won’t persist'}</span>
          <p className="faint">“Save project file” in the export menu, and “Backup all” on the Projects screen, make portable backups.</p>
        </div></section>
        <section className="card"><div className="body" style={{ padding: '1rem' }}>
          <h2>About</h2>
          <p className="muted">Brush X — Animate Faster. Create Freely.</p>
          <p className="faint">Rick Nova Creative Technology</p>
        </div></section>
      </div>
    </Shell>
  )
}
