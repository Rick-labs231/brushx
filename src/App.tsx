import { startCloud } from './state/cloud.ts'
import { ProjectDialog, VersionsDialog } from './editor/ProjectDialogs.tsx'
import { useEffect, useState } from 'react'
import './brand/tokens.css'
import './brand/app.css'
import { TourHost } from './tour/Tour.tsx'
import { CropDialog, TextDialog } from './editor/ToolDialogs.tsx'
import { ExportDialog, NewProjectDialog, ShortcutsDialog } from './editor/Dialogs.tsx'
import { Editor } from './editor/Editor.tsx'
import { Home } from './screens/Home.tsx'
import { Placeholder } from './screens/Placeholder.tsx'
import { Profile } from './screens/Profile.tsx'
import { Projects } from './screens/Projects.tsx'
import { closeProject, openProject, refreshLibrary } from './state/actions.ts'
import { useApp } from './state/app.ts'
import { saveNow, startAutosave } from './state/persist.ts'
import { navigate, parseHash, useRoute } from './state/router.ts'
import { installShortcuts } from './state/shortcuts.ts'
import { ToastHost } from './ui/Controls.tsx'

function EditorRoute({ id }: { id: string }) {
  const openId = useApp((s) => s.project?.id)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    if (openId !== id) {
      void openProject(id).then((ok) => {
        if (alive && !ok) { setFailed(true); navigate({ name: 'projects' }) }
      })
    }
    return () => { alive = false }
  }, [id, openId])
  if (failed || openId !== id) return <div className="screen" style={{ display: 'grid', placeItems: 'center' }}><span className="muted">Opening project…</span></div>
  return <Editor />
}

export default function App() {
  const route = useRoute()
  const dialog = useApp((s) => s.dialog)
  const prefs = useApp((s) => s.prefs)
  const [splash, setSplash] = useState(true)

  useEffect(() => {
    const stopSave = startAutosave()
    const stopKeys = installShortcuts()
    void refreshLibrary()
    startCloud()
    const t = window.setTimeout(() => setSplash(false), 1000)
    return () => { stopSave(); stopKeys(); window.clearTimeout(t) }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--ui-scale', String(prefs.uiScale))
    if (prefs.highContrast) root.dataset.contrast = 'high'
    else delete root.dataset.contrast
  }, [prefs])

  useEffect(() => {
    if (route.name !== 'editor') {
      // leaving the editor by any route: save, then let go of the project so coming back (or a cloud update) loads the stored copy
      void saveNow().then((ok) => { if (ok && parseHash(window.location.hash).name !== 'editor') closeProject() })
    }
  }, [route.name])

  return (
    <div className="app">
      <div className="screen">
        {route.name === 'home' && <Home />}
        {route.name === 'projects' && <Projects />}
        {route.name === 'profile' && <Profile />}
        {route.name === 'community' && <Placeholder title="Community" icon="users" lead="Share templates, follow artists and learn from each other." items={['Artist profiles, following and likes', 'Template sharing with creator attribution', 'Comments, reporting and moderation']} />}
        {route.name === 'marketplace' && <Placeholder title="Marketplace" icon="store" lead="Free and paid template packs from independent creators." items={['Free templates first, paid packs later', 'Creator revenue and attribution', 'Template packs for anatomy, poses, motion and environments']} />}
        {route.name === 'editor' && <EditorRoute id={route.id} />}
      </div>
      {dialog === 'new-project' && <NewProjectDialog />}
      {dialog === 'export' && <ExportDialog />}
      {dialog === 'shortcuts' && <ShortcutsDialog />}
      {dialog === 'text' && <TextDialog />}
      {dialog === 'crop' && <CropDialog />}
      {dialog === 'project' && <ProjectDialog />}
      {dialog === 'versions' && <VersionsDialog />}
      <ToastHost />
      <TourHost />
      {splash && (
        <div className="splash" aria-hidden="true">
          <div style={{ display: 'grid', justifyItems: 'center' }}>
            <svg viewBox="0 0 32 32" fill="none"><path d="M7 6.5C11 11 17 21.5 25 26" stroke="#168CFF" strokeWidth="5.2" strokeLinecap="round" /><path d="M25.5 5.5C21 10.5 14 21 6.5 26.5" stroke="#9B5CFF" strokeWidth="5.2" strokeLinecap="round" /></svg>
            <div className="word">Brush X</div>
          </div>
        </div>
      )}
    </div>
  )
}
