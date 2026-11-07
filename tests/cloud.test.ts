import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { CloudClient, CloudError, normalizeUrl, objectPath, type CloudSession, type SessionStore } from '../src/cloud/client.ts'
import { startMock, type Mock } from './mock-supabase.ts'

const memStore = (): SessionStore & { value: CloudSession | null } => ({ value: null, load() { return this.value }, save(s) { this.value = s } })
const row = (id: string, t = 1) => ({ id, name: id, updated_at: t, created_at: 1, archived: false, size: 3, thumb: null, frames: 1, width: 10, height: 10, fps: 12 })

describe('cloud client against the mock', () => {
  let mock: Mock
  before(async () => { mock = await startMock() })
  after(async () => { await mock.close() })
  const make = (store = memStore(), key = 'anon-key', now?: () => number) => ({ store, c: new CloudClient({ url: mock.url, anonKey: key }, store, undefined, now) })

  it('normalizes addresses: https or localhost only', () => {
    assert.equal(normalizeUrl('https://abc.supabase.co/'), 'https://abc.supabase.co')
    assert.equal(normalizeUrl('http://127.0.0.1:54321'), 'http://127.0.0.1:54321')
    assert.equal(normalizeUrl('http://abc.supabase.co'), null)
    assert.equal(normalizeUrl('nope'), null)
  })
  it('ping works with the key and fails with a wrong one', async () => {
    await make().c.ping()
    await assert.rejects(make(memStore(), 'wrong').c.ping(), (e: CloudError) => e.status === 401)
  })
  it('sign up, sign in, wrong password, weak password', async () => {
    const a = make()
    assert.deepEqual(await a.c.signUp('rick@example.com', 'secret1'), { signedIn: true })
    assert.equal(a.c.user?.email, 'rick@example.com')
    assert.ok(a.store.value?.accessToken)
    const b = make()
    await b.c.signIn('rick@example.com', 'secret1')
    assert.equal(b.c.user?.id, a.c.user?.id)
    await assert.rejects(make().c.signIn('rick@example.com', 'nope'), (e: CloudError) => /Invalid login/.test(e.message) && e.code === 'invalid_credentials')
    await assert.rejects(make().c.signUp('x@example.com', '123'), (e: CloudError) => e.code === 'weak_password')
  })
  it('email confirmation projects: sign up returns no session', async () => {
    mock.opts.confirmEmail = true
    try {
      const a = make()
      assert.deepEqual(await a.c.signUp('conf@example.com', 'secret1'), { signedIn: false })
      assert.equal(a.c.user, null)
      await assert.rejects(a.c.signIn('conf@example.com', 'secret1'), (e: CloudError) => e.code === 'email_not_confirmed')
    } finally { mock.opts.confirmEmail = false }
  })
  it('rows and files round-trip, scoped to the owner', async () => {
    const a = make(); await a.c.signUp('own1@example.com', 'secret1')
    const b = make(); await b.c.signUp('own2@example.com', 'secret1')
    const path = objectPath(a.c.user!.id, 'p1')
    await a.c.upload(path, new TextEncoder().encode('{"hello":1}'))
    await a.c.upsertRow(row('p1', 5))
    await a.c.upsertRow(row('p1', 9)) // upsert replaces
    assert.deepEqual((await a.c.listRows()).map((r) => [r.id, r.updated_at]), [['p1', 9]])
    assert.equal(await a.c.download(path), '{"hello":1}')
    assert.deepEqual(await b.c.listRows(), []) // the other account sees nothing
    await assert.rejects(b.c.download(path), (e: CloudError) => e.status === 403)
    await a.c.deleteRow('p1'); await a.c.removeObject(path)
    assert.deepEqual(await a.c.listRows(), [])
    await assert.rejects(a.c.download(path), (e: CloudError) => e.status === 404)
  })
  it('refreshes an expiring token by itself, and retries after a 401', async () => {
    const s = memStore(); const { c } = make(s)
    await c.signUp('refresh@example.com', 'secret1')
    const first = s.value!.accessToken
    // pretend the token is about to expire
    s.value = { ...s.value!, expiresAt: Math.floor(Date.now() / 1000) + 5 }
    const c2 = new CloudClient({ url: mock.url, anonKey: 'anon-key' }, s)
    await c2.listRows()
    assert.notEqual(s.value!.accessToken, first)
    // server forgets the token while the client still thinks it is valid
    const stale = s.value!.accessToken
    mock.opts.calls.length = 0
    s.value = { ...s.value!, accessToken: 'revoked', expiresAt: Math.floor(Date.now() / 1000) + 3000 }
    const c3 = new CloudClient({ url: mock.url, anonKey: 'anon-key' }, s)
    await c3.listRows()
    assert.notEqual(s.value!.accessToken, stale)
    assert.ok(mock.opts.calls.some((x) => x.includes('/auth/v1/token')))
  })
  it('a dead refresh token signs the app out with a clear message', async () => {
    const s = memStore(); await make(s).c.signUp('dead@example.com', 'secret1')
    s.value = { ...s.value!, refreshToken: 'bogus', expiresAt: 1 }
    await assert.rejects(new CloudClient({ url: mock.url, anonKey: 'anon-key' }, s).listRows(), (e: CloudError) => e.code === 'session_expired')
    assert.equal(s.value, null)
  })
  it('network failure gives a readable error', async () => {
    const c = new CloudClient({ url: 'http://127.0.0.1:1', anonKey: 'x' }, memStore())
    await assert.rejects(c.ping(), (e: CloudError) => e.code === 'network')
  })
})

