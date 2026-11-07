import { useState } from 'react'
import { useApp } from '../state/app.ts'
import { GuidesPanel } from './GuidesPanel.tsx'
import { LayersPanel } from './LayersPanel.tsx'
import { ScenePanel } from './ScenePanel.tsx'
import { PropertiesPanel } from './PropertiesPanel.tsx'

const TABS = [['layers', 'Layers'], ['brush', 'Properties'], ['guides', 'Guides'], ['scene', 'Scene']] as const

export function SidePanel() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('layers')
  const open = useApp((s) => s.drawerOpen)
  return (
    <aside className="side" data-open={open} aria-label="Layers and properties">
      <div className="tabs" role="tablist">
        {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      <div className="side-body">
        {tab === 'layers' && <LayersPanel />}
        {tab === 'brush' && <PropertiesPanel />}
        {tab === 'guides' && <GuidesPanel />}
        {tab === 'scene' && <ScenePanel />}
      </div>
    </aside>
  )
}
