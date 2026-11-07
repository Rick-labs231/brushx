import { addSceneAt, clearScenes, duplicateScene, moveScene, rangeToScene, removeScene, renameScene, scenesOf } from '../engine/scenes.ts'
import { commit, openDialog, selectFrame } from './actions.ts'
import { store } from './app.ts'
import { toast } from './toast.ts'

const project = () => store.getState().project

export function addSceneHere() {
  const s = store.getState()
  if (!s.project) return
  const next = addSceneAt(s.project, s.frameId)
  if (next === s.project) toast('A scene already starts on this frame.', 'info')
  else commit(next)
}

export function renameSceneAction(id: string, name: string) {
  const p = project()
  if (p) commit(renameScene(p, id, name))
}

export function removeSceneAction(id: string) {
  const p = project()
  if (p) commit(removeScene(p, id))
}

export function clearScenesAction() {
  const p = project()
  if (p) commit(clearScenes(p))
}

export function moveSceneAction(id: string, dir: -1 | 1) {
  const p = project()
  if (p) commit(moveScene(p, id, dir))
}

export function duplicateSceneAction(id: string) {
  const p = project()
  const r = p && duplicateScene(p, id)
  if (!r) return
  commit(r.project)
  selectFrame(r.frameId)
}

export function gotoScene(id: string) {
  const p = project()
  const v = p && scenesOf(p).find((s) => s.id === id)
  if (p && v) selectFrame(p.frames[v.start].id)
}

/** Limits playback and export to one scene. */
export function useSceneAsRange(id: string) {
  const p = project()
  if (p) commit(rangeToScene(p, id))
}

export function exportSceneAction(id: string) {
  useSceneAsRange(id)
  openDialog('export')
}
