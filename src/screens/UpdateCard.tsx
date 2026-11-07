import { useState } from 'react'
import { APP_VERSION } from '../native/update.ts'
import { checkForUpdates, updatesApply, useUpdate } from '../state/update.ts'

/** Version number and a manual "Check for updates" (installed Android app only; the web app updates itself). */
export function UpdateCard() {
  const { info, checking } = useUpdate()
  const [msg, setMsg] = useState('')
  const native = updatesApply()
  return (
    <section className="card" data-testid="update-card"><div className="body" style={{ padding: '1rem', display: 'grid', gap: '.5rem' }}>
      <h2>Version</h2>
      <p className="muted">Brush X {APP_VERSION}</p>
      {!native && <p className="faint">This web version always opens the newest build. Reload the page to update.</p>}
      {native && (
        <>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className="btn secondary sm" disabled={checking} onClick={async () => {
              const r = await checkForUpdates(true)
              setMsg(r === 'newer' ? '' : r === 'current' ? 'You have the newest version.' : 'Couldn’t reach the update server. Check your connection and try again.')
            }}>{checking ? 'Checking…' : 'Check for updates'}</button>
            {info && <a className="btn primary sm" href={info.url} target="_blank" rel="noopener noreferrer">Download {info.version}</a>}
          </div>
          {info && <p className="muted">Brush X {info.version} is available. {info.notes}</p>}
          {msg && <p className="faint" role="status">{msg}</p>}
        </>
      )}
    </div></section>
  )
}
