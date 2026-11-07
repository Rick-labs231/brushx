import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fetchLatest, isNewer, parseVersion, readRelease } from '../src/native/update.ts'

describe('update check', () => {
  it('reads versions with or without a leading v', () => {
    assert.deepEqual(parseVersion('v0.10.3'), [0, 10, 3])
    assert.deepEqual(parseVersion('1.2'), [1, 2, 0])
    assert.equal(parseVersion('nightly'), null)
  })
  it('compares numerically, not as text', () => {
    assert.equal(isNewer('0.10.3', '0.10.2'), true)
    assert.equal(isNewer('0.10.0', '0.9.9'), true)
    assert.equal(isNewer('v1.0.0', '0.99.99'), true)
    assert.equal(isNewer('0.10.2', '0.10.2'), false)
    assert.equal(isNewer('0.9.0', '0.10.0'), false)
    assert.equal(isNewer('oops', '0.1.0'), false)
    assert.equal(isNewer('0.2.0', '0.0.0'), true)
  })
  const release = {
    tag_name: 'v0.10.3', body: '## What changed\r\n\r\nFixed the cycle export.', html_url: 'https://github.com/Rick-labs231/brushx/releases/tag/v0.10.3',
    assets: [{ name: 'notes.txt', browser_download_url: 'https://x/notes.txt' }, { name: 'brushx.apk', browser_download_url: 'https://github.com/Rick-labs231/brushx/releases/download/v0.10.3/brushx.apk' }],
  }
  it('finds the APK link and a one-line summary', () => {
    const r = readRelease(release)!
    assert.equal(r.version, '0.10.3')
    assert.ok(r.url.endsWith('/brushx.apk'))
    assert.equal(r.notes, '## What changed')
  })
  it('falls back to the release page without an APK, and ignores drafts and pre-releases', () => {
    assert.equal(readRelease({ ...release, assets: [] })!.url, release.html_url)
    assert.equal(readRelease({ ...release, draft: true }), null)
    assert.equal(readRelease({ ...release, prerelease: true }), null)
    assert.equal(readRelease({ tag_name: 'weekly' }), null)
    assert.equal(readRelease(null), null)
  })
  it('fetches through the injected fetch and reports server errors', async () => {
    const ok = (async () => ({ ok: true, status: 200, json: async () => release })) as unknown as typeof fetch
    assert.equal((await fetchLatest(ok))!.version, '0.10.3')
    const bad = (async () => ({ ok: false, status: 403, json: async () => ({}) })) as unknown as typeof fetch
    await assert.rejects(() => fetchLatest(bad), /403/)
  })
})
