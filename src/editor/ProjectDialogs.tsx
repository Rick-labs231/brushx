import { useEffect, useState } from 'react'
import { applyProjectSettings, createRestorePoint, deleteSnapshotAction, openDialog, restoreSnapshotAction, saveCopyAction } from '../state/actions.ts'
import { useApp } from '../state/app.ts'
import { Dialog } from '../ui/Controls.tsx'
import { listSnapshots } from '../engine/storage.ts'
import { MAX_SIZE, MIN_SIZE } from '../engine/projectOps.ts'
import type { SnapshotMeta } from '../engine/versions.ts'
import { fitView } from './viewControls.ts'

const clamp = (v: number) => Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(v) || MIN_SIZE))
const SIZES = [
  { label: 'HD 16:9', w: 1280, h: 720 },
  { label: 'Full HD', w: 1920, h: 1080 },
  { label: 'Vertical 9:16', w: 1080, h: 1920 },
  { label: 'Square', w: 1080, h: 1080 },
]

export function ProjectDialog() {
  const project = useApp((s) => s.project)
  const [name, setName] = useState(project?.name ?? '')
  const [fps, setFps] = useState(project?.fps ?? 12)
  const [w, setW] = useState(project?.width ?? 1280)
  const [h, setH] = useState(project?.height ?? 720)
  const [transparent, setTransparent] = useState(project?.background == null)
  const [bg, setBg] = useState(project?.background ?? '#ffffff')
  const [anchor, setAnchor] = useState({ ax: 0.5, ay: 0.5 })
  if (!project) return null
  const resized = clamp(w) !== project.width || clamp(h) !== project.height
  const apply = () => {
    applyProjectSettings({ name: name.trim() || project.name, fps, background: transparent ? null : bg, width: clamp(w), height: clamp(h), ...anchor })
    openDialog(null)
    if (resized) window.setTimeout(fitView, 30)
  }
  return (
    <Dialog title="Project settings" onClose={() => openDialog(null)} footer={<><button className="btn ghost" onClick={() => openDialog(null)}>Cancel</button><button className="btn primary" onClick={apply}>Apply</button></>}>
      <div className="field"><label htmlFor="ps-name">Name</label><input id="ps-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="row">
        <div className="field"><label htmlFor="ps-fps">Frame rate</label><input id="ps-fps" className="input" type="number" min={1} max={60} value={fps} onChange={(e) => setFps(Number(e.target.value))} /></div>
        <div className="field"><span className="label">Background</span>
          <label><input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} /> Transparent</label>
          {!transparent && <input aria-label="Background colour" type="color" value={bg} onChange={(e) => setBg(e.target.value)} />}
        </div>
      </div>
      <div className="field"><span className="label">Canvas size</span>
        <div className="seg" role="group" aria-label="Size presets">{SIZES.map((p) => <button key={p.label} aria-pressed={w === p.w && h === p.h} onClick={() => { setW(p.w); setH(p.h) }}>{p.label}</button>)}</div>
      </div>
      <div className="row">
        <div className="field"><label htmlFor="ps-w">Width</label><input id="ps-w" className="input" type="number" value={w} onChange={(e) => setW(Number(e.target.value))} /></div>
        <div className="field"><label htmlFor="ps-h">Height</label><input id="ps-h" className="input" type="number" value={h} onChange={(e) => setH(Number(e.target.value))} /></div>
      </div>
      {resized && (
        <div className="field"><span className="label">Keep artwork anchored to</span>
          <div role="group" aria-label="Anchor" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 28px)', gap: 4 }}>
            {[0, 0.5, 1].flatMap((ay) => [0, 0.5, 1].map((ax) => (
              <button key={`${ax}${ay}`} className="btn sm secondary" aria-label={`Anchor ${ay === 0 ? 'top' : ay === 1 ? 'bottom' : 'middle'} ${ax === 0 ? 'left' : ax === 1 ? 'right' : 'centre'}`} aria-pressed={anchor.ax === ax && anchor.ay === ay} onClick={() => setAnchor({ ax, ay })} style={{ width: 28, height: 28, padding: 0 }}>{anchor.ax === ax && anchor.ay === ay ? '●' : '·'}</button>
            )))}
          </div>
          <small>Nothing is deleted when the canvas shrinks. Undo (Ctrl+Z) reverts the whole change.</small>
        </div>
      )}
      <div className="row">
        <button className="btn sm secondary" onClick={() => void saveCopyAction()}>Save a copy</button>
        <button className="btn sm secondary" onClick={() => openDialog('versions')}>Version history</button>
      </div>
    </Dialog>
  )
}

const KIND: Record<SnapshotMeta['kind'], string> = { auto: 'Auto', manual: 'Saved', 'before-restore': 'Before restore' }

function ago(t: number, now: number) {
  const m = Math.round((now - t) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return `${Math.round(h / 24)} d ago`
}

export function VersionsDialog() {
  const id = useApp((s) => s.project?.id)
  const [list, setList] = useState<SnapshotMeta[] | null>(null)
  const [note, setNote] = useState('')
  const reload = () => { if (id) void listSnapshots(id).then(setList) }
  useEffect(reload, [id])
  const now = Date.now()
  return (
    <Dialog title="Version history" onClose={() => openDialog(null)} footer={<button className="btn ghost" onClick={() => openDialog(null)}>Close</button>}>
      <div className="row">
        <input className="input" aria-label="Note for restore point" placeholder="Note (optional)" maxLength={80} value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn sm primary" onClick={() => void createRestorePoint(note).then(() => { setNote(''); reload() })}>Save restore point now</button>
      </div>
      {list === null ? <p>Loading…</p> : list.length === 0 ? <p>No earlier versions yet. Brush X keeps one automatically every few minutes while you draw.</p> : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }} aria-label="Versions">
          {list.map((v) => (
            <li key={v.id} className="row" style={{ alignItems: 'center', gap: 10 }}>
              {v.thumb ? <img src={v.thumb} alt="" width={64} height={40} style={{ objectFit: 'contain', borderRadius: 4 }} /> : <span style={{ width: 64 }} />}
              <span style={{ flex: 1 }}>
                <strong title={new Date(v.createdAt).toLocaleString()}>{ago(v.createdAt, now)}</strong> <span className="chip">{KIND[v.kind]}</span><br />
                <small>{v.frames} frames · {v.layers} layers{v.note ? ` · ${v.note}` : ''}</small>
              </span>
              <button className="btn sm secondary" onClick={() => void restoreSnapshotAction(v.id)}>Restore</button>
              <button className="icon-btn" aria-label="Delete version" title="Delete" onClick={() => void deleteSnapshotAction(v.id).then(reload)}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  )
}
