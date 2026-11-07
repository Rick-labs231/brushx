import { cameraAt, defaultPose, keyOn, cameraKeys, type CameraEase } from '../engine/camera.ts'
import { clearCameraAction, removeCameraKeyAction, selectFrame, setCameraPose } from '../state/actions.ts'
import { useApp } from '../state/app.ts'
import { SliderRow } from '../ui/Controls.tsx'

const EASES: [CameraEase, string][] = [['smooth', 'Smooth'], ['linear', 'Linear'], ['hold', 'Hold']]

export function CameraPanel() {
  const project = useApp((s) => s.project)
  const frameId = useApp((s) => s.frameId)
  if (!project) return null
  const idx = Math.max(0, project.frames.findIndex((f) => f.id === frameId))
  const pose = cameraAt(project, idx)
  const key = keyOn(project, frameId)
  const keys = cameraKeys(project)
  const d = defaultPose(project)
  return (
    <div style={{ display: 'grid', gap: '.5rem' }}>
      <div className="panel-title"><span>Camera</span><span className="chip" data-testid="camera-state">{key ? 'Key on this frame' : keys.length ? 'Between keys' : 'Off'}</span></div>
      <p className="hint">Move or zoom the camera on a frame to set a key. Brush X glides between keys. Press play to see it; exports follow the camera.</p>
      <SliderRow label="Zoom" value={pose.zoom} min={0.25} max={4} step={0.05} onChange={(v) => setCameraPose({ zoom: v })} format={(v) => `${v.toFixed(2)}×`} />
      <SliderRow label="Pan X" value={pose.x - d.x} min={-project.width} max={project.width} step={1} onChange={(v) => setCameraPose({ x: d.x + v })} format={(v) => `${Math.round(v)}px`} />
      <SliderRow label="Pan Y" value={pose.y - d.y} min={-project.height} max={project.height} step={1} onChange={(v) => setCameraPose({ y: d.y + v })} format={(v) => `${Math.round(v)}px`} />
      <SliderRow label="Rotate" value={pose.rot} min={-180} max={180} step={1} onChange={(v) => setCameraPose({ rot: v })} format={(v) => `${Math.round(v)}°`} />
      {key && (
        <div className="field"><span className="label">Move to next key</span>
          <div className="seg" role="group" aria-label="Camera easing">{EASES.map(([id, label]) => <button key={id} aria-pressed={key.ease === id} onClick={() => setCameraPose({}, id)}>{label}</button>)}</div>
        </div>
      )}
      <div className="row">
        <button className="btn secondary sm grow" onClick={() => setCameraPose({})} disabled={!!key}>Set key here</button>
        <button className="btn ghost sm" onClick={removeCameraKeyAction} disabled={!key}>Remove key</button>
      </div>
      {keys.length > 0 && (
        <>
          <div className="field"><span className="label">Keys</span>
            <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>{keys.map((k) => <button key={k.frameId} className="btn ghost sm" aria-pressed={k.frameId === frameId} onClick={() => selectFrame(k.frameId)}>Frame {k.index + 1}</button>)}</div>
          </div>
          <button className="btn ghost sm" onClick={clearCameraAction}>Remove camera</button>
        </>
      )}
    </div>
  )
}
