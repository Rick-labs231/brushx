import { useState } from 'react'
import { scenesOf, sceneSeconds } from '../engine/scenes.ts'
import { addSceneHere, clearScenesAction, duplicateSceneAction, exportSceneAction, gotoScene, moveSceneAction, removeSceneAction, renameSceneAction, useSceneAsRange } from '../state/scenes.ts'
import { useApp } from '../state/app.ts'
import { AudioPanel } from './AudioPanel.tsx'
import { CameraPanel } from './CameraPanel.tsx'

const PARTS = [['scenes', 'Scenes'], ['camera', 'Camera'], ['sound', 'Sound']] as const

export function ScenePanel() {
  const [part, setPart] = useState<(typeof PARTS)[number][0]>('scenes')
  return (
    <div style={{ display: 'grid', gap: '.6rem' }}>
      <div className="seg" role="group" aria-label="Scene tools">
        {PARTS.map(([id, label]) => <button key={id} aria-pressed={part === id} onClick={() => setPart(id)}>{label}</button>)}
      </div>
      {part === 'scenes' && <ScenesList />}
      {part === 'camera' && <CameraPanel />}
      {part === 'sound' && <AudioPanel />}
    </div>
  )
}

function ScenesList() {
  const project = useApp((s) => s.project)
  const frameId = useApp((s) => s.frameId)
  if (!project) return null
  const scenes = scenesOf(project)
  const cur = Math.max(0, project.frames.findIndex((f) => f.id === frameId))
  return (
    <div style={{ display: 'grid', gap: '.5rem' }}>
      <div className="panel-title"><span>Scenes</span><span className="chip" data-testid="scene-count">{scenes.length || 'None'}</span></div>
      <p className="hint">Split a long animation into scenes. A scene runs from the frame where you start it to the next scene. Reorder them, copy them, or export one on its own.</p>
      <button className="btn secondary sm" onClick={addSceneHere}>{scenes.length ? 'Start a scene on this frame' : 'Make this frame a scene start'}</button>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }} aria-label="Scenes">
        {scenes.map((s, i) => {
          const here = cur >= s.start && cur <= s.end
          return (
            <li key={s.id} className="scene-row" data-current={here} style={{ display: 'grid', gap: 4, padding: '.4rem', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', borderColor: here ? 'var(--purple)' : undefined }}>
              <div className="row" style={{ gap: 4 }}>
                <input key={s.name} className="input" aria-label={`Name of scene ${i + 1}`} defaultValue={s.name} maxLength={40} onBlur={(e) => renameSceneAction(s.id, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} style={{ flex: 1, minWidth: 0 }} />
                <button className="icon-btn" aria-label={`Move ${s.name} up`} title="Move earlier" disabled={i === 0} onClick={() => moveSceneAction(s.id, -1)}>↑</button>
                <button className="icon-btn" aria-label={`Move ${s.name} down`} title="Move later" disabled={i === scenes.length - 1} onClick={() => moveSceneAction(s.id, 1)}>↓</button>
              </div>
              <small className="muted">Frames {s.start + 1}–{s.end + 1} · {sceneSeconds(project, s).toFixed(1)} s</small>
              <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
                <button className="btn ghost sm" onClick={() => gotoScene(s.id)}>Go to</button>
                <button className="btn ghost sm" onClick={() => duplicateSceneAction(s.id)}>Duplicate</button>
                <button className="btn ghost sm" onClick={() => useSceneAsRange(s.id)} title="Play and export only this scene">Play only this</button>
                <button className="btn ghost sm" onClick={() => exportSceneAction(s.id)}>Export…</button>
                <button className="btn ghost sm" aria-label={`Remove scene ${s.name}`} onClick={() => removeSceneAction(s.id)} title="Remove the marker; the frames stay">Remove</button>
              </div>
            </li>
          )
        })}
      </ul>
      {scenes.length > 1 && <button className="btn ghost sm" onClick={clearScenesAction}>Remove all scene markers</button>}
    </div>
  )
}
