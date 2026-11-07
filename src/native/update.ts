// "Is there a newer Brush X?" Asks GitHub for the latest published release and compares
// its tag (for example v0.10.3) with the version this build was made from.
// Pure functions only, so it can be unit-tested without a browser.

declare const __APP_VERSION__: string | undefined

/** The version this build was made from (set by Vite from package.json). */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'

export const RELEASES_REPO = 'Rick-labs231/brushx'
export const RELEASES_PAGE = `https://github.com/${RELEASES_REPO}/releases/latest`

export interface UpdateInfo {
  version: string
  /** Direct APK link when the release has one, otherwise the release page */
  url: string
  notes: string
}

/** "v0.10.3" or "0.10.3" → [0, 10, 3]. Anything else (such as "nightly") → null. */
export function parseVersion(v: string): number[] | null {
  const m = /^v?(\d+)\.(\d+)(?:\.(\d+))?/.exec(v.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : null
}

/** True when `latest` is a strictly higher version than `current`. Unreadable versions are never "newer". */
export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  if (!a || !b) return false
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] > b[i]
  return false
}

interface ReleaseJson {
  tag_name?: unknown
  body?: unknown
  html_url?: unknown
  draft?: unknown
  prerelease?: unknown
  assets?: unknown
}

/** Turns GitHub's "latest release" JSON into an UpdateInfo (null if it isn't a usable release). */
export function readRelease(json: unknown): UpdateInfo | null {
  if (!json || typeof json !== 'object') return null
  const r = json as ReleaseJson
  if (typeof r.tag_name !== 'string' || !parseVersion(r.tag_name) || r.draft === true || r.prerelease === true) return null
  const assets = Array.isArray(r.assets) ? (r.assets as { name?: unknown; browser_download_url?: unknown }[]) : []
  const apk = assets.find((a) => typeof a.name === 'string' && a.name.toLowerCase().endsWith('.apk') && typeof a.browser_download_url === 'string')
  const page = typeof r.html_url === 'string' && r.html_url.startsWith('https://') ? r.html_url : RELEASES_PAGE
  const notes = typeof r.body === 'string' ? r.body.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean)[0] ?? '' : ''
  return { version: r.tag_name.replace(/^v/, ''), url: (apk?.browser_download_url as string | undefined) ?? page, notes: notes.slice(0, 160) }
}

/** Fetches the latest release. Throws on network trouble; returns null if there is no usable release. */
export async function fetchLatest(fetchFn: typeof fetch = fetch): Promise<UpdateInfo | null> {
  const res = await fetchFn(`https://api.github.com/repos/${RELEASES_REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
  return readRelease(await res.json())
}
