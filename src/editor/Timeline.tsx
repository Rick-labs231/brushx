import { keyOn } from '../engine/camera.ts'
import { Fragment, useEffect, useState } from 'react'
import { scenesOf } from '../engine/scenes.ts'
import { hasCustomRange, holdOf, isKeyframe, MAX_HOLD, rangeOf, totalTicks, playSequence } from '../engine/projectOps.ts'
import {
  addFrameAction, clearRangeAction, deleteFrameAction, duplicateFrameAction, moveFrameAction, patch, selectFrame, setFpsAction, setHoldAction, setPlaying, setRangeEdgeAction, stepFrame,
} from '../state/actions.ts'
import { store, useApp } from '../state/app.ts'
import { Icon } from '../ui/Icon.tsx'
import { frameThumb } from './thumbs.ts'
import { frameSpan, peaksForSpan } from '../engine/audio.ts'
import { startAudio, stopAudio } from '../state/audio.ts'

function FrameWave({ index }: { index: number }) {
  const project = useApp((s) => s.project)
  const a = project?.audio
  if (!project || !a) return null
  const [t0, t1] = frameSpan(project, index)
  const bars = peaksForSpan(a, t0, t1, Math.min(24, Math.max(6, Math.round((t1 - t0) * 40))))
  const w = 100 / bars.length
  return (
    <svg className={`wave${a.muted ? ' muted' : ''}`} viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">
      {bars.map((v, i) => <rect key={i} x={i * w} width={Math.max(0.6, w - 0.8)} y={10 - Math.max(0.5, v * 10)} height={Math.max(1, v * 20)} />)}
    </svg>
  )
}

const FPS = [6, 8, 12, 15, 24, 30]

/** Plays the work range, showing each frame for its hold. */
function usePlayback() {
  const playing = useApp((s) => s.playing)
  const fps = useApp((s) => s.project?.fps ?? 12)
  useEffect(() => {
    if (!playing) return undefined
    const start = store.getState()
    if (start.project) {
      const r = rangeOf(start.project)
      const i = start.project.frames.findIndex((f) => f.id === start.frameId)
      if (i < r.start || i > r.end) selectFrame(start.project.frames[r.start].id)
    }
    if (start.project) void startAudio(start.project, Math.max(0, start.project.frames.findIndex((f) => f.id === store.getState().frameId)))
    let raf = 0
    let last = performance.now()
    let acc = 0
    let shown = 0
    let shownId = store.getState().frameId
    const tick = (t: number) => {
      acc += t - last
      last = t
      const step = 1000 / fps
      while (acc >= step) {
        acc -= step
        const s = store.getState()
        if (!s.project || !s.playing) return
        const frames = s.project.frames
        const idx = frames.findIndex((f) => f.id === s.frameId)
        if (idx < 0) return
        if (s.frameId !== shownId) { shownId = s.frameId; shown = 0; void startAudio(s.project, idx) } // user jumped
        shown += 1
        if (shown < holdOf(frames[idx])) continue
        const r = rangeOf(s.project)
        let next = idx + 1
        if (idx < r.start || idx > r.end) next = r.start
        else if (next > r.end) {
          if (!s.loop) { setPlaying(false); return }
          next = r.start
        }
        shown = 0
        shownId = frames[next].id
        if (next <= idx) void startAudio(s.project, next) // looped around
        selectFrame(shownId)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); stopAudio() }
  }, [playing, fps])
}

