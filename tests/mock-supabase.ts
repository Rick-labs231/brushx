// A small stand-in for a Supabase project, for tests only. Mirrors the parts of the HTTP API Brush X uses,
// including row-level ownership. It is NOT the real thing: a real project still needs checking once.
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { randomUUID } from 'node:crypto'

interface Row { owner: string; [k: string]: unknown }

export interface Mock {
  server: Server
  url: string
  close(): Promise<void>
  /** test hooks */
  opts: { confirmEmail: boolean; tokenLifetime: number; failUploadsFor: Set<string>; calls: string[] }
  rows: Map<string, Row>
  objects: Map<string, string>
}

const read = (req: IncomingMessage) => new Promise<string>((res) => { const c: Buffer[] = []; req.on('data', (d) => c.push(d)); req.on('end', () => res(Buffer.concat(c).toString('utf8'))) })

export async function startMock(port = 0): Promise<Mock> {
  const KEY = 'anon-key'
  const users = new Map<string, { id: string; email: string; password: string }>()
  const access = new Map<string, { uid: string; exp: number }>()
  const refresh = new Map<string, string>()
  const rows = new Map<string, Row>()
  const objects = new Map<string, string>()
  const opts = { confirmEmail: false, tokenLifetime: 3600, failUploadsFor: new Set<string>(), calls: [] as string[] }

  const session = (u: { id: string; email: string }) => {
    const at = 'at-' + randomUUID()
    const rt = 'rt-' + randomUUID()
    const exp = Math.floor(Date.now() / 1000) + opts.tokenLifetime
    access.set(at, { uid: u.id, exp })
    refresh.set(rt, u.id)
    return { access_token: at, refresh_token: rt, expires_in: opts.tokenLifetime, expires_at: exp, token_type: 'bearer', user: { id: u.id, email: u.email } }
  }

  const server = createServer(async (req, res) => {
    const send = (code: number, body?: unknown, extra: Record<string, string> = {}) => {
      res.writeHead(code, { 'Content-Type': typeof body === 'string' ? 'text/plain' : 'application/json', 'Access-Control-Allow-Origin': '*', ...extra })
      res.end(body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body))
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-upsert, prefer, x-client-info', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' })
      return res.end()
    }
    const url = new URL(req.url ?? '/', 'http://x')
    opts.calls.push(`${req.method} ${url.pathname}`)
    if (req.headers.apikey !== KEY) return send(401, { message: 'No API key found in request' })
    const body = await read(req)
    const bearer = String(req.headers.authorization ?? '').replace('Bearer ', '')
    const who = access.get(bearer)
    const authed = () => (who && who.exp > Math.floor(Date.now() / 1000) ? who.uid : null)

    if (url.pathname === '/auth/v1/settings') return send(200, { external: { email: true } })
    if (url.pathname === '/auth/v1/signup' && req.method === 'POST') {
      const { email, password } = JSON.parse(body)
      if (!email || String(password ?? '').length < 6) return send(422, { error_code: 'weak_password', msg: 'Password should be at least 6 characters.' })
      if (users.has(email)) return send(200, { id: users.get(email)!.id, email }) // real Supabase hides existing accounts
      const u = { id: randomUUID(), email, password }
      users.set(email, u)
      return send(200, opts.confirmEmail ? { id: u.id, email } : session(u))
    }
    if (url.pathname === '/auth/v1/token' && req.method === 'POST') {
      const grant = url.searchParams.get('grant_type')
      const j = JSON.parse(body)
      if (grant === 'password') {
        const u = users.get(j.email)
        if (!u || u.password !== j.password) return send(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
        if (opts.confirmEmail) return send(400, { error_code: 'email_not_confirmed', msg: 'Email not confirmed' })
        return send(200, session(u))
      }
      if (grant === 'refresh_token') {
        const uid = refresh.get(j.refresh_token)
        if (!uid) return send(400, { error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' })
        refresh.delete(j.refresh_token)
        const u = [...users.values()].find((x) => x.id === uid)!
        return send(200, session(u))
      }
    }
    if (url.pathname === '/auth/v1/logout') { access.delete(bearer); return send(204) }

    const uid = authed()
    if (!uid) return send(401, { message: 'JWT expired', code: 'PGRST301' })

    if (url.pathname === '/rest/v1/projects') {
      if (req.method === 'GET') return send(200, [...rows.values()].filter((r) => r.owner === uid).map(({ owner: _o, ...r }) => r).sort((a, b) => Number(b.updated_at) - Number(a.updated_at)))
      if (req.method === 'POST') {
        const j = JSON.parse(body)
        const prev = rows.get(String(j.id))
        if (prev && prev.owner !== uid) return send(403, { message: 'new row violates row-level security policy' })
        rows.set(String(j.id), { ...j, owner: uid })
        return send(201)
      }
      if (req.method === 'DELETE') {
        const id = (url.searchParams.get('id') ?? '').replace(/^eq\./, '')
        const r = rows.get(id)
        if (r && r.owner === uid) rows.delete(id)
        return send(204)
      }
    }
    const m = url.pathname.match(/^\/storage\/v1\/object\/(?:authenticated\/)?brushx\/(.+)$/)
    if (m) {
      const path = decodeURIComponent(m[1])
      if (!path.startsWith(uid + '/')) return send(403, { message: 'new row violates row-level security policy' })
      if (req.method === 'POST') {
        if ([...opts.failUploadsFor].some((id) => path.includes(id))) return send(500, { message: 'storage is having a moment' })
        objects.set(path, body)
        return send(200, { Key: 'brushx/' + path })
      }
      if (req.method === 'GET') return objects.has(path) ? send(200, objects.get(path)!) : send(404, { message: 'Object not found' })
    }
    if (url.pathname === '/storage/v1/object/brushx' && req.method === 'DELETE') {
      for (const p of JSON.parse(body).prefixes as string[]) if (p.startsWith(uid + '/')) objects.delete(p)
      return send(200, [])
    }
    return send(404, { message: 'not found' })
  })
  await new Promise<void>((r) => server.listen(port, '127.0.0.1', r))
  const addr = server.address() as { port: number }
  return { server, url: `http://127.0.0.1:${addr.port}`, opts, rows, objects, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()) }) }
}
