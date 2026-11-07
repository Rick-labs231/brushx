import { useState } from 'react'
import type { ProjectMeta } from '../engine/storage.ts'
import { archiveStoredProject, deleteStoredProject, duplicateStoredProject, renameStoredProject } from '../state/actions.ts'
import { navigate } from '../state/router.ts'
import { Dialog, timeAgo } from '../ui/Controls.tsx'
import { Icon } from '../ui/Icon.tsx'
import { useApp } from '../state/app.ts'
import { badgeFor } from '../engine/sync.ts'

export function ProjectCard({ m }: { m: ProjectMeta }) {
  const signedIn = useApp((s) => !!s.cloud.user)
  const base = useApp((s) => s.cloud.bases[m.id])
  const badge = signedIn ? badgeFor({ id: m.id, updatedAt: m.updatedAt }, base) : null
  const [menu, setMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(m.name)
  const [confirm, setConfirm] = useState(false)
  const open = () => navigate({ name: 'editor', id: m.id })
  const finishRename = () => {
    setRenaming(false)
    const n = name.trim()
    if (n && n !== m.name) void renameStoredProject(m.id, n)
    else setName(m.name)
  }
  return (
    <article className="card" data-testid="project-card">
      <button className="thumb" onClick={open} aria-label={`Open ${m.name}`} style={{ cursor: 'pointer' }}>
        {m.thumb ? <img src={m.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} /> : <span className="thumb ph"><Icon name="image" size={28} /></span>}
      </button>
      <div className="body">
        <div className="row between">
          {renaming ? (
            <input className="input" autoFocus value={name} aria-label="Project name" onChange={(e) => setName(e.target.value)} onBlur={finishRename} onKeyDown={(e) => { if (e.key === 'Enter') finishRename(); if (e.key === 'Escape') { setName(m.name); setRenaming(false) } }} />
          ) : (
            <span className="title" title={m.name}>{m.name}</span>
          )}
          <div className="rel">
            <button className="icon-btn sm" aria-label={`Actions for ${m.name}`} aria-expanded={menu} onClick={() => setMenu((v) => !v)}><Icon name="more" size={16} /></button>
            {menu && (
              <div className="menu" onMouseLeave={() => setMenu(false)}>
                <button onClick={open}><Icon name="folder" size={16} />Open</button>
                <button onClick={() => { setMenu(false); setRenaming(true) }}>Rename</button>
                <button onClick={() => { setMenu(false); void duplicateStoredProject(m.id) }}><Icon name="duplicate" size={16} />Duplicate</button>
                <button onClick={() => { setMenu(false); void archiveStoredProject(m.id, !m.archived) }}><Icon name="archive" size={16} />{m.archived ? 'Restore' : 'Archive'}</button>
                <button className="danger" onClick={() => { setMenu(false); setConfirm(true) }}><Icon name="trash" size={16} />Delete</button>
              </div>
            )}
          </div>
        </div>
        <span className="faint" style={{ fontSize: '.75rem' }}>{m.width}×{m.height} · {m.frames} {m.frames === 1 ? 'frame' : 'frames'} · {m.fps} fps · {timeAgo(m.updatedAt)}{badge && <> · <span data-testid="sync-badge" data-badge={badge}>{badge === 'synced' ? '☁ Synced' : badge === 'waiting' ? '☁ Waiting to sync' : '☁ Not synced yet'}</span></>}</span>
      </div>
      {confirm && (
        <Dialog title="Delete this project?" onClose={() => setConfirm(false)} footer={<><button className="btn ghost" onClick={() => setConfirm(false)}>Cancel</button><button className="btn danger" onClick={() => { setConfirm(false); void deleteStoredProject(m.id) }}>Delete project</button></>}>
          <p className="muted">“{m.name}” and all its frames will be removed from this device.{badge && badge !== 'new' ? ' Because it is synced, it will also be removed from your cloud and your other devices.' : ''} This can’t be undone.</p>
        </Dialog>
      )}
    </article>
  )
}
