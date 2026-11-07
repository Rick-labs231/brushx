import { useState } from 'react'
import { cropAction, openDialog } from '../state/actions.ts'
import { useApp } from '../state/app.ts'
import { FONTS, placeText, textPrefs, type TextOptions } from '../state/text.ts'
import { Dialog } from '../ui/Controls.tsx'

export function TextDialog() {
  const [text, setText] = useState('')
  const [o, setO] = useState<TextOptions>({ ...textPrefs })
  const color = useApp((s) => s.color)
  const set = (p: Partial<TextOptions>) => { Object.assign(textPrefs, p); setO({ ...textPrefs }) }
  const go = () => { if (placeText(text, o)) openDialog(null) }
  return (
    <Dialog title="Add text" onClose={() => openDialog(null)} footer={<><button className="btn ghost" onClick={() => openDialog(null)}>Cancel</button><button className="btn primary" onClick={go}>Add text</button></>}>
      <div className="field"><label htmlFor="tx-text">Text</label><textarea id="tx-text" className="input" rows={3} autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) go() }} style={{ fontFamily: 'inherit' }} /></div>
      <div className="field"><label htmlFor="tx-font">Font</label>
        <select id="tx-font" className="input" value={o.font} onChange={(e) => set({ font: e.target.value })}>{FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
      </div>
      <div className="field"><label htmlFor="tx-size">Size ({o.size}px)</label><input id="tx-size" type="range" min={12} max={400} value={o.size} onChange={(e) => set({ size: Number(e.target.value) })} /></div>
      <div className="row">
        <label className="row"><input type="checkbox" checked={o.bold} onChange={(e) => set({ bold: e.target.checked })} />Bold</label>
        <label className="row"><input type="checkbox" checked={o.italic} onChange={(e) => set({ italic: e.target.checked })} />Italic</label>
        <div className="seg" role="group" aria-label="Alignment">{(['left', 'center', 'right'] as const).map((a) => <button key={a} aria-pressed={o.align === a} onClick={() => set({ align: a })}>{a}</button>)}</div>
      </div>
      <p className="hint">Uses the current color (<span style={{ color }}>■</span>). Ctrl+Enter to add.</p>
    </Dialog>
  )
}

export function CropDialog() {
  const crop = useApp((s) => s.crop)
  const pw = useApp((s) => s.project?.width ?? 0)
  const ph = useApp((s) => s.project?.height ?? 0)
  const [r, setR] = useState(() => ({ x: Math.round(crop?.x ?? 0), y: Math.round(crop?.y ?? 0), w: Math.round(crop?.w ?? pw), h: Math.round(crop?.h ?? ph) }))
  const num = (k: 'x' | 'y' | 'w' | 'h', label: string) => (
    <div className="field"><label htmlFor={`cr-${k}`}>{label}</label><input id={`cr-${k}`} className="input" type="number" value={r[k]} onChange={(e) => setR({ ...r, [k]: Math.round(Number(e.target.value) || 0) })} /></div>
  )
  const apply = () => { if (cropAction(r)) openDialog(null) }
  return (
    <Dialog title="Crop canvas" onClose={() => openDialog(null)} footer={<><button className="btn ghost" onClick={() => openDialog(null)}>Cancel</button><button className="btn primary" onClick={apply}>Crop</button></>}>
      <p className="hint">Keeps the part inside the box and makes the canvas that size ({pw} × {ph} now). Nothing is deleted: drawing outside the new frame returns if you make the canvas bigger.</p>
      <div className="row">{num('x', 'Left')}{num('y', 'Top')}</div>
      <div className="row">{num('w', 'Width')}{num('h', 'Height')}</div>
    </Dialog>
  )
}
