import { useEffect, useState } from 'react'
import { createNewProject, exportFramePng, exportProjectFile, openDialog } from '../state/actions.ts'
import { useApp } from '../state/app.ts'
import { Dialog } from '../ui/Controls.tsx'
import { ALL_TOOLS, SHORTCUTS, hasCustomKeys, keyOf, onKeysChanged, resetKeys, setToolKey } from './tools.ts'
import type { ToolId } from '../engine/types.ts'
import { hasCustomRange, playSequence } from '../engine/projectOps.ts'
import { loadKind, loadVideoFormat, loadWatermark, saveKind, saveVideoFormat, saveWatermark, type ExportKind } from '../state/exportPrefs.ts'
import { GIF_MEMORY_LIMIT_MB, exportGif, exportPngSequence, exportVideo, gifMemoryMB, planVideo, videoSupported } from '../state/exporters.ts'
import { VIDEO_PRESETS, presetById, type VideoFormat, type VideoQuality } from '../engine/video.ts'

const PRESETS = [
  { id: 'hd', label: 'HD 16:9', w: 1280, h: 720 },
  { id: 'fhd', label: 'Full HD', w: 1920, h: 1080 },
  { id: 'vert', label: 'Vertical 9:16', w: 1080, h: 1920 },
  { id: 'sq', label: 'Square', w: 1080, h: 1080 },
  { id: 'custom', label: 'Custom', w: 1280, h: 720 },
]
const clampDim = (v: number) => Math.max(64, Math.min(4096, Math.round(v) || 64))

export function NewProjectDialog() {
  const [name, setName] = useState('Untitled animation')
  const [preset, setPreset] = useState('hd')
  const [size, setSize] = useState({ w: 1280, h: 720 })
  const [portrait, setPortrait] = useState(false)
  const [fps, setFps] = useState(12)
  const [transparent, setTransparent] = useState(false)
  const [bg, setBg] = useState('#ffffff')
  const pick = (id: string) => {
    setPreset(id)
    const p = PRESETS.find((x) => x.id === id)
    if (p && id !== 'custom') { setSize({ w: p.w, h: p.h }); setPortrait(p.h > p.w) }
  }
  const w = portrait ? Math.min(size.w, size.h) : Math.max(size.w, size.h)
  const h = portrait ? Math.max(size.w, size.h) : Math.min(size.w, size.h)
  const create = () => void createNewProject({ name: name.trim() || 'Untitled animation', width: clampDim(w), height: clampDim(h), fps, background: transparent ? null : bg })
  return (
    <Dialog title="New project" onClose={() => openDialog(null)} footer={<><button className="btn ghost" onClick={() => openDialog(null)}>Cancel</button><button className="btn primary" onClick={create}>Create animation</button></>}>
      <div className="field"><label htmlFor="np-name">Name</label><input id="np-name" className="input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} /></div>
      <div className="field"><span className="label">Canvas size</span>
        <div className="seg" role="group" aria-label="Canvas size">{PRESETS.map((p) => <button key={p.id} aria-pressed={preset === p.id} onClick={() => pick(p.id)}>{p.label}</button>)}</div>
      </div>
      <div className="row">
        <div className="field grow"><label htmlFor="np-w">Width</label><input id="np-w" className="input" type="number" min={64} max={4096} value={w} onChange={(e) => { setPreset('custom'); setSize({ w: Number(e.target.value), h }) }} /></div>
        <div className="field grow"><label htmlFor="np-h">Height</label><input id="np-h" className="input" type="number" min={64} max={4096} value={h} onChange={(e) => { setPreset('custom'); setSize({ w, h: Number(e.target.value) }) }} /></div>
        <div className="field"><span className="label">Orientation</span>
          <div className="seg"><button aria-pressed={!portrait} onClick={() => setPortrait(false)}>Landscape</button><button aria-pressed={portrait} onClick={() => setPortrait(true)}>Portrait</button></div>
        </div>
      </div>
      <div className="row">
        <div className="field grow"><label htmlFor="np-fps">Frame rate</label>
          <select id="np-fps" className="select" value={fps} onChange={(e) => setFps(Number(e.target.value))}>{[6, 8, 12, 15, 24, 30].map((n) => <option key={n} value={n}>{n} fps</option>)}</select>
        </div>
        <div className="field grow"><span className="label">Background</span>
          <div className="row">
            <input type="color" aria-label="Background color" value={bg} disabled={transparent} onChange={(e) => setBg(e.target.value)} style={{ width: '2.4rem', height: '2.25rem' }} />
            <label className="row"><input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} />Transparent</label>
          </div>
        </div>
      </div>
    </Dialog>
  )
}


