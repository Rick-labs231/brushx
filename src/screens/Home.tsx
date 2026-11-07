import { useState } from 'react'
import { openDialog } from '../state/actions.ts'
import { useApp } from '../state/app.ts'
import { Icon } from '../ui/Icon.tsx'
import { ProjectCard } from './ProjectCard.tsx'
import { RecoveryBanner } from './RecoveryBanner.tsx'
import { Shell } from './Shell.tsx'

export function Home() {
  const library = useApp((s) => s.library)
  const loaded = useApp((s) => s.libraryLoaded)
  const [q, setQ] = useState('')
  const recent = library.filter((m) => !m.archived && m.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8)
  const none = loaded && library.filter((m) => !m.archived).length === 0
  return (
    <Shell search={{ value: q, onChange: setQ }}>
      <RecoveryBanner />
      <section className="hero">
        <div>
          <h1>Animate faster. Create freely.</h1>
          <p>Templates and tools that build the frame with you — the style stays yours.</p>
        </div>
        <button className="btn primary big" onClick={() => openDialog('new-project')}><Icon name="plus" size={20} />New Project</button>
      </section>
      <div className="section-head"><h2>Recent projects</h2></div>
      {none ? (
        <div className="empty">
          <Icon name="brush" size={36} />
          <h2>Your canvas is waiting.</h2>
          <p className="muted">Start a new animation and your work will appear here.</p>
          <button className="btn primary" onClick={() => openDialog('new-project')}><Icon name="plus" size={18} />Create New Animation</button>
        </div>
      ) : recent.length === 0 && loaded ? (
        <p className="muted">No projects match “{q}”.</p>
      ) : (
        <div className="grid">{recent.map((m) => <ProjectCard key={m.id} m={m} />)}</div>
      )}
    </Shell>
  )
}