export function Timeline() {
  usePlayback()
  const project = useApp((s) => s.project)
  const frameId = useApp((s) => s.frameId)
  const playing = useApp((s) => s.playing)
  const loop = useApp((s) => s.loop)
  const onion = useApp((s) => s.onion)
  const [collapsed, setCollapsed] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [drag, setDrag] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  if (!project) return null
  const idx = project.frames.findIndex((f) => f.id === frameId)
  const range = rangeOf(project)
  const sceneStarts = new Map(scenesOf(project).map((s) => [s.start, s.name]))
  const custom = hasCustomRange(project)
  const seq = playSequence(project, true)
  const dur = (totalTicks(seq) / project.fps).toFixed(1)
  const cur = project.frames[idx]
  const curHold = cur ? holdOf(cur) : 1
  return (
    <section className="timeline" aria-label="Timeline" data-collapsed={collapsed} style={{ gridArea: 'time' }}>
      <div className="tl-ctl">
        <button className="icon-btn" aria-label="Previous frame" title="Previous frame ( , )" onClick={() => stepFrame(-1)}><Icon name="skipBack" /></button>
        <button className={`icon-btn${playing ? ' active' : ''}`} aria-label={playing ? 'Pause' : 'Play'} title="Play / pause (Enter)" onClick={() => setPlaying(!playing)}><Icon name={playing ? 'pause' : 'play'} /></button>
        <button className="icon-btn" aria-label="Next frame" title="Next frame ( . )" onClick={() => stepFrame(1)}><Icon name="skipFwd" /></button>
        <button className={`icon-btn${loop ? ' active' : ''}`} aria-label="Loop playback" aria-pressed={loop} title="Loop" onClick={() => patch({ loop: !loop })}><Icon name="loop" /></button>
        <span className="sep" />
        <button className="icon-btn" aria-label="Add frame" title="Add blank frame" onClick={addFrameAction}><Icon name="plus" /></button>
        <button className="icon-btn" aria-label="Duplicate frame" title="Duplicate frame" onClick={duplicateFrameAction}><Icon name="duplicate" /></button>
        <button className="icon-btn" aria-label="Delete frame" title="Delete frame" disabled={project.frames.length <= 1} onClick={deleteFrameAction}><Icon name="trash" /></button>
        <span className="sep" />
        <span className="row" role="group" aria-label="Exposure" title="How many ticks this frame is held" style={{ gap: '.15rem' }}>
          <button className="icon-btn" aria-label="Shorter hold" disabled={curHold <= 1} onClick={() => setHoldAction(curHold - 1)}>−</button>
          <span className="chip" data-testid="hold-value" aria-label="Hold">Hold ×{curHold}</span>
          <button className="icon-btn" aria-label="Longer hold" disabled={curHold >= MAX_HOLD} onClick={() => setHoldAction(curHold + 1)}>+</button>
        </span>
        <span className="sep" />
        <span className="row" role="group" aria-label="Work range" style={{ gap: '.15rem' }}>
          <button className="btn ghost sm" aria-label="Set range start to this frame" title="Range in" onClick={() => setRangeEdgeAction('start')}>In</button>
          <button className="btn ghost sm" aria-label="Set range end to this frame" title="Range out" onClick={() => setRangeEdgeAction('end')}>Out</button>
          {custom && <button className="btn ghost sm" aria-label="Clear range" title="Clear range" onClick={clearRangeAction}>Clear</button>}
        </span>
        <span className="sep" />
        <button className={`icon-btn${onion.enabled ? ' active' : ''}`} aria-label="Onion skin" aria-pressed={onion.enabled} title="Onion skin" onClick={() => patch({ onion: { ...onion, enabled: !onion.enabled } })}><Icon name="onion" /></button>
        {onion.enabled && (
          <span className="row hide-sm" style={{ gap: '.25rem' }}>
            <select className="select" aria-label="Frames before" value={onion.prev} onChange={(e) => patch({ onion: { ...onion, prev: Number(e.target.value) } })}>{[0, 1, 2, 3].map((n) => <option key={n} value={n}>−{n}</option>)}</select>
            <select className="select" aria-label="Frames after" value={onion.next} onChange={(e) => patch({ onion: { ...onion, next: Number(e.target.value) } })}>{[0, 1, 2, 3].map((n) => <option key={n} value={n}>+{n}</option>)}</select>
            <input type="color" className="swatch-input" aria-label="Previous frames colour" title="Previous frames colour" value={onion.prevColor} onChange={(e) => patch({ onion: { ...onion, prevColor: e.target.value } })} />
            <input type="color" className="swatch-input" aria-label="Next frames colour" title="Next frames colour" value={onion.nextColor} onChange={(e) => patch({ onion: { ...onion, nextColor: e.target.value } })} />
            <input type="range" aria-label="Onion opacity" title="Onion opacity" min={0.1} max={0.8} step={0.05} value={onion.opacity} onChange={(e) => patch({ onion: { ...onion, opacity: Number(e.target.value) } })} style={{ width: '4.5rem' }} />
          </span>
        )}
        <span className="grow" />
        <label className="row faint" style={{ fontSize: '.75rem' }}>FPS
          <select className="select" aria-label="Frames per second" value={FPS.includes(project.fps) ? project.fps : ''} onChange={(e) => setFpsAction(Number(e.target.value))}>
            {!FPS.includes(project.fps) && <option value="">{project.fps}</option>}
            {FPS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="row faint hide-sm" style={{ fontSize: '.75rem' }}>Zoom
          <input type="range" aria-label="Timeline zoom" min={0.6} max={1.6} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} style={{ width: '4.5rem' }} />
        </label>
        <span className="chip" data-testid="frame-counter">{idx + 1} / {project.frames.length} · {dur}s{custom ? ` · range ${range.start + 1}–${range.end + 1}` : ''}</span>
        <button className="icon-btn" aria-label={collapsed ? 'Show frames' : 'Hide frames'} aria-expanded={!collapsed} onClick={() => setCollapsed((v) => !v)}><Icon name={collapsed ? 'chevronUp' : 'chevronDown'} /></button>
      </div>
      {!collapsed && (
        <div className="strip" role="listbox" aria-label="Frames" style={{ ['--thumb' as string]: `${5.4 * zoom}rem` }}>
          {project.frames.map((f, i) => (
            <Fragment key={f.id}>
            {sceneStarts.has(i) && <span className="scene-tag" title={sceneStarts.get(i)}>{sceneStarts.get(i)}</span>}
            <button
              role="option"
              aria-selected={f.id === frameId}
              aria-current={f.id === frameId}
              className={`frame${over === i && drag !== i ? ' over' : ''}${custom && (i < range.start || i > range.end) ? ' outside' : ''}${custom && i === range.start ? ' r-in' : ''}${custom && i === range.end ? ' r-out' : ''}`}
              data-hold={holdOf(f)}
              data-key={isKeyframe(f, project.layers)}
              style={{ ['--hold' as string]: Math.min(holdOf(f), 8) }}
              draggable
              onClick={() => selectFrame(f.id)}
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => { e.preventDefault(); setOver(i) }}
              onDragEnd={() => { setDrag(null); setOver(null) }}
              onDrop={() => { if (drag !== null && drag !== i) moveFrameAction(drag, i); setDrag(null); setOver(null) }}
            >
              <img src={frameThumb(project, f)} alt="" draggable={false} />
              <FrameWave index={i} />
              <span className="frame-meta">
                <i className="key-dot" aria-label={isKeyframe(f, project.layers) ? 'Keyframe' : 'Empty'} />
                {i + 1}
                {keyOn(project, f.id) && <b className="cam-badge" aria-label="Camera key" title="Camera key">◆</b>}
                {holdOf(f) > 1 && <b className="hold-badge">×{holdOf(f)}</b>}
              </span>
            </button>
            </Fragment>
          ))}
        </div>
      )}
    </section>
  )
}