export function ExportDialog() {
  const project = useApp((s) => s.project)
  const [kind, setKindState] = useState<ExportKind>(() => loadKind(project?.frames.length ?? 1))
  const setKind = (k: ExportKind) => { setKindState(k); saveKind(k) }
  const [watermark, setWatermarkState] = useState(loadWatermark)
  const setWatermark = (on: boolean) => { setWatermarkState(on); saveWatermark(on) }
  const [scale, setScale] = useState(1)
  const [transparent, setTransparent] = useState(false)
  const [useRange, setUseRange] = useState(() => !!project && hasCustomRange(project))
  const [expand, setExpand] = useState(true)
  const [loop, setLoop] = useState(true)
  const [busy, setBusy] = useState<null | { done: number; total: number }>(null)
  const [error, setError] = useState('')
  const [vFormat, setVFormatState] = useState<VideoFormat>(loadVideoFormat)
  const setVFormat = (f: VideoFormat) => { setVFormatState(f); saveVideoFormat(f) }
  const [preset, setPreset] = useState('project')
  const [vFps, setVFps] = useState(project?.fps ?? 12)
  const [quality, setQuality] = useState<VideoQuality>('medium')
  const [vOk, setVOk] = useState<boolean | null>(null)
  const [withSound, setWithSound] = useState(true)
  useEffect(() => { setVOk(null); void videoSupported(vFormat).then(setVOk) }, [vFormat])
  if (!project) return null
  const custom = hasCustomRange(project)
  const rangeOn = custom && useRange
  const seq = playSequence(project, rangeOn)
  const mem = kind === 'gif' ? gifMemoryMB(project, { scale, useRange: rangeOn }) : 0
  const tooBig = mem > GIF_MEMORY_LIMIT_MB
  const plan = kind === 'video' ? planVideo(project, { presetId: preset, scale, fps: vFps, quality, useRange: rangeOn }) : null
  const run = async () => {
    setError('')
    setBusy({ done: 0, total: kind === 'video' ? plan!.frames : seq.length })
    const o = { scale, transparent, useRange: rangeOn, expandHolds: expand, loop, onProgress: (done: number, total: number) => setBusy({ done, total }) }
    try {
      if (kind === 'video') await exportVideo({ format: vFormat, presetId: preset, scale, fps: vFps, quality, useRange: rangeOn, includeSound: withSound, watermark, onProgress: o.onProgress })
      else if (kind === 'gif') await exportGif({ ...o, watermark })
      else await exportPngSequence(o)
    } catch {
      setError('Export failed. Try a smaller size or fewer frames.')
    } finally {
      setBusy(null)
    }
  }
  return (
    <Dialog title="Export" onClose={() => !busy && openDialog(null)} footer={<button className="btn ghost" disabled={!!busy} onClick={() => openDialog(null)}>Done</button>}>
      <div className="field"><span className="label">Format</span>
        <div className="seg" role="group" aria-label="Format">
          <button aria-pressed={kind === 'video'} onClick={() => setKind('video')}>Video</button>
          <button aria-pressed={kind === 'gif'} onClick={() => setKind('gif')}>GIF</button>
          <button aria-pressed={kind === 'seq'} onClick={() => setKind('seq')}>PNG sequence</button>
          <button aria-pressed={kind === 'png'} onClick={() => setKind('png')}>PNG frame</button>
        </div>
      </div>
      {kind === 'video' && (
        <>
          <div className="field"><span className="label">Video format</span>
            <div className="seg" role="group" aria-label="Video format">
              <button aria-pressed={vFormat === 'mp4'} onClick={() => setVFormat('mp4')}>MP4 (H.264)</button>
              <button aria-pressed={vFormat === 'webm'} onClick={() => setVFormat('webm')}>WebM (VP9)</button>
            </div>
          </div>
          <div className="field"><label htmlFor="ex-preset" className="label">Preset</label>
            <select id="ex-preset" className="input" value={preset} onChange={(e) => setPreset(e.target.value)}>{VIDEO_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}{p.note ? ` — ${p.note}` : ''}</option>)}</select>
            {preset !== 'project' && <span className="hint">Your canvas is scaled to fit and centred on the {presetById(preset).label} frame.</span>}
          </div>
          {preset === 'project' && (
            <div className="field"><span className="label">Frame rate</span>
              <div className="seg" role="group" aria-label="Video frame rate">{[12, 24, 30, 60].map((f) => <button key={f} aria-pressed={vFps === f} onClick={() => setVFps(f)}>{f} fps</button>)}</div>
            </div>
          )}
          <div className="field"><span className="label">Quality</span>
            <div className="seg" role="group" aria-label="Quality">{(['low', 'medium', 'high'] as const).map((q) => <button key={q} aria-pressed={quality === q} onClick={() => setQuality(q)}>{q[0].toUpperCase() + q.slice(1)}</button>)}</div>
          </div>
          {project.audio && <label className="row"><input type="checkbox" checked={withSound} disabled={project.audio.muted} onChange={(e) => setWithSound(e.target.checked)} />Include sound{project.audio.muted ? ' (muted in the Sound panel)' : ` (${project.audio.name})`}</label>}
          {plan && <span className="hint" data-testid="video-plan">{plan.width}×{plan.height} · {plan.fps} fps · {plan.seconds.toFixed(1)} s · about {Math.max(0.01, (plan.bitrate * plan.seconds) / 8 / 1048576).toFixed(1)} MB</span>}
          {vOk === false && <span className="hint" role="alert" style={{ color: 'var(--warning)' }}>This browser can’t encode {vFormat.toUpperCase()}. Try a recent Chrome or Edge, or export a GIF or PNG sequence.</span>}
        </>
      )}
      {kind !== 'video' && <div className="field"><span className="label">Size</span>
        <div className="seg" role="group" aria-label="Scale">{[0.25, 0.5, 1, 2].map((s) => <button key={s} aria-pressed={scale === s} onClick={() => setScale(s)}>{s}× · {Math.round(project.width * s)}×{Math.round(project.height * s)}</button>)}</div>
      </div>}
      {kind !== 'video' && <label className="row"><input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} />Transparent background</label>}
      {kind !== 'png' && (
        <>
          <div className="field"><span className="label">Frames</span>
            <div className="seg" role="group" aria-label="Frame range">
              <button aria-pressed={!rangeOn} onClick={() => setUseRange(false)}>All · {project.frames.length}</button>
              <button aria-pressed={rangeOn} disabled={!custom} onClick={() => setUseRange(true)}>Work range{custom ? ` · ${seq.length}` : ''}</button>
            </div>
            {!custom && <span className="hint">Set In / Out on the timeline to export just part of the animation.</span>}
          </div>
          {(kind === 'gif' || kind === 'video') && <label className="row"><input type="checkbox" checked={watermark} onChange={(e) => setWatermark(e.target.checked)} />Add small Brush X watermark</label>}
          {kind === 'gif' && <label className="row"><input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />Loop forever</label>}
          {kind === 'seq' && <label className="row"><input type="checkbox" checked={expand} onChange={(e) => setExpand(e.target.checked)} />One image per tick (keeps held frames’ timing)</label>}
          {kind === 'gif' && <span className="hint">GIFs use 256 colours, so gradients may band. Held frames become longer delays.</span>}
          {tooBig && <span className="hint" role="alert" style={{ color: 'var(--warning)' }}>About {Math.round(mem)} MB of memory needed. Pick a smaller size or the work range.</span>}
        </>
      )}
      {busy && <div className="chip" role="status">Exporting {busy.done} / {busy.total}…</div>}
      {error && <div className="chip err" role="alert">{error}</div>}
      {kind === 'png'
        ? <button className="btn primary" onClick={() => exportFramePng({ scale, transparent })}>Export current frame as PNG</button>
        : <button className="btn primary" disabled={!!busy || tooBig || (kind === 'video' && vOk !== true)} onClick={() => void run()}>{busy ? 'Exporting…' : kind === 'video' ? `Export ${vFormat.toUpperCase()}` : kind === 'gif' ? 'Export GIF' : 'Export PNG sequence'}</button>}
      <div className="field"><span className="label">Backup</span>
        <button className="btn secondary" onClick={exportProjectFile}>Save project file (.brushx)</button>
        <span className="hint">Re-import it from the Projects screen. Exports never include guides or onion skin.</span>
      </div>
    </Dialog>
  )
}

