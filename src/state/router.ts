import { useSyncExternalStore } from 'react'

export type Route =
  | { name: 'home' }
  | { name: 'projects' }
  | { name: 'community' }
  | { name: 'marketplace' }
  | { name: 'profile' }
  | { name: 'editor'; id: string }

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  switch (parts[0]) {
    case 'projects':
      return { name: 'projects' }
    case 'community':
      return { name: 'community' }
    case 'marketplace':
      return { name: 'marketplace' }
    case 'profile':
      return { name: 'profile' }
    case 'editor':
      return parts[1] ? { name: 'editor', id: decodeURIComponent(parts[1]) } : { name: 'home' }
    default:
      return { name: 'home' }
  }
}

export function routeHref(r: Route): string {
  return r.name === 'home' ? '#/' : r.name === 'editor' ? `#/editor/${encodeURIComponent(r.id)}` : `#/${r.name}`
}

export function navigate(r: Route) {
  window.location.hash = routeHref(r)
}

let cached: { hash: string; route: Route } | null = null

function snapshot(): Route {
  const hash = window.location.hash
  if (!cached || cached.hash !== hash) cached = { hash, route: parseHash(hash) }
  return cached.route
}

function subscribe(fn: () => void) {
  window.addEventListener('hashchange', fn)
  return () => window.removeEventListener('hashchange', fn)
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, snapshot)
}
