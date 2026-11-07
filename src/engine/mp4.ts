// Minimal MP4 writer for one H.264 video track (samples in AVCC form, as WebCodecs emits with { avc: { format: 'avc' } }).

export interface Mp4Sample {
  data: Uint8Array
  /** presentation time in microseconds (no B-frames, so decode time is the same) */
  timeUs: number
  isKey: boolean
}

export interface Mp4AudioSample {
  data: Uint8Array
  timeUs: number
}

export interface Mp4Audio {
  codec: 'aac' | 'opus'
  sampleRate: number
  channels: number
  /** AAC: AudioSpecificConfig. Opus: the OpusHead packet. */
  description: Uint8Array
  samples: Mp4AudioSample[]
  lastDurationUs: number
}

export interface Mp4Options {
  width: number
  height: number
  /** avcC box payload (decoderConfig.description) */
  avcC: Uint8Array
  samples: Mp4Sample[]
  /** duration of the last sample in microseconds */
  lastDurationUs: number
  audio?: Mp4Audio
}

const TS = 90_000
const te = new TextEncoder()
const u32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])
const u16 = (n: number) => new Uint8Array([(n >>> 8) & 255, n & 255])

function cat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}
const box = (type: string, ...parts: Uint8Array[]) => {
  const body = cat(parts)
  return cat([u32(8 + body.length), te.encode(type), body])
}
const full = (type: string, version: number, flags: number, ...parts: Uint8Array[]) => box(type, u32((version << 24) | flags), ...parts)
const zeros = (n: number) => new Uint8Array(n)
const MATRIX = cat([u32(0x10000), u32(0), u32(0), u32(0), u32(0x10000), u32(0), u32(0), u32(0), u32(0x40000000)])

/** MPEG-4 descriptor with a one-byte length (all ours are < 128 bytes). */
const desc = (tag: number, ...parts: Uint8Array[]) => {
  const body = cat(parts)
  return cat([new Uint8Array([tag, body.length]), body])
}

function audioSampleEntry(a: Mp4Audio): Uint8Array {
  const head = [zeros(6), u16(1), zeros(8), u16(a.channels), u16(16), u16(0), u16(0), u32(Math.min(65535, a.sampleRate) << 16)]
  if (a.codec === 'aac') {
    const dec = desc(0x04, new Uint8Array([0x40, 0x15, 0, 0, 0]), u32(0), u32(0), desc(0x05, a.description))
    const esds = full('esds', 0, 0, desc(0x03, u16(2), new Uint8Array([0]), dec, desc(0x06, new Uint8Array([2]))))
    return box('mp4a', ...head, esds)
  }
  // Opus in MP4: dOps carries the same fields as OpusHead, big-endian
  const h = new DataView(a.description.buffer, a.description.byteOffset, a.description.byteLength)
  const preSkip = a.description.length >= 12 ? h.getUint16(10, true) : 312
  const dops = box('dOps', new Uint8Array([0, a.channels]), u16(preSkip), u32(a.sampleRate), u16(0), new Uint8Array([0]))
  return box('Opus', ...head, dops)
}

