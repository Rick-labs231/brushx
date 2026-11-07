import { useState, type ReactNode } from 'react'
import { routeHref, useRoute, type Route } from '../state/router.ts'
import { Icon, Logo, type IconName } from '../ui/Icon.tsx'

const NAV: { route: Route; label: string; icon: IconName }[] = [
  { route: { name: 'home' }, label: 'Home', icon: 'home' },
  { route: { name: 'projects' }, label: 'Projects', icon: 'folder' },
  { route: { name: 'community' }, label: 'Community', icon: 'users' },
  { route: { name: 'marketplace' }, label: 'Marketplace', icon: 'store' },
  { route: { name: 'profile' }, label: 'Profile', icon: 'user' },
]

export function Shell(p: { children: ReactNode; search?: { value: string; onChange: (v: string) => void } }) {
  const route = useRoute()
  const [bell, setBell] = useState(false)
  const initial = 'R'
  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="#/" style={{ color: 'inherit', textDecoration: 'none' }}><Logo size={28} /><span className="hide-sm">Brush X</span></a>
        <div className="search">
          {p.search && (
            <>
              <Icon name="search" size={16} />
              <input className="input" type="search" placeholder="Search projects" aria-label="Search projects" value={p.search.value} onChange={(e) => p.search?.onChange(e.target.value)} />
            </>
          )}
        </div>
        <span className="grow" />
        <div className="rel">
          <button className="icon-btn" aria-label="Notifications" aria-expanded={bell} onClick={() => setBell((v) => !v)}><Icon name="bell" /></button>
          {bell && (
            <div className="menu" role="dialog" aria-label="Notifications" style={{ padding: '.8rem', minWidth: '14rem' }}>
              <strong>All caught up</strong>
              <p className="muted" style={{ marginTop: '.2rem' }}>No new notifications.</p>
            </div>
          )}
        </div>
        <a className="avatar" href="#/profile" aria-label="Profile" style={{ color: '#fff', textDecoration: 'none' }}>{initial}</a>
      </header>
      <main className="shell-main"><div className="wrap">{p.children}</div></main>
      <nav className="nav" aria-label="Main">
        {NAV.map((n) => (
          <a key={n.label} href={routeHref(n.route)} aria-current={route.name === n.route.name ? 'page' : undefined}>
            <Icon name={n.icon} size={20} />
            {n.label}
          </a>
        ))}
      </nav>
    </div>
  )
}
