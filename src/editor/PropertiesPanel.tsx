import { ERASER_MODES, PAINT_BRUSHES, isPaintTool, isShapeTool, SHAPE_TOOL_IDS, type EraserMode } from '../engine/brushes.ts'
import { copySelection, cutSelection, deleteSelection, pasteClipboard, patch, setColor, setToolSetting, transformSelection } from '../state/actions.ts'
import { PALETTE, useApp } from '../state/app.ts'
import { SliderRow, Toggle } from '../ui/Controls.tsx'
import { Icon } from '../ui/Icon.tsx'
import { ColorWheel } from '../ui/ColorWheel.tsx'
import { useState, useSyncExternalStore } from 'react'
import { applyPreset, deletePreset, loadPresets, onPresets, presetsVersion, savePreset } from '../state/presets.ts'
import { buildPaletteGrid } from '../engine/color.ts'

const GRID = buildPaletteGrid()
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

function PresetsSection() {
  useSyncExternalStore(onPresets, presetsVersion)
  const [name, setName] = useState('')
  const list = loadPresets()
  return (
    <div data-testid="presets">
      <div className="panel-title"><span>My brush presets</span></div>
      <div className="row">
        <input className="input grow" aria-label="Preset name" placeholder="Name this brush" value={name} maxLength={28} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && savePreset(name)) setName('') }} />
        <button className="btn secondary sm" onClick={() => { if (savePreset(name)) setName('') }}>Save</button>
      </div>
      {list.length === 0 && <p className="hint">Set up a brush, name it and save it to reuse it any time.</p>}
      <div style={{ display: 'grid', gap: '.3rem', marginTop: '.4rem' }}>
        {list.map((p) => (
          <div className="row" key={p.id}>
            <button className="btn ghost sm grow" style={{ justifyContent: 'flex-start' }} title={`${p.tool}, ${p.size}px, ${Math.round(p.opacity * 100)}%`} onClick={() => applyPreset(p.id)}>{p.name}<span className="muted" style={{ marginLeft: '.5rem' }}>{p.tool} · {p.size}px</span></button>
            <button className="icon-btn" aria-label={`Delete preset ${p.name}`} onClick={() => deletePreset(p.id)}><Icon name="trash" /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

function ColorSection() {
  const color = useApp((s) => s.color)
  const recent = useApp((s) => s.recentColors)
  const Sw = ({ c, label }: { c: string; label: string }) => (
    <button className="swatch" style={{ background: c }} aria-label={`${label} ${c}`} title={c} aria-pressed={same(color, c)} onClick={() => setColor(c)} />
  )
  return (
    <div>
      <div className="panel-title"><span>Color</span></div>
      <ColorWheel value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#168CFF'} onChange={setColor} />
      <div className="color-row">
        <span className="cur" style={{ background: color }} aria-hidden />
        <input className="input" aria-label="Hex color" value={color} maxLength={7} onChange={(e) => { const v = e.target.value; if (/^#?[0-9a-f]{0,6}$/i.test(v)) setColor(v.startsWith('#') ? v.toUpperCase() : `#${v.toUpperCase()}`) }} />
      </div>
      <div className="label" style={{ margin: '.7rem 0 .3rem' }}>Brand</div>
      <div className="swatches">{PALETTE.map((c) => <Sw key={c} c={c} label="Brand color" />)}</div>
      {recent.length > 0 && (
        <>
          <div className="label" style={{ margin: '.6rem 0 .3rem' }}>Recent</div>
          <div className="swatches">{recent.map((c) => <Sw key={c} c={c} label="Recent color" />)}</div>
        </>
      )}
      <div className="label" style={{ margin: '.6rem 0 .3rem' }}>Palette</div>
      <div className="swatches grid" data-testid="palette-grid">{GRID.map((c, i) => <Sw key={`${c}-${i}`} c={c} label="Palette color" />)}</div>
    </div>
  )
}

export function PropertiesPanel() {
  const tool = useApp((s) => s.tool)
  const settings = useApp((s) => s.toolSettings[s.tool])
  const stabilizer = useApp((s) => s.stabilizer)
  const symmetry = useApp((s) => s.symmetry)
  const shapeFill = useApp((s) => s.shapeFill)
  const tolerance = useApp((s) => s.fillTolerance)
  const hasSel = useApp((s) => s.selection !== null)
  const hasClip = useApp((s) => s.clipboard !== null)
  const pct = (v: number) => `${Math.round(v * 100)}%`

  if (tool === 'hand') {
    return <p className="muted">Drag to move the canvas. Scroll to zoom, Shift+scroll to rotate, double-click to fit the view.</p>
  }
  if (tool === 'select' || tool === 'lasso') {
    return (
      <div>
        <div className="panel-title"><span>{tool === 'select' ? 'Select' : 'Lasso'}</span></div>
        <p className="hint" style={{ marginBottom: '.6rem' }}>{tool === 'select' ? 'Click a stroke or drag a box around strokes, then drag to move them.' : 'Draw a loop around the strokes to pick them up.'} Copy, switch frames, then paste to reuse a drawing.</p>
        <div className="layer-actions">
          <button className="btn ghost sm" aria-label="Copy" title="Copy (Ctrl+C)" disabled={!hasSel} onClick={copySelection}>Copy</button>
          <button className="btn ghost sm" aria-label="Cut" title="Cut (Ctrl+X)" disabled={!hasSel} onClick={cutSelection}>Cut</button>
          <button className="btn ghost sm" aria-label="Paste" title="Paste onto this frame (Ctrl+V)" disabled={!hasClip} onClick={pasteClipboard}>Paste</button>
        </div>
        <div className="layer-actions" style={{ marginTop: '.4rem' }}>
          <button className="icon-btn" aria-label="Rotate left 15°" title="Rotate left 15°" disabled={!hasSel} onClick={() => transformSelection({ rotate: -Math.PI / 12 })}><Icon name="rotateCcw" /></button>
          <button className="icon-btn" aria-label="Rotate right 15°" title="Rotate right 15°" disabled={!hasSel} onClick={() => transformSelection({ rotate: Math.PI / 12 })}><Icon name="rotateCw" /></button>
          <button className="icon-btn" aria-label="Scale down" title="Scale down" disabled={!hasSel} onClick={() => transformSelection({ scale: 0.9 })}><Icon name="minus" /></button>
          <button className="icon-btn" aria-label="Scale up" title="Scale up" disabled={!hasSel} onClick={() => transformSelection({ scale: 1.1 })}><Icon name="plus" /></button>
          <button className="icon-btn" aria-label="Flip horizontally" title="Flip horizontally" disabled={!hasSel} onClick={() => transformSelection({ flipX: true })}><Icon name="flipH" /></button>
          <button className="icon-btn" aria-label="Flip vertically" title="Flip vertically" disabled={!hasSel} onClick={() => transformSelection({ flipY: true })}><Icon name="flipV" /></button>
          <button className="icon-btn" aria-label="Delete selection" title="Delete selection" disabled={!hasSel} onClick={deleteSelection}><Icon name="trash" /></button>
        </div>
      </div>
    )
  }
  if (tool === 'text') return (<><p className="muted">Click the canvas where the text should start. The text becomes a movable picture: use the Select tool to move it.</p><ColorSection /></>)
  if (tool === 'crop') return <p className="muted">Drag a box over the part of the canvas to keep, then confirm. Nothing is deleted: making the canvas bigger again brings the rest back.</p>
  if (tool === 'bezier') {
    return (<><div>
      <div className="panel-title"><span>Curve pen</span></div>
      <p className="hint">Click to place a point. Click and drag to pull a curve handle. Click the first point to close the shape, or press Enter / double-click to finish. Esc cancels. It uses the Polygon size and opacity.</p>
    </div><ColorSection /></>)
  }
  if (tool === 'eyedropper') {
    return (<><p className="muted">Click the canvas to pick a color from the visible artwork.</p><ColorSection /></>)
  }

  const brush = isPaintTool(tool) ? PAINT_BRUSHES[tool] : null
  const set = (p: Partial<{ size: number; opacity: number; hardness: number }>) => setToolSetting(tool, p)
  const eraserMode = (Object.keys(ERASER_MODES) as EraserMode[]).find((m) => Math.abs(ERASER_MODES[m] - settings.hardness) < 0.01)
  return (
    <>
      <div>
        <div className="panel-title"><span>{brush?.label ?? (tool === 'fill' ? 'Fill bucket' : tool[0].toUpperCase() + tool.slice(1))}</span></div>
        {brush && <p className="hint" style={{ marginBottom: '.6rem' }}>{brush.hint}</p>}
        <div style={{ display: 'grid', gap: '.5rem' }}>
          {tool !== 'fill' && <SliderRow label="Size" value={settings.size} min={brush?.minSize ?? 1} max={brush?.maxSize ?? 80} onChange={(v) => set({ size: v })} format={(v) => `${v}px`} />}
          <SliderRow label="Opacity" value={settings.opacity} min={0.05} max={1} step={0.05} onChange={(v) => set({ opacity: v })} format={pct} />
          {brush?.editableHardness && tool !== 'eraser' && <SliderRow label="Hardness" value={settings.hardness} min={0} max={1} step={0.05} onChange={(v) => set({ hardness: v })} format={pct} />}
          {brush && <SliderRow label="Stabilizer" value={stabilizer} min={0} max={0.9} step={0.05} onChange={(v) => patch({ stabilizer: v })} format={pct} />}
          {tool === 'fill' && <SliderRow label="Tolerance" value={tolerance} min={0} max={128} onChange={(v) => patch({ fillTolerance: v })} />}
        </div>
        {tool === 'eraser' && (
          <div className="seg" style={{ marginTop: '.6rem' }} role="group" aria-label="Eraser type">
            {(Object.keys(ERASER_MODES) as EraserMode[]).map((m) => (
              <button key={m} aria-pressed={eraserMode === m} onClick={() => set({ hardness: ERASER_MODES[m] })}>{m[0].toUpperCase() + m.slice(1)}</button>
            ))}
          </div>
        )}
        {isShapeTool(tool) && tool !== 'line' && (
          <div className="seg" style={{ marginTop: '.6rem' }} role="group" aria-label="Shape style">
            {([['none', 'Outline'], ['fill', 'Filled'], ['both', 'Both']] as const).map(([v, l]) => <button key={v} aria-pressed={shapeFill === v} onClick={() => patch({ shapeFill: v })}>{l}</button>)}
          </div>
        )}
        {tool === 'polygon' && <p className="hint" style={{ marginTop: '.5rem' }}>Click to place points. Press Enter or double-click to finish, Esc to cancel.</p>}
        {SHAPE_TOOL_IDS.includes(tool as never) && tool !== 'polygon' && <p className="hint" style={{ marginTop: '.5rem' }}>Hold Shift for a perfect square, circle or 45° line.</p>}
      </div>
      {tool !== 'fill' && tool !== 'eraser' && <Toggle label="Mirror drawing" hint="Draw on one side, get both" checked={symmetry} onChange={(v) => patch({ symmetry: v })} />}
      {(isPaintTool(tool) || isShapeTool(tool)) && <PresetsSection />}
      <ColorSection />
    </>
  )
}
