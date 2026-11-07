import { patch, setTool } from '../state/actions.ts'
import { useApp } from '../state/app.ts'
import { Icon } from '../ui/Icon.tsx'
import { useSyncExternalStore } from 'react'
import { TOOL_GROUPS, keyOf, onKeysChanged } from './tools.ts'

const keysVersion = (() => { let v = 0; onKeysChanged(() => { v += 1 }); return () => v })()

export function Toolbar() {
  const tool = useApp((s) => s.tool)
  const symmetry = useApp((s) => s.symmetry)
  useSyncExternalStore(onKeysChanged, keysVersion)
  return (
    <aside className="toolbar" aria-label="Tools">
      {TOOL_GROUPS.map((g, i) => (
        <div key={i} style={{ display: 'contents' }}>
          {i > 0 && <div className="gap" />}
          {g.map((t) => (
            <button key={t.id} className={`icon-btn${tool === t.id ? ' active' : ''}`} title={`${t.label} (${keyOf(t)})`} aria-label={t.label} aria-pressed={tool === t.id} onClick={() => setTool(t.id)}>
              <Icon name={t.icon} />
            </button>
          ))}
        </div>
      ))}
      <div className="gap" />
      <button className={`icon-btn${symmetry ? ' active' : ''}`} title="Mirror drawing (X)" aria-label="Symmetry" aria-pressed={symmetry} onClick={() => patch({ symmetry: !symmetry })}>
        <Icon name="symmetry" />
      </button>
    </aside>
  )
}
