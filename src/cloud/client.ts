// Minimal Supabase client: auth (GoTrue), table rows (PostgREST) and file storage, over plain fetch.
// Written against Supabase's documented HTTP API so the app has no SDK dependency.

export interface CloudConfig {
  url: string
  anonKey: string
}

export interface CloudUser {
  id: string
  email: string
}

export interface CloudSession {
  accessToken: string
  refreshToken: string
  /** seconds since epoch */
  expiresAt: number
  user: CloudUser
}

export interface SessionStore {
  load(): CloudSession | null
  save(s: CloudSession | null): void
}

export interface RemoteRow {
  id: string
  name: string
  updated_at: number
  created_at: number
  archived: boolean
  size: number
  thumb: string | null
  frames: number
  width: number
  height: number
  fps: number
}

export class CloudError extends Error {
  status: number
  code: string
  constructor(message: string, status = 0, code = '') {
    super(message)
    this.status = status
    this.code = code
  }
}

export const BUCKET = 'brushx'
export const objectPath = (userId: string, projectId: string) => `${userId}/${projectId}.brushx`

/** https only, except for a server on your own machine. Returns null when the address can't be used. */
export function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim())
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return null
    return `${u.protocol}//${u.host}`
  } catch {
    return null
  }
}

type FetchLike = typeof fetch

export class CloudClient {
  private session: CloudSession | null
  private refreshing: Promise<CloudSession> | null = null
  private cfg: CloudConfig
  private store: SessionStore
  private fetchImpl: FetchLike
  private now: () => number

  constructor(cfg: CloudConfig, store: SessionStore, fetchImpl: FetchLike = (...a) => fetch(...a), now: () => number = () => Math.floor(Date.now() / 1000)) {
    this.cfg = cfg
    this.store = store
    this.fetchImpl = fetchImpl
    this.now = now
    this.session = store.load()
  }

  get user(): CloudUser | null {
    return this.session?.user ?? null
  }

  // --------------------------------------------------------------- plumbing

  private async raw(path: string, init: RequestInit & { token?: string | null } = {}): Promise<Response> {
    const headers = new Headers(init.headers)
    headers.set('apikey', this.cfg.anonKey)
    headers.set('Authorization', `Bearer ${init.token ?? this.cfg.anonKey}`)
    try {
      return await this.fetchImpl(`${this.cfg.url}${path}`, { ...init, headers })
    } catch {
      throw new CloudError('Can’t reach the cloud right now. Check your connection and the project address.', 0, 'network')
    }
  }

  private async fail(res: Response): Promise<never> {
    let msg = ''
    let code = ''
    try {
      const j = (await res.json()) as Record<string, unknown>
      msg = String(j.error_description ?? j.msg ?? j.message ?? j.error ?? '')
      code = String(j.error_code ?? j.code ?? '')
    } catch {
      /* not JSON */
    }
    throw new CloudError(msg || `The cloud answered with an error (${res.status}).`, res.status, code)
  }

  private adopt(j: Record<string, unknown>): CloudSession {
    const user = j.user as { id: string; email?: string } | undefined
    const expiresIn = Number(j.expires_in ?? 3600)
    const s: CloudSession = {
      accessToken: String(j.access_token),
      refreshToken: String(j.refresh_token),
      expiresAt: Number(j.expires_at ?? this.now() + expiresIn),
      user: { id: user?.id ?? this.session?.user.id ?? '', email: user?.email ?? this.session?.user.email ?? '' },
    }
    this.session = s
    this.store.save(s)
    return s
  }

  /** A token that is valid right now, refreshing it if it is about to expire. */
  private async token(): Promise<string> {
    if (!this.session) throw new CloudError('You’re signed out.', 401, 'signed_out')
    if (this.session.expiresAt - 30 > this.now()) return this.session.accessToken
    return (await this.refresh()).accessToken
  }

  private async refresh(): Promise<CloudSession> {
    if (!this.session) throw new CloudError('You’re signed out.', 401, 'signed_out')
    this.refreshing ??= (async () => {
      const res = await this.raw('/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: this.session!.refreshToken }) })
      if (!res.ok) {
        this.session = null
        this.store.save(null)
        throw new CloudError('Your sign-in expired. Please sign in again.', res.status, 'session_expired')
      }
      return this.adopt((await res.json()) as Record<string, unknown>)
    })().finally(() => { this.refreshing = null })
    return this.refreshing
  }

  /** Signed request; one retry with a fresh token if the first says the token is bad. */
  private async authed(path: string, init: RequestInit = {}): Promise<Response> {
    let res = await this.raw(path, { ...init, token: await this.token() })
    if (res.status === 401 && this.session) {
      await this.refresh()
      res = await this.raw(path, { ...init, token: this.session!.accessToken })
    }
    if (!res.ok) await this.fail(res)
    return res
  }

  // ------------------------------------------------------------------ auth

  /** Does the address answer like a Supabase project? */
  async ping(): Promise<void> {
    const res = await this.raw('/auth/v1/settings')
    if (!res.ok) await this.fail(res)
  }

  async signUp(email: string, password: string): Promise<{ signedIn: boolean }> {
    const res = await this.raw('/auth/v1/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
    if (!res.ok) await this.fail(res)
    const j = (await res.json()) as Record<string, unknown>
    if (j.access_token) {
      this.adopt(j)
      return { signedIn: true }
    }
    return { signedIn: false } // the project asks people to confirm their email first
  }

  async signIn(email: string, password: string): Promise<void> {
    const res = await this.raw('/auth/v1/token?grant_type=password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
    if (!res.ok) await this.fail(res)
    this.adopt((await res.json()) as Record<string, unknown>)
  }

  async signOut(): Promise<void> {
    const t = this.session?.accessToken
    this.session = null
    this.store.save(null)
    if (t) await this.raw('/auth/v1/logout', { method: 'POST', token: t }).catch(() => undefined)
  }

  // ------------------------------------------------------------- project rows

  async listRows(): Promise<RemoteRow[]> {
    const res = await this.authed('/rest/v1/projects?select=id,name,updated_at,created_at,archived,size,thumb,frames,width,height,fps&order=updated_at.desc')
    return (await res.json()) as RemoteRow[]
  }

  async upsertRow(row: RemoteRow): Promise<void> {
    await this.authed('/rest/v1/projects?on_conflict=id', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) })
  }

  async deleteRow(id: string): Promise<void> {
    await this.authed(`/rest/v1/projects?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  }

  // ------------------------------------------------------------------ files

  async upload(path: string, bytes: Uint8Array): Promise<void> {
    await this.authed(`/storage/v1/object/${BUCKET}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-upsert': 'true' }, body: bytes as BodyInit })
  }

  async download(path: string): Promise<string> {
    const res = await this.authed(`/storage/v1/object/authenticated/${BUCKET}/${path}`)
    return res.text()
  }

  async removeObject(path: string): Promise<void> {
    await this.authed(`/storage/v1/object/${BUCKET}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [path] }) })
  }
}
