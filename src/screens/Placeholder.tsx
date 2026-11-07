import { Icon, type IconName } from '../ui/Icon.tsx'
import { Shell } from './Shell.tsx'

export function Placeholder(p: { title: string; icon: IconName; lead: string; items: string[] }) {
  return (
    <Shell>
      <div className="empty" style={{ marginTop: '1rem' }}>
        <Icon name={p.icon} size={36} />
        <h1>{p.title}</h1>
        <span className="chip warn">Coming in a later release</span>
        <p className="muted" style={{ maxWidth: '34rem' }}>{p.lead}</p>
        <ul className="muted" style={{ textAlign: 'left', margin: 0 }}>{p.items.map((i) => <li key={i}>{i}</li>)}</ul>
        <p className="faint">Brush X works fully on its own without this.</p>
      </div>
    </Shell>
  )
}
