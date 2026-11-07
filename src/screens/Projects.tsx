import { useEffect, useRef, useState } from 'react'
import { backupAll, importProjectFile, openDialog } from '../state/actions.ts'
import { RecoveryBanner } from './RecoveryBanner.tsx'
import { useApp } from '../state/app.ts'
import { Icon } from '../ui/Icon.tsx'
import { ProjectCard } from './ProjectCard.tsx'
import { Shell } from './Shell.tsx'

export function Projects() {
  const library = useApp((s) => s.library)
  const persistent = useApp((s) => s.persistent)
  const [tab, setTab] = useState<'active' | 'archived'>('active')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'recent' | 'name' | 'created'>('recent')
  const [usage, setUsage] = useState<{ used: number; quota: number; persisted: boolean } | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const refreshUsage = async () => {
    try {
      const e = await navigator.storage.estimate()
      const persisted = (await navigator.storage.persisted?.()) ?? false
      setUsage({ used: e.usage ?? 0, quota: e.quota ?? 0, persisted })
    } catch { setUsage(null) }
  }
  useEffect(() => { void refreshUsage() }, [library])
  const list = library
    .filter((m) => m.archived === (tab === 'archived') && m.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'created' ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt))
  const mb = (n: number) => (n / 1048576 < 10 ? (n / 1048576).toFixed(1) : Math.round(n / 1048576)) + ' MB'
  return (
    <Shell search={{ value: q, onChange: setQ }}>
      <div className="row between" style={{ flexWrap: 'wrap', gap: '.75rem' }}>
        <h1>Projects</h1>
        <div className="row">
          <input ref={file} type="file" accept=".brushx,.zip,application/json,application/zip" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) await importProjectFile(f); e.target.value = '' }} />
          <button className="btn secondary" onClick={() => file.current?.click()}><Icon name="upload" size={18} />Import</button>
          <button className="btn secondary" onClick={() => void backupAll()}><Icon name="download" size={18} />Backup all</button>
          <button className="btn primary" onClick={() => openDialog('new-project')}><Icon name="plus" size={18} />New Project</button>
        </div>
      </div>
      <RecoveryBanner />
      {!persistent && <div className="banner" style={{ marginTop: '1rem' }}><Icon name="alert" size={18} />This browser is blocking local storage, so projects are only kept until you close the tab. Use “Save local copy” in the editor to keep your work.</div>}
      <div className="tabs" role="tablist" style={{ margin: '1rem 0' }}>
        <button role="tab" aria-selected={tab === 'active'} onClick={() => setTab('active')}>Active</button>
        <button role="tab" aria-selected={tab === 'archived'} onClick={() => setTab('archived')}>Archived</button>
        <span style={{ flex: 1 }} />
        <label className="muted" style={{ fontSize: '.85rem' }}>Sort <select aria-label="Sort projects" className="input" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} style={{ width: 'auto' }}><option value="recent">Recently edited</option><option value="name">Name</option><option value="created">Newest created</option></select></label>
      </div>
      {list.length === 0 ? (
        <div className="empty">
          <Icon name="folder" size={32} />
          <h2>{tab === 'archived' ? 'Nothing archived.' : q ? 'No matches.' : 'Your canvas is waiting.'}</h2>
          {tab === 'active' && !q && <button className="btn primary" onClick={() => openDialog('new-project')}><Icon name="plus" size={18} />Create New Animation</button>}
        </div>
      ) : (
        <div className="grid">{list.map((m) => <ProjectCard key={m.id} m={m} />)}</div>
      )}
      {usage && usage.quota > 0 && (
        <p className="muted" data-testid="storage-usage" style={{ marginTop: '1.5rem', fontSize: '.85rem' }}>
          Using {mb(usage.used)} of about {mb(usage.quota)} available in this browser.{' '}
          {usage.persisted ? 'Storage is protected from automatic clean-up.' : <button className="btn sm ghost" onClick={() => void navigator.storage.persist?.().then(refreshUsage)}>Protect from clean-up</button>}
        </p>
      )}
    </Shell>
  )
}
