import { patch } from '../state/actions.ts'
import { useApp } from '../state/app.ts'
import { CanvasStage } from '../ui/CanvasStage.tsx'
import { Icon } from '../ui/Icon.tsx'
import { SidePanel } from './SidePanel.tsx'
import { Timeline } from './Timeline.tsx'
import { Toolbar } from './Toolbar.tsx'
import { TopBar } from './TopBar.tsx'
import { fitView, rotateBy, zoomBy } from './viewControls.ts'

function StageControls() {
  const zoom = useApp((s) => s.viewport.zoom)
  const rot = useApp((s) => s.viewport.rot)
  return (
    <div className="stage-ctl" role="group" aria-label="View">
      <button className="icon-btn sm" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.25)}><Icon name="minus" size={16} /></button>
      <span className="z" data-testid="zoom-readout">{Math.round(zoom * 100)}%</span>
      <button className="icon-btn sm" aria-label="Zoom in" onClick={() => zoomBy(1.25)}><Icon name="plus" size={16} /></button>
      <button className="icon-btn sm" aria-label="Rotate canvas left" onClick={() => rotateBy(-Math.PI / 12)}><Icon name="rotateCcw" size={16} /></button>
      <button className="icon-btn sm" aria-label="Rotate canvas right" onClick={() => rotateBy(Math.PI / 12)}><Icon name="rotateCw" size={16} /></button>
      <button className={`icon-btn sm${rot === 0 ? '' : ' active'}`} aria-label="Fit canvas to view" title="Fit (F)" onClick={fitView}><Icon name="fit" size={16} /></button>
    </div>
  )
}

export function Editor() {
  const hand = useApp((s) => (s.prefs.leftHanded ? 'left' : 'right'))
  const focus = useApp((s) => s.focusMode)
  const drawer = useApp((s) => s.drawerOpen)
  return (
    <div className="editor" data-hand={hand} data-focus={focus} data-testid="editor">
      <TopBar />
      <Toolbar />
      <div className="stage-area">
        <CanvasStage />
        <StageControls />
        {focus && <button className="btn sm secondary exit-focus" onClick={() => patch({ focusMode: false })}>Show interface</button>}
        {drawer && <button aria-label="Close panel" className="scrim" style={{ background: 'rgba(0,0,0,.35)', border: 0, zIndex: 35 }} onClick={() => patch({ drawerOpen: false })} />}
      </div>
      <SidePanel />
      <Timeline />
    </div>
  )
}
