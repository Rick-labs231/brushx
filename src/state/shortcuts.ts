import { toolByKey } from '../editor/tools.ts'
import { fitView } from '../editor/viewControls.ts'
import {
  copySelection, cutSelection, pasteGuideAction, deleteSelection, moveSelection, pasteClipboard, nudgeBrushSize, openDialog, patch, redo, setPlaying, setTool, stepFrame, undo,
} from './actions.ts'
import { store } from './app.ts'
import { cancelBezier, cancelPolygon, finishBezier, finishPolygon } from './drawing.ts'
import { importDropped } from './media.ts'
import { saveNow } from './persist.ts'
import { session } from './session.ts'

function typing(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  if (!el) return false
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) return true
  if (el.tagName === 'INPUT') return !['range', 'checkbox', 'color', 'button'].includes((el as HTMLInputElement).type)
  return false
}

export function installShortcuts(): () => void {
  const down = (e: KeyboardEvent) => {
    const s = store.getState()
    if (!s.project || s.dialog) return
    const mod = e.ctrlKey || e.metaKey
    const key = e.key
    if (key === ' ' && !typing(e.target) && (e.target as HTMLElement).tagName !== 'BUTTON') {
      session.spaceHeld = true
      e.preventDefault()
      return
    }
    if (mod && key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return }
    if (mod && key.toLowerCase() === 'y') { e.preventDefault(); redo(); return }
    if (mod && e.shiftKey && key.toLowerCase() === 'v' && !typing(e.target)) { e.preventDefault(); pasteGuideAction(); return }
    if (mod && !e.shiftKey && !e.altKey && !typing(e.target) && 'cvx'.includes(key.toLowerCase()) && key.length === 1) {
      e.preventDefault()
      const k = key.toLowerCase()
      if (k === 'c') copySelection()
      else if (k === 'x') cutSelection()
      else pasteClipboard()
      return
    }
    if (mod && key.toLowerCase() === 's') { e.preventDefault(); void saveNow(); return }
    if (mod || e.altKey || typing(e.target)) return

    if (key === 'Tab') { e.preventDefault(); patch({ focusMode: !s.focusMode }); return }
    if (key === 'Escape') {
      if (s.focusMode) patch({ focusMode: false, drawerOpen: false })
      else if (session.polygon) cancelPolygon()
      else if (session.bezier) cancelBezier()
      else if (s.drawerOpen) patch({ drawerOpen: false })
      else if (s.selection) patch({ selection: null })
      return
    }
    if (key === 'Enter') {
      if ((e.target as HTMLElement).tagName === 'BUTTON') return
      e.preventDefault()
      if (session.polygon) finishPolygon()
      else if (session.bezier) finishBezier(false)
      else setPlaying(!s.playing)
      return
    }
    if (key === 'Delete' || key === 'Backspace') { if (s.selection) { e.preventDefault(); deleteSelection() } return }
    if (key.startsWith('Arrow') && s.selection) {
      e.preventDefault()
      const d = e.shiftKey ? 10 : 1
      moveSelection(key === 'ArrowLeft' ? -d : key === 'ArrowRight' ? d : 0, key === 'ArrowUp' ? -d : key === 'ArrowDown' ? d : 0)
      return
    }
    if (key === '[') { nudgeBrushSize(0.85); return }
    if (key === ']') { nudgeBrushSize(1.18); return }
    if (key === ',') { stepFrame(-1); return }
    if (key === '.') { stepFrame(1); return }
    if (key === '?') { openDialog('shortcuts'); return }
    const k = key.toLowerCase()
    if (k === 'x') { patch({ symmetry: !s.symmetry }); return }
    if (k === 'f') { fitView(); return }
    const t = toolByKey(k)
    if (t) setTool(t.id)
  }
  const up = (e: KeyboardEvent) => { if (e.key === ' ') session.spaceHeld = false }
  const blur = () => { session.spaceHeld = false }
  const over = (e: DragEvent) => { if (store.getState().project && !store.getState().dialog && e.dataTransfer?.types.includes('Files')) e.preventDefault() }
  const drop = (e: DragEvent) => {
    const files = Array.from(e.dataTransfer?.files ?? [])
    if (!store.getState().project || store.getState().dialog || files.length === 0) return
    e.preventDefault()
    void importDropped(files)
  }
  window.addEventListener('dragover', over)
  window.addEventListener('drop', drop)
  window.addEventListener('keydown', down)
  window.addEventListener('keyup', up)
  window.addEventListener('blur', blur)
  return () => {
    window.removeEventListener('dragover', over)
    window.removeEventListener('drop', drop)
    window.removeEventListener('keydown', down)
    window.removeEventListener('keyup', up)
    window.removeEventListener('blur', blur)
  }
}
