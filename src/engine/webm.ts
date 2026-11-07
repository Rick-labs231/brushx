// Minimal WebM (Matroska) writer for one VP9/VP8 video track.

export interface WebmSample {
  data: Uint8Array
  timeUs: number
  isKey: boolean
}

export interface WebmAudio {
  sampleRate: number
  channels: number
  /** OpusHead packet */
  codecPrivate: Uint8Array
  samples: { data: Uint8Array; timeUs: number }[]
}

export interface WebmOptions {
  audio?: WebmAudio
  width: number
  height: number
  codec: 'V_VP9' | 'V_VP8'
  samples: WebmSample[]
  lastDurationUs: number
}

function cat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}
const idBytes = (id: number) => {
  const b: number[] = []
  for (let v = id; v > 0; v = Math.floor(v / 256)) b.unshift(v & 255)
  return new Uint8Array(b)
}
function vint(n: number, width?: number): Uint8Array {
  let w = width ?? 1
  while (!width && n >= 2 ** (7 * w) - 1) w += 1
  const out = new Uint8Array(w)
  let v = n
  for (let i = w - 1; i >= 0; i -= 1) { out[i] = v % 256; v = Math.floor(v / 256) }
  out[0] |= 1 << (8 - w)
  return out
}
const el = (id: number, ...parts: Uint8Array[]) => {
  const body = cat(parts)
  return cat([idBytes(id), vint(body.length), body])
}
function uint(n: number, width?: number): Uint8Array {
  let w = width ?? 1
  while (!width && n >= 2 ** (8 * w)) w += 1
  const out = new Uint8Array(w)
  let v = n
  for (let i = w - 1; i >= 0; i -= 1) { out[i] = v % 256; v = Math.floor(v / 256) }
  return out
}
const f64 = (x: number) => { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, x); return b }
const str = (s: string) => new TextEncoder().encode(s)

const CLUSTER_MS = 4000

export function muxWebm(o: WebmOptions): Uint8Array {
  if (!o.samples.length) throw new Error('No samples')
  const ms = o.samples.map((s) => Math.round(s.timeUs / 1000))
  const durationMs = ms[ms.length - 1] + Math.round(o.lastDurationUs / 1000)

  const ebml = el(0x1a45dfa3, el(0x4286, uint(1)), el(0x42f7, uint(1)), el(0x42f2, uint(4)), el(0x42f3, uint(8)), el(0x4282, str('webm')), el(0x4287, uint(4)), el(0x4285, uint(2)))
  const info = el(0x1549a966, el(0x2ad7b1, uint(1_000_000)), el(0x4d80, str('Brush X')), el(0x5741, str('Brush X')), el(0x4489, f64(durationMs)))
  const videoTrack = el(0xae, el(0xd7, uint(1)), el(0x73c5, uint(1)), el(0x83, uint(1)), el(0x86, str(o.codec)), el(0xe0, el(0xb0, uint(o.width)), el(0xba, uint(o.height))))
  const au = o.audio
  const audioTrack = au
    ? el(0xae, el(0xd7, uint(2)), el(0x73c5, uint(2)), el(0x83, uint(2)), el(0x86, str('A_OPUS')), el(0x63a2, au.codecPrivate), el(0x56aa, uint(6_500_000)), el(0x56bb, uint(80_000_000)), el(0xe1, el(0xb5, f64(au.sampleRate)), el(0x9f, uint(au.channels))))
    : new Uint8Array(0)
  const tracks = el(0x1654ae6b, videoTrack, audioTrack)

  // clusters: a new one at the first keyframe after CLUSTER_MS
  const clusters: { start: number; body: Uint8Array[]; firstKeyMs: number | null }[] = []
  // video and sound blocks in time order; a new cluster starts on the first video keyframe after CLUSTER_MS
  type Item = { track: number; ms: number; data: Uint8Array; key: boolean }
  const items: Item[] = o.samples.map((s, i) => ({ track: 1, ms: ms[i], data: s.data, key: s.isKey }))
  for (const s of au?.samples ?? []) items.push({ track: 2, ms: Math.round(s.timeUs / 1000), data: s.data, key: true })
  items.sort((a, b) => a.ms - b.ms || a.track - b.track)
  for (const it of items) {
    let c = clusters[clusters.length - 1]
    if (!c || (it.track === 1 && it.key && it.ms - c.start >= CLUSTER_MS)) {
      c = { start: it.ms, body: [el(0xe7, uint(it.ms))], firstKeyMs: null }
      clusters.push(c)
    }
    if (it.track === 1 && it.key && c.firstKeyMs === null) c.firstKeyMs = it.ms
    const rel = Math.max(0, it.ms - c.start)
    const head = new Uint8Array([0x80 | it.track, (rel >> 8) & 255, rel & 255, it.key ? 0x80 : 0])
    c.body.push(el(0xa3, head, it.data))
  }
  const clusterBytes = clusters.map((c) => el(0x1f43b675, ...c.body))

  // cues point at each cluster; fixed-width positions keep the cues size stable
  const cuesFor = (offsets: number[]) =>
    el(0x1c53bb6b, ...clusters.map((c, i) => el(0xbb, el(0xb3, uint(c.start, 4)), el(0xb7, el(0xf7, uint(1)), el(0xf1, uint(offsets[i], 4))))))
  const cuesLen = cuesFor(clusters.map(() => 0)).length
  const offsets: number[] = []
  let pos = info.length + tracks.length + cuesLen
  for (const c of clusterBytes) { offsets.push(pos); pos += c.length }
  const cues = cuesFor(offsets)

  const segBody = cat([info, tracks, cues, ...clusterBytes])
  const segment = cat([idBytes(0x18538067), vint(segBody.length, 8), segBody])
  return cat([ebml, segment])
}
