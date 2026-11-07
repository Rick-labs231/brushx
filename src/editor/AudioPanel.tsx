import { useRef } from 'react'
import { coverSoundAction, importAudioFile, patchAudioAction, removeAudioAction, startSoundHereAction } from '../state/audio.ts'
import { useApp } from '../state/app.ts'
import { SliderRow, Toggle } from '../ui/Controls.tsx'

export function AudioPanel() {
  const audio = useApp((s) => s.project?.audio)
  const file = useRef<HTMLInputElement>(null)
  return (
    <div style={{ display: 'grid', gap: '.5rem' }}>
      <div className="panel-title"><span>Sound</span>{audio && <span className="chip" data-testid="audio-state">{audio.duration.toFixed(1)} s</span>}</div>
      <input ref={file} type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm" hidden data-testid="audio-file" onChange={async (e) => { const f = e.target.files?.[0]; if (f) await importAudioFile(f); e.target.value = '' }} />
      {!audio ? (
        <>
          <p className="hint">Add a voice, beat or song. Its waveform shows under every frame so you can time the animation to it. It plays with the animation and is mixed into MP4 and WebM exports.</p>
          <button className="btn secondary sm" onClick={() => file.current?.click()}>Add sound…</button>
        </>
      ) : (
        <>
          <p className="hint" title={audio.name} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{audio.name}</p>
          <SliderRow label="Volume" value={audio.volume} min={0} max={1} step={0.05} onChange={(v) => patchAudioAction({ volume: v })} format={(v) => `${Math.round(v * 100)}%`} />
          <SliderRow label="Starts at" value={audio.offset} min={-10} max={60} step={0.05} onChange={(v) => patchAudioAction({ offset: v })} format={(v) => `${v.toFixed(2)} s`} />
          <Toggle label="Mute" checked={audio.muted} onChange={(v) => patchAudioAction({ muted: v })} />
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className="btn secondary sm" onClick={startSoundHereAction} title="Start the sound at the selected frame">Start at this frame</button>
            <button className="btn secondary sm" onClick={coverSoundAction} title="Add blank frames until the animation is as long as the sound">Add frames to cover it</button>
          </div>
          <div className="row">
            <button className="btn ghost sm" onClick={() => file.current?.click()}>Replace…</button>
            <button className="btn ghost sm" onClick={removeAudioAction}>Remove</button>
          </div>
          <p className="hint">A negative start skips the first part of the sound. Restore points don’t include the sound.</p>
        </>
      )}
    </div>
  )
}