export function muxMp4(o: Mp4Options): Uint8Array {
  const n = o.samples.length
  if (!n) throw new Error('No samples')
  const dts = o.samples.map((s) => Math.round((s.timeUs * TS) / 1e6))
  const durs = dts.map((t, i) => (i + 1 < n ? Math.max(1, dts[i + 1] - t) : Math.max(1, Math.round((o.lastDurationUs * TS) / 1e6))))
  const total = durs.reduce((a, b) => a + b, 0)

  // run-length stts
  const runs: [number, number][] = []
  for (const d of durs) {
    const last = runs[runs.length - 1]
    if (last && last[1] === d) last[0] += 1
    else runs.push([1, d])
  }
  const stts = full('stts', 0, 0, u32(runs.length), ...runs.map(([c, d]) => cat([u32(c), u32(d)])))
  const keys = o.samples.flatMap((s, i) => (s.isKey ? [i + 1] : []))
  const stss = full('stss', 0, 0, u32(keys.length), ...keys.map(u32))
  const stsz = full('stsz', 0, 0, u32(0), u32(n), ...o.samples.map((s) => u32(s.data.length)))
  const stsc = full('stsc', 0, 0, u32(1), u32(1), u32(n), u32(1))

  const avc1 = box('avc1', zeros(6), u16(1), zeros(16), u16(o.width), u16(o.height), u32(0x480000), u32(0x480000), u32(0), u16(1), zeros(32), u16(0x18), u16(0xffff), box('avcC', o.avcC))
  const stsd = full('stsd', 0, 0, u32(1), avc1)

  const au = o.audio
  const aDts = au ? au.samples.map((s) => Math.round((s.timeUs * au.sampleRate) / 1e6)) : []
  const aDur = au ? aDts.map((t, i) => (i + 1 < aDts.length ? Math.max(1, aDts[i + 1] - t) : Math.max(1, Math.round((au.lastDurationUs * au.sampleRate) / 1e6)))) : []
  const aTotal = aDur.reduce((x, y) => x + y, 0)
  const aRuns: [number, number][] = []
  for (const d of aDur) { const l = aRuns[aRuns.length - 1]; if (l && l[1] === d) l[0] += 1; else aRuns.push([1, d]) }
  const videoBytes = o.samples.reduce((a, s) => a + s.data.length, 0)

  const buildMoov = (chunkOffset: number) => {
    const stco = full('stco', 0, 0, u32(1), u32(chunkOffset))
    const stbl = box('stbl', stsd, stts, stss, stsc, stsz, stco)
    const dinf = box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1)))
    const minf = box('minf', full('vmhd', 0, 1, zeros(8)), dinf, stbl)
    const mdhd = full('mdhd', 0, 0, u32(0), u32(0), u32(TS), u32(total), u16(0x55c4), u16(0))
    const hdlr = full('hdlr', 0, 0, u32(0), te.encode('vide'), zeros(12), te.encode('Brush X\0'))
    const tkhd = full('tkhd', 0, 3, u32(0), u32(0), u32(1), u32(0), u32(total), zeros(8), u16(0), u16(0), u16(0), u16(0), MATRIX, u32(o.width << 16), u32(o.height << 16))
    const trak = box('trak', tkhd, box('mdia', mdhd, hdlr, minf))
    const mvhd = full('mvhd', 0, 0, u32(0), u32(0), u32(TS), u32(total), u32(0x10000), u16(0x100), zeros(10), MATRIX, zeros(24), u32(3))
    let atrak: Uint8Array = new Uint8Array(0)
    if (au) {
      const stblA = box('stbl', full('stsd', 0, 0, u32(1), audioSampleEntry(au)), full('stts', 0, 0, u32(aRuns.length), ...aRuns.map(([c, d]) => cat([u32(c), u32(d)]))), full('stsc', 0, 0, u32(1), u32(1), u32(au.samples.length), u32(1)), full('stsz', 0, 0, u32(0), u32(au.samples.length), ...au.samples.map((s) => u32(s.data.length))), full('stco', 0, 0, u32(1), u32(chunkOffset + videoBytes)))
      const minfA = box('minf', full('smhd', 0, 0, zeros(4)), dinf, stblA)
      const mdhdA = full('mdhd', 0, 0, u32(0), u32(0), u32(au.sampleRate), u32(aTotal), u16(0x55c4), u16(0))
      const hdlrA = full('hdlr', 0, 0, u32(0), te.encode('soun'), zeros(12), te.encode('Brush X\0'))
      const tkhdA = full('tkhd', 0, 3, u32(0), u32(0), u32(2), u32(0), u32(Math.round((aTotal * TS) / au.sampleRate)), zeros(8), u16(0), u16(0), u16(0x100), u16(0), MATRIX, u32(0), u32(0))
      atrak = box('trak', tkhdA, box('mdia', mdhdA, hdlrA, minfA))
    }
    return box('moov', mvhd, trak, atrak)
  }
  const ftyp = box('ftyp', te.encode('isom'), u32(512), te.encode('isomiso2avc1mp41'))
  const mdatSize = 8 + videoBytes + (au ? au.samples.reduce((a, s) => a + s.data.length, 0) : 0)
  // moov goes first so the file plays while it downloads; its size doesn't depend on the offset value
  const moovLen = buildMoov(0).length
  const moov = buildMoov(ftyp.length + moovLen + 8)
  const mdatHead = cat([u32(mdatSize), te.encode('mdat')])
  return cat([ftyp, moov, mdatHead, ...o.samples.map((s) => s.data), ...(au ? au.samples.map((s) => s.data) : [])])
}
