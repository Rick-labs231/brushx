import { useState } from 'react'
import { clearUnsavedFlag, readUnsavedFlag } from '../state/persist.ts'
import { navigate } from '../state/router.ts'
import { useApp } from '../state/app.ts'
import { Icon } from '../ui/Icon.tsx'

/** Shown after Brush X was closed with unsaved changes. */
export function RecoveryBanner() {
  const [flag, setFlag] = useState(() => readUnsavedFlag())
  const exists = useApp((s) => (flag ? s.library.some((m) => m.id === flag.id) : false))
  if (!flag || !exists) return null
  const dismiss = () => { clearUnsavedFlag(); setFlag(null) }
  return (
    <div className="banner" role="status" data-testid="recovery-banner" style={{ margin: '1rem 0', display: 'flex', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <Icon name="alert" size={18} />
      <span style={{ flex: 1 }}>Brush X was closed before “{flag.name}” finished saving, so the last few strokes may be missing. Earlier versions are kept in Version history.</span>
      <button className="btn sm primary" onClick={() => { const id = flag.id; setFlag(null); navigate({ name: 'editor', id }) }}>Open it</button>
      <button className="btn sm ghost" onClick={dismiss}>Dismiss</button>
    </div>
  )
}
