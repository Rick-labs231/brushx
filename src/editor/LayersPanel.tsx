import { useRef, useState } from 'react'
import { importPicture, importVideo, mediaPrefs, type MediaOptions } from '../state/media.ts'
import {
  addLayerAction, deleteLayerAction, duplicateLayerAction, mergeDownAction, moveLayerAction, patchLayerAction, selectLayer, clearLayerOnFrame,
} from '../state/actions.ts'
import { useApp } from '../state/app.ts'
import { SliderRow } from '../ui/Controls.tsx'
import { Icon } from '../ui/Icon.tsx'

export function LayersPanel() {
  const layers = useApp((s) => s.project?.layers)
  const activeId = useApp((s) => s.layerId)
  const [editing, setEditing] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [opts, setOpts] = useState<MediaOptions>({ ...mediaPrefs })
  const [busy, setBusy] = useState<string | null>(null)
  const pic = useRef<HTMLInputElement>(null)
  const vid = useRef<HTMLInputElement>(null)
  const setOpt = (patch: Partial<MediaOptions>) => { Object.assign(mediaPrefs, patch); setOpts({ ...mediaPrefs }) }
  if (!layers) return null
  const top = [...layers].reverse()
  const active = layers.find((l) => l.id === activeId)
  const idx = layers.findIndex((l) => l.id === activeId)
  return (
    <>
      <div>
        <div className="panel-title"><span>Layers</span><span className="faint">{layers.length}</span></div>
        <ul className="layers" role="listbox" aria-label="Layers">
          {top.map((l) => (
            <li
              key={l.id}
              role="option"
              aria-selected={l.id === activeId}
              className={`layer${l.visible ? '' : ' off'}${overId === l.id && dragId !== l.id ? ' drop' : ''}`}
              draggable={editing !== l.id}
              onClick={() => selectLayer(l.id)}
              onDragStart={() => setDragId(l.id)}
              onDragOver={(e) => { e.preventDefault(); setOverId(l.id) }}
              onDragEnd={() => { setDragId(null); setOverId(null) }}
              onDrop={() => { if (dragId && dragId !== l.id) moveLayerAction(dragId, layers.findIndex((x) => x.id === l.id)); setDragId(null); setOverId(null) }}
            >
              <button className="icon-btn sm" aria-label={l.visible ? `Hide ${l.name}` : `Show ${l.name}`} aria-pressed={l.visible} onClick={(e) => { e.stopPropagation(); patchLayerAction(l.id, { visible: !l.visible }, true) }}><Icon name={l.visible ? 'eye' : 'eyeOff'} size={16} /></button>
              <span className="lname" onDoubleClick={() => setEditing(l.id)}>
                {editing === l.id ? (
                  <input autoFocus defaultValue={l.name} aria-label="Layer name" onClick={(e) => e.stopPropagation()} onBlur={(e) => { const n = e.target.value.trim(); if (n && n !== l.name) patchLayerAction(l.id, { name: n }, true); setEditing(null) }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditing(null) }} />
                ) : l.name}
                {l.guide && <em className="guide-chip" title="Guide layer: never exported">guide</em>}
              </span>
              <button className="icon-btn sm" aria-label={l.locked ? `Unlock ${l.name}` : `Lock ${l.name}`} aria-pressed={l.locked} onClick={(e) => { e.stopPropagation(); patchLayerAction(l.id, { locked: !l.locked }, true) }}><Icon name={l.locked ? 'lock' : 'unlock'} size={16} /></button>
            </li>
          ))}
        </ul>
      </div>
      <div className="media-box" style={{ display: 'grid', gap: '.5rem' }}>
        <div className="panel-title"><span>Pictures &amp; video</span></div>
        <input ref={pic} type="file" accept="image/*" hidden data-testid="media-picture" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setBusy('Adding picture…'); await importPicture(f, opts); setBusy(null) } }} />
        <input ref={vid} type="file" accept="video/*" hidden data-testid="media-video" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setBusy('Reading video…'); await importVideo(f, opts, (d, t) => setBusy(`Reading video… ${d}/${t}`)); setBusy(null) } }} />
        <div className="row">
          <button className="btn secondary sm grow" disabled={!!busy} onClick={() => pic.current?.click()}>Add picture…</button>
          <button className="btn secondary sm grow" disabled={!!busy} onClick={() => vid.current?.click()}>Add video…</button>
        </div>
        <label className="row"><input type="radio" name="media-use" checked={opts.reference} onChange={() => setOpt({ reference: true })} />Trace under my drawing (not exported)</label>
        <label className="row"><input type="radio" name="media-use" checked={!opts.reference} onChange={() => setOpt({ reference: false })} />Part of the animation (exported)</label>
        <label className="row"><input type="checkbox" checked={opts.extend} onChange={(e) => setOpt({ extend: e.target.checked })} />Add frames to fit a video</label>
        <label className="row"><input type="checkbox" checked={opts.sound} onChange={(e) => setOpt({ sound: e.target.checked })} />Use the video’s sound</label>
        {busy && <p className="hint" role="status">{busy}</p>}
        <p className="hint">Video starts on the current frame, one picture per frame. Drawing on top of a trace layer is safe: the layer is locked.</p>
      </div>
      {active && (
        <>
          <SliderRow label="Opacity" value={active.opacity} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => patchLayerAction(active.id, { opacity: v })} />
          <label className="row" style={{ marginBottom: '.4rem' }}><input type="checkbox" checked={!active.guide} onChange={(e) => patchLayerAction(active.id, { guide: !e.target.checked }, true)} />Include this layer in exports{active.guide ? ' (currently a guide)' : ''}</label>
          <div className="layer-actions">
            <button className="icon-btn" title="Add layer" aria-label="Add layer" onClick={addLayerAction}><Icon name="plus" /></button>
            <button className="icon-btn" title="Duplicate layer" aria-label="Duplicate layer" onClick={() => duplicateLayerAction(active.id)}><Icon name="copy" /></button>
            <button className="icon-btn" title="Move up" aria-label="Move layer up" disabled={idx >= layers.length - 1} onClick={() => moveLayerAction(active.id, idx + 1)}><Icon name="chevronUp" /></button>
            <button className="icon-btn" title="Move down" aria-label="Move layer down" disabled={idx <= 0} onClick={() => moveLayerAction(active.id, idx - 1)}><Icon name="chevronDown" /></button>
            <button className="icon-btn" title="Merge down" aria-label="Merge layer down" disabled={idx <= 0} onClick={() => mergeDownAction(active.id)}><Icon name="merge" /></button>
            <button className="icon-btn" title="Clear this layer on this frame" aria-label="Clear layer on this frame" onClick={clearLayerOnFrame}><Icon name="x" /></button>
            <button className="icon-btn" title="Delete layer" aria-label="Delete layer" disabled={layers.length <= 1} onClick={() => deleteLayerAction(active.id)}><Icon name="trash" /></button>
          </div>
          <p className="hint">Double-click a name to rename. Drag layers to reorder.</p>
        </>
      )}
    </>
  )
}
