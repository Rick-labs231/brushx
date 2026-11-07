import { PERSPECTIVE_MODES, templateById } from '../engine/guides.ts'
import { TemplateBrowser } from './TemplateBrowser.tsx'
import { chooseTemplate, copyGuideAction, pasteGuideAction, patchGuide, patchPerspective, stampGuideAction } from '../state/actions.ts'
import { useApp } from '../state/app.ts'
import { SliderRow, Toggle } from '../ui/Controls.tsx'

export function GuidesPanel() {
  const guide = useApp((s) => s.guide)
  const persp = useApp((s) => s.perspective)
  const clip = useApp((s) => s.guideClip)
  const dimW = useApp((s) => s.project?.width ?? 1280)
  const dimH = useApp((s) => s.project?.height ?? 720)
  const dims = { w: dimW, h: dimH }
  const tpl = templateById(guide.template)
  const vp = persp.mode !== 'isometric' && persp.mode !== 'fisheye' && persp.mode !== 'curvilinear'
  return (
    <>
      <TemplateBrowser />
      {guide.template && (
        <div style={{ display: 'grid', gap: '.5rem' }}>
          <div className="panel-title"><span>Adjust guide</span></div>
          <Toggle label="Show guide" checked={guide.visible} onChange={(v) => patchGuide({ visible: v })} />
          <Toggle label="Lock position" checked={guide.locked} onChange={(v) => patchGuide({ locked: v })} />
          <SliderRow label="Opacity" value={guide.opacity} min={0.1} max={1} step={0.05} onChange={(v) => patchGuide({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
          <SliderRow label="Lines" value={guide.thickness} min={0.5} max={5} step={0.5} onChange={(v) => patchGuide({ thickness: v })} />
          <SliderRow label="Scale" value={guide.scale} min={0.3} max={2.5} step={0.05} onChange={(v) => patchGuide({ scale: v })} format={(v) => `${Math.round(v * 100)}%`} />
          <SliderRow label="Rotate" value={guide.rotation} min={-180} max={180} onChange={(v) => patchGuide({ rotation: v })} format={(v) => `${v}°`} />
          <SliderRow label="Width" value={guide.stretchX} min={0.5} max={1.8} step={0.05} onChange={(v) => patchGuide({ stretchX: v })} format={(v) => `${Math.round(v * 100)}%`} />
          {tpl?.build && <SliderRow label="Turn" value={guide.yaw} min={-90} max={90} onChange={(v) => patchGuide({ yaw: v })} format={(v) => `${v}°`} />}
          {tpl?.build && <SliderRow label="Tilt up/down" value={guide.pitch} min={-45} max={45} onChange={(v) => patchGuide({ pitch: v })} format={(v) => `${v}°`} />}
          <SliderRow label="Move X" value={guide.x} min={-dims.w / 2} max={dims.w / 2} step={1} onChange={(v) => patchGuide({ x: v })} format={(v) => `${Math.round(v)}px`} />
          <SliderRow label="Move Y" value={guide.y} min={-dims.h / 2} max={dims.h / 2} step={1} onChange={(v) => patchGuide({ y: v })} format={(v) => `${Math.round(v)}px`} />
          <Toggle label="Flip horizontally" checked={guide.flipX} onChange={(v) => patchGuide({ flipX: v })} />
          <div className="row">
            <button className="btn primary sm grow" onClick={pasteGuideAction} title="Paste this guide into the frame as real lines you can keep as a drawing">Paste guide</button>
            <button className="btn secondary sm" onClick={copyGuideAction} title="Remember this guide so you can paste it later">Copy guide</button>
            <button className="btn ghost sm" onClick={() => chooseTemplate(null)}>Remove</button>
          </div>
          <button className="btn ghost sm" onClick={stampGuideAction} title="Put the lines on a guide layer: visible while drawing, never exported">Paste as guide layer (not exported)</button>
          <p className="hint">The guide itself never appears in exports. Paste guide turns it into real lines that do, so you can use it as a drawing.</p>
        </div>
      )}
      {!guide.template && clip && (
        <div className="row"><button className="btn secondary sm grow" onClick={pasteGuideAction}>Paste copied guide</button></div>
      )}
      <div style={{ display: 'grid', gap: '.5rem' }}>
        <div className="panel-title"><span>Perspective grid</span></div>
        <Toggle label="Show perspective grid" checked={persp.enabled} onChange={(v) => patchPerspective({ enabled: v })} />
        {persp.enabled && (
          <>
            <div className="tab-chips" role="group" aria-label="Perspective type">
              {PERSPECTIVE_MODES.map((m) => <button key={m.id} title={m.hint} aria-pressed={persp.mode === m.id} onClick={() => patchPerspective({ mode: m.id })}>{m.label}</button>)}
            </div>
            <p className="hint">{PERSPECTIVE_MODES.find((m) => m.id === persp.mode)?.hint}</p>
            <SliderRow label="Horizon" value={persp.horizon} min={0.05} max={0.95} step={0.01} onChange={(v) => patchPerspective({ horizon: v })} format={(v) => `${Math.round(v * 100)}%`} />
            {vp && <SliderRow label="Vanishing pts" value={persp.spread} min={0.3} max={2} step={0.05} onChange={(v) => patchPerspective({ spread: v })} format={(v) => `${Math.round(v * 100)}%`} />}
            <SliderRow label="Density" value={persp.density} min={4} max={32} onChange={(v) => patchPerspective({ density: v })} />
            <SliderRow label="Opacity" value={persp.opacity} min={0.1} max={1} step={0.05} onChange={(v) => patchPerspective({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
            {persp.mode !== 'fisheye' && <Toggle label="Snap lines to grid" hint="The Line tool locks onto the grid’s directions" checked={persp.snap} onChange={(v) => patchPerspective({ snap: v })} />}
          </>
        )}
      </div>
    </>
  )
}
