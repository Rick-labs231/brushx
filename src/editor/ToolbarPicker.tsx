import { Dialog } from '../ui/Controls.tsx'
import { Icon } from '../ui/Icon.tsx'
import { TOOL_GROUPS, keyOf } from './tools.ts'
import { DEFAULT_TOOLBAR, SYMMETRY_ID } from './toolbarModel.ts'
import { resetToolbar, showAllTools, toggleToolbarTool, useToolbarIds } from './toolbarStore.ts'

const GROUP_TITLES = ['Select and move', 'Draw and erase', 'Colour', 'Shapes', 'Text and canvas']

const HELP: Record<string, string> = {
  select: 'Drag a box around drawings to move them.',
  lasso: 'Draw a loop around the parts you want to move.',
  hand: 'Move the canvas around.',
  pencil: 'A plain, crisp line. The best place to start.',
  ink: 'Smooth, bold lines for clean outlines.',
  brush: 'A soft, painterly stroke.',
  airbrush: 'Soft spray for shading.',
  marker: 'Flat, bold colour.',
  chalk: 'A rough, grainy texture.',
  crayon: 'A waxy, hand-coloured look.',
  eraser: 'Rub out mistakes.',
  fill: 'Pour colour into a closed shape.',
  eyedropper: 'Pick up a colour from your drawing.',
  line: 'Perfectly straight lines.',
  rect: 'Rectangles and squares.',
  ellipse: 'Circles and ovals.',
  polygon: 'Shapes with straight sides.',
  bezier: 'Smooth curves you can bend.',
  text: 'Put words on your canvas.',
  crop: 'Trim the canvas to the part you want.',
}

/** The full tool list: tick a tool to put it on the toolbar, untick to take it off. */
export function ToolbarPicker({ onClose }: { onClose: () => void }) {
  const on = useToolbarIds()
  const row = (id: string, icon: Parameters<typeof Icon>[0]['name'], label: string, help: string, key?: string) => (
    <label key={id} className="tool-row">
      <span className="tool-ico" aria-hidden="true"><Icon name={icon} /></span>
      <span className="tool-txt"><strong>{label}{key ? <small> {key}</small> : null}</strong><span>{help}</span></span>
      <input type="checkbox" aria-label={`${label} on the toolbar`} checked={on.includes(id)} onChange={() => toggleToolbarTool(id)} />
    </label>
  )
  return (
    <Dialog title="Customize toolbar" onClose={onClose} footer={<><button className="btn ghost" onClick={resetToolbar} disabled={on.length === DEFAULT_TOOLBAR.length && DEFAULT_TOOLBAR.every((d) => on.includes(d))}>Back to popular tools</button><button className="btn secondary" onClick={showAllTools}>Show every tool</button><button className="btn primary" onClick={onClose}>Done</button></>}>
      <p className="muted" style={{ margin: 0 }}>Tick the tools you want on the toolbar. Fewer tools means more room to draw. Tools you take off still work with their shortcut keys.</p>
      <div className="tool-list">
        {TOOL_GROUPS.map((g, i) => (
          <section key={i}>
            <h3>{GROUP_TITLES[i] ?? 'Tools'}</h3>
            {g.map((t) => row(t.id, t.icon, t.label, HELP[t.id] ?? '', keyOf(t)))}
          </section>
        ))}
        <section>
          <h3>Helpers</h3>
          {row(SYMMETRY_ID, 'symmetry', 'Mirror drawing', 'Everything you draw is mirrored. Great for faces and wings.', 'X')}
        </section>
      </div>
    </Dialog>
  )
}
