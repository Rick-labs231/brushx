import { useState } from 'react'
import { connectCloud, disconnectCloud, setAutoSync, signInCloud, signOutCloud, signUpCloud, syncNow } from '../state/cloud.ts'
import { useApp } from '../state/app.ts'
import { Toggle } from '../ui/Controls.tsx'
import { timeAgo } from '../ui/Controls.tsx'

const mb = (n: number) => (n / 1048576 < 10 ? (n / 1048576).toFixed(1) : String(Math.round(n / 1048576))) + ' MB'

export function CloudCard() {
  const cloud = useApp((s) => s.cloud)
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn() } finally { setBusy(false) } }

  return (
    <section className="card" data-testid="cloud-card"><div className="body" style={{ padding: '1rem', display: 'grid', gap: '.6rem' }}>
      <h2>Account and cloud</h2>
      {!cloud.configured && (
        <>
          <p className="muted">Sign in to keep your projects in step across devices. Brush X stores them in your own Supabase project.</p>
          <div className="field"><label htmlFor="cl-url">Project URL</label><input id="cl-url" className="input" inputMode="url" autoComplete="off" placeholder="https://your-project.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
          <div className="field"><label htmlFor="cl-key">Anon (public) key</label><input id="cl-key" className="input" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} /></div>
          <button className="btn primary" disabled={busy || !url || !key} onClick={() => void run(() => connectCloud(url, key))}>{busy ? 'Checking…' : 'Connect'}</button>
          <p className="faint">Create a free project at supabase.com, run <code>docs/supabase-setup.sql</code> in its SQL editor, then copy the URL and anon key from Project Settings → API. The anon key is meant to be public; your data is protected by your sign-in.</p>
        </>
      )}
      {cloud.configured && !cloud.user && (
        <>
          <p className="muted">Sign in, or create an account, to sync.</p>
          <form onSubmit={(e) => { e.preventDefault(); void run(() => signInCloud(email, password)) }} style={{ display: 'grid', gap: '.5rem' }}>
            <div className="field"><label htmlFor="cl-email">Email</label><input id="cl-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="field"><label htmlFor="cl-pass">Password</label><input id="cl-pass" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <div className="row">
              <button type="submit" className="btn primary" disabled={busy || !email || !password}>Sign in</button>
              <button type="button" className="btn secondary" disabled={busy || !email || password.length < 6} onClick={() => void run(() => signUpCloud(email, password))}>Create account</button>
            </div>
          </form>
          {!cloud.fromBuild && <button className="btn ghost sm" onClick={disconnectCloud}>Use a different project</button>}
        </>
      )}
      {cloud.configured && cloud.user && (
        <>
          <p>Signed in as <strong data-testid="cloud-email">{cloud.user.email}</strong></p>
          <span className={`chip ${cloud.status === 'error' ? 'warn' : cloud.status === 'syncing' ? '' : 'ok'}`} role="status" data-testid="cloud-status">
            {cloud.status === 'syncing' ? 'Syncing…' : cloud.status === 'offline' ? 'Offline' : cloud.status === 'error' ? 'Sync problem' : cloud.lastSync ? `Synced ${timeAgo(cloud.lastSync)}` : 'Ready'}
          </span>
          <div className="row">
            <button className="btn secondary" disabled={cloud.status === 'syncing'} onClick={() => void syncNow()}>Sync now</button>
            <button className="btn ghost" onClick={() => void signOutCloud()}>Sign out</button>
          </div>
          <Toggle label="Sync automatically" hint="After you save, when you come back to the tab, and when you reconnect" checked={cloud.autoSync} onChange={setAutoSync} />
          {cloud.usedBytes > 0 && <p className="faint">{mb(cloud.usedBytes)} stored in the cloud.</p>}
        </>
      )}
      {cloud.message && <p role="alert" data-testid="cloud-message" style={{ color: 'var(--warning, #F5A524)' }}>{cloud.message}</p>}
    </div></section>
  )
}