export function ShortcutsDialog() {
  const [, bump] = useState(0)
  const [listening, setListening] = useState<ToolId | null>(null)
  const [msg, setMsg] = useState('')
  useEffect(() => onKeysChanged(() => bump((n) => n + 1)), [])
  useEffect(() => {
    if (!listening) return
    const h = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.key === 'Escape') { setListening(null); return }
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return
      const err = setToolKey(listening, e.key)
      setMsg(err ?? '')
      if (!err) setListening(null)
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [listening])
  return (
    <Dialog title="Keyboard shortcuts" onClose={() => openDialog(null)} footer={<button className="btn ghost" disabled={!hasCustomKeys()} onClick={() => { resetKeys(); setMsg('') }}>Reset tool keys</button>}>
      <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '.4rem 1rem', margin: 0 }}>
        {SHORTCUTS.map(([a, b]) => (<div key={a} style={{ display: 'contents' }}><dt className="muted">{a}</dt><dd style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>{b}</dd></div>))}
      </dl>
      <div className="panel-title" style={{ marginTop: '1rem' }}><span>Tool keys (click one to change it)</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '.35rem 1rem', alignItems: 'center' }}>
        {ALL_TOOLS.map((t) => (
          <div key={t.id} style={{ display: 'contents' }}>
            <span className="muted">{t.label}</span>
            <button className="btn secondary sm" aria-label={`Key for ${t.label}`} aria-pressed={listening === t.id} onClick={() => { setMsg(''); setListening(listening === t.id ? null : t.id) }} style={{ minWidth: '4.5rem' }}>{listening === t.id ? 'Press a key…' : keyOf(t)}</button>
          </div>
        ))}
      </div>
      {msg && <p className="hint" role="alert">{msg}</p>}
      <p className="hint">If you pick a key another tool uses, the two swap. Saved on this device.</p>
    </Dialog>
  )
}