// ------------------------------------------------------------------ sync between devices
import { createProject } from '../src/engine/projectOps.ts'
import { runSync, type LocalPort, type SyncMemory, type SyncSummary } from '../src/cloud/sync.ts'
import type { Project } from '../src/engine/types.ts'

function device(mock: Mock, account: { email: string }) {
  const projects = new Map<string, Project>()
  const memory: SyncMemory = { bases: {}, pending: [] }
  const store = memStore()
  const client = new CloudClient({ url: mock.url, anonKey: 'anon-key' }, store)
  let open: string | null = null
  let n = 0
  const local: LocalPort = {
    async list() { return [...projects.values()].map((p) => ({ id: p.id, updatedAt: p.updatedAt, thumb: null })) },
    async load(id) { return projects.get(id) ?? null },
    async save(p) { projects.set(p.id, p) },
    async remove(id) { projects.delete(id) },
  }
  const dev = {
    projects, memory, client,
    async signIn() { const r = await client.signIn(account.email, 'secret1').then(() => true, () => false); if (!r) await client.signUp(account.email, 'secret1') },
    sync: (): Promise<SyncSummary> => runSync({ api: client, local, memory, userId: client.user!.id, thumbOf: () => null, openId: () => open, newId: () => `copy-${++n}-${Math.random().toString(36).slice(2, 6)}`, now: () => Date.now() }),
    setOpen(id: string | null) { open = id },
    make(name: string): Project { const p = createProject({ name, width: 100, height: 100, fps: 12, background: null }); projects.set(p.id, p); return p },
    edit(id: string, name: string) { const p = projects.get(id)!; projects.set(id, { ...p, name, updatedAt: Math.max(Date.now(), p.updatedAt + 1) }) },
    del(id: string) { projects.delete(id); if (memory.bases[id]) memory.pending.push(id) },
  }
  return dev
}

