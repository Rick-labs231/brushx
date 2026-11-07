// Minimal ZIP (store-only) writer/reader. Used for PNG sequences and .brushx project files.

const TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = TABLE[(c ^ data[i]) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface ZipEntry { name: string; data: Uint8Array }

export function makeZip(entries: ZipEntry[]): Blob {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const e of entries) {
    const name = enc.encode(e.name)
    const crc = crc32(e.data)
    const lh = new DataView(new ArrayBuffer(30))
    lh.setUint32(0, 0x04034b50, true)
    lh.setUint16(4, 20, true)
    lh.setUint16(6, 0x0800, true)
    lh.setUint16(8, 0, true)
    lh.setUint32(14, crc, true)
    lh.setUint32(18, e.data.length, true)
    lh.setUint32(22, e.data.length, true)
    lh.setUint16(26, name.length, true)
    parts.push(new Uint8Array(lh.buffer), name, e.data)
    const ch = new DataView(new ArrayBuffer(46))
    ch.setUint32(0, 0x02014b50, true)
    ch.setUint16(4, 20, true)
    ch.setUint16(6, 20, true)
    ch.setUint16(8, 0x0800, true)
    ch.setUint32(16, crc, true)
    ch.setUint32(20, e.data.length, true)
    ch.setUint32(24, e.data.length, true)
    ch.setUint16(28, name.length, true)
    ch.setUint32(42, offset, true)
    central.push(new Uint8Array(ch.buffer), name)
    offset += 30 + name.length + e.data.length
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, entries.length, true)
  end.setUint16(10, entries.length, true)
  end.setUint32(12, cdSize, true)
  end.setUint32(16, offset, true)
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], { type: 'application/zip' })
}

/** Reads archives written by makeZip (stored entries only). */
export function readZip(buf: ArrayBuffer): ZipEntry[] {
  const v = new DataView(buf)
  const u8 = new Uint8Array(buf)
  const dec = new TextDecoder()
  let eocd = -1
  for (let i = u8.length - 22; i >= 0; i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('Not a Brush X project file')
  const count = v.getUint16(eocd + 10, true)
  let p = v.getUint32(eocd + 16, true)
  const out: ZipEntry[] = []
  for (let i = 0; i < count; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('Project file is damaged')
    const method = v.getUint16(p + 10, true)
    const size = v.getUint32(p + 24, true)
    const nl = v.getUint16(p + 28, true)
    const el = v.getUint16(p + 30, true)
    const cl = v.getUint16(p + 32, true)
    const lho = v.getUint32(p + 42, true)
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl))
    if (method !== 0) throw new Error('Unsupported compression in project file')
    const lnl = v.getUint16(lho + 26, true)
    const lel = v.getUint16(lho + 28, true)
    const start = lho + 30 + lnl + lel
    out.push({ name, data: u8.slice(start, start + size) })
    p += 46 + nl + el + cl
  }
  return out
}
