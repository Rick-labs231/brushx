import { store, type Toast } from './app.ts'

let nextId = 1

export function toast(text: string, kind: Toast['kind'] = 'info', actions?: Toast['actions']) {
  const id = nextId++
  store.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind, actions }] }))
  window.setTimeout(() => dismissToast(id), actions ? 9000 : 3800)
  return id
}

export function dismissToast(id: number) {
  store.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}