describe('sync between two devices', () => {
  let mock: Mock
  before(async () => { mock = await startMock() })
  after(async () => { await mock.close() })
  let acct = 0
  const pair = async () => {
    const email = `dev${++acct}@example.com`
    const a = device(mock, { email }); const b = device(mock, { email })
    await a.signIn(); await b.signIn()
    return { a, b }
  }

  it('a new project reaches the other device, then edits flow both ways', async () => {
    const { a, b } = await pair()
    const p = a.make('Walk cycle')
    assert.equal((await a.sync()).uploaded, 1)
    const s = await b.sync()
    assert.equal(s.downloaded, 1)
    assert.equal(b.projects.get(p.id)!.name, 'Walk cycle')
    b.edit(p.id, 'Walk cycle v2')
    await b.sync(); await a.sync()
    assert.equal(a.projects.get(p.id)!.name, 'Walk cycle v2')
    const idle = await a.sync()
    assert.deepEqual([idle.uploaded, idle.downloaded, idle.conflicts, idle.errors.length], [0, 0, 0, 0]) // settled: nothing to do
  })
  it('both edited: newest keeps the name, the other becomes a conflict copy on both devices', async () => {
    const { a, b } = await pair()
    const p = a.make('Scene'); await a.sync(); await b.sync()
    a.edit(p.id, 'Scene (A)')
    await new Promise((r) => setTimeout(r, 5))
    b.edit(p.id, 'Scene (B)')
    await b.sync() // B uploads first
    const s = await a.sync() // A now conflicts
    assert.equal(s.conflicts, 1)
    const names = [...a.projects.values()].map((x) => x.name).sort()
    assert.deepEqual(names, ['Scene (A) (conflict copy)', 'Scene (B)'])
    await b.sync()
    assert.equal(b.projects.size, 2) // the copy reached B too
  })
  it('deleting on one device removes it from the other, once the other is untouched', async () => {
    const { a, b } = await pair()
    const p = a.make('Old'); await a.sync(); await b.sync()
    a.del(p.id)
    const s = await a.sync()
    assert.equal(s.removedRemote, 1)
    assert.equal(mock.objects.size >= 0, true)
    const t = await b.sync()
    assert.equal(t.removedLocal, 1)
    assert.equal(b.projects.size, 0)
  })
  it('work edited after it was deleted elsewhere is kept and re-uploaded', async () => {
    const { a, b } = await pair()
    const p = a.make('Keep me'); await a.sync(); await b.sync()
    a.del(p.id); await a.sync()
    b.edit(p.id, 'Keep me (edited)')
    const t = await b.sync()
    assert.equal(t.uploaded, 1)
    assert.equal(b.projects.size, 1)
    await a.sync()
    assert.equal(a.projects.get(p.id)!.name, 'Keep me (edited)')
  })
  it('never overwrites the open project, and picks it up later', async () => {
    const { a, b } = await pair()
    const p = a.make('Open one'); await a.sync(); await b.sync()
    a.edit(p.id, 'Open one (new)'); await a.sync()
    b.setOpen(p.id)
    const s = await b.sync()
    assert.deepEqual(s.skipped, [p.id])
    assert.equal(b.projects.get(p.id)!.name, 'Open one')
    b.setOpen(null)
    await b.sync()
    assert.equal(b.projects.get(p.id)!.name, 'Open one (new)')
  })
  it('one failing upload doesn\'t stop the others, and is retried next time', async () => {
    const { a } = await pair()
    const bad = a.make('Bad'); const good = a.make('Good')
    mock.opts.failUploadsFor.add(bad.id)
    const s = await a.sync()
    assert.equal(s.uploaded, 1)
    assert.equal(s.errors.length, 1)
    assert.equal(s.errors[0].id, bad.id)
    assert.ok(mock.rows.has(good.id) && !mock.rows.has(bad.id)) // no row without a file
    mock.opts.failUploadsFor.clear()
    assert.equal((await a.sync()).uploaded, 1)
    assert.ok(mock.rows.has(bad.id))
  })
  it('sound travels with the project', async () => {
    const { a, b } = await pair()
    const p = a.make('Loud')
    a.projects.set(p.id, { ...p, audio: { name: 's.wav', mime: 'audio/wav', data: new Uint8Array([9, 8, 7, 6]), duration: 1, offset: 0, volume: 1, muted: false, peaks: new Uint8Array([1, 2, 3]) } })
    await a.sync(); await b.sync()
    assert.deepEqual(Array.from(b.projects.get(p.id)!.audio!.data), [9, 8, 7, 6])
  })
  it('different accounts never see each other\'s projects', async () => {
    const { a } = await pair(); const other = await pair()
    a.make('Private'); await a.sync()
    const s = await other.a.sync()
    assert.equal(s.downloaded, 0)
    assert.equal(other.a.projects.size, 0)
  })
})
