import { dismissUpdate, useUpdate } from '../state/update.ts'

/** A small card at the top of the screen when a newer Brush X has been published. */
export function UpdateBanner() {
  const { info, dismissed } = useUpdate()
  if (!info || dismissed === info.version) return null
  return (
    <div className="update-banner" role="status" data-testid="update-banner">
      <div>
        <strong>Brush X {info.version} is available</strong>
        <span>{info.notes || 'A newer version is ready to download.'}</span>
        <small>Export or sync your projects first: installing over a test build may need the old one removed.</small>
      </div>
      <div className="row">
        <a className="btn primary sm" href={info.url} target="_blank" rel="noopener noreferrer">Download</a>
        <button className="btn ghost sm" onClick={dismissUpdate}>Later</button>
      </div>
    </div>
  )
}
