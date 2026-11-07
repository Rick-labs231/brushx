// GIF89a encoder: one shared palette (median cut), LZW, per-frame delay, loop.
// Pure functions over RGBA bytes so it runs anywhere and can be unit-tested.

export interface GifFrame {
  /** RGBA, width*height*4 */
  data: Uint8ClampedArray | Uint8Array
  /** hundredths of a second */
  delay: number
}

export interface GifOptions {
  width: number
  height: number
  frames: GifFrame[]
  /** pixels with alpha < 128 become transparent (palette index 0) */
  transparent: boolean
  loop: boolean
}

/** Builds up to `max` colours from RGB555 buckets using median cut on the histogram. */
export function buildPalette(frames: GifFrame[], max: number): Uint8Array {
  const hist = new Map<number, number>()
  for (const f of frames) {
    const d = f.data
    const step = d.length > 4_000_000 ? 8 : 4 // sample a little on huge frames
    for (let i = 0; i < d.length; i += 4 * step) {
      if (d[i + 3] < 128) continue
      const k = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3)
      hist.set(k, (hist.get(k) ?? 0) + 1)
    }
  }
  type Box = { keys: number[]; count: number }
  const all = [...hist.keys()]
  if (all.length === 0) return new Uint8Array([0, 0, 0])
  const chan = (k: number, c: number) => (c === 0 ? k >> 10 : c === 1 ? (k >> 5) & 31 : k & 31)
  const boxes: Box[] = [{ keys: all, count: all.reduce((a, k) => a + (hist.get(k) ?? 0), 0) }]
  while (boxes.length < max) {
    // split the box with the most pixels that still has >1 colour
    let bi = -1
    for (let i = 0; i < boxes.length; i += 1) if (boxes[i].keys.length > 1 && (bi < 0 || boxes[i].count > boxes[bi].count)) bi = i
    if (bi < 0) break
    const box = boxes[bi]
    let bestC = 0
    let bestRange = -1
    for (let c = 0; c < 3; c += 1) {
      let lo = 31
      let hi = 0
      for (const k of box.keys) {
        const v = chan(k, c)
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
      if (hi - lo > bestRange) { bestRange = hi - lo; bestC = c }
    }
    box.keys.sort((a, b) => chan(a, bestC) - chan(b, bestC))
    let acc = 0
    let cut = 1
    for (let i = 0; i < box.keys.length - 1; i += 1) {
      acc += hist.get(box.keys[i]) ?? 0
      cut = i + 1
      if (acc * 2 >= box.count) break
    }
    const a = box.keys.slice(0, cut)
    const b = box.keys.slice(cut)
    const sum = (ks: number[]) => ks.reduce((s, k) => s + (hist.get(k) ?? 0), 0)
    boxes.splice(bi, 1, { keys: a, count: sum(a) }, { keys: b, count: sum(b) })
  }
  const out = new Uint8Array(boxes.length * 3)
  boxes.forEach((box, i) => {
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    for (const k of box.keys) {
      const w = hist.get(k) ?? 0
      r += (k >> 10) * w
      g += ((k >> 5) & 31) * w
      b += (k & 31) * w
      n += w
    }
    out[i * 3] = Math.min(255, Math.round((r / n) * 8 + 4))
    out[i * 3 + 1] = Math.min(255, Math.round((g / n) * 8 + 4))
    out[i * 3 + 2] = Math.min(255, Math.round((b / n) * 8 + 4))
  })
  return out
}

/** Variable-width GIF LZW. Returns the code stream bytes (without sub-block framing). */
export function lzwEncode(indices: Uint8Array, minCodeSize: number): Uint8Array {
  const clear = 1 << minCodeSize
  const eoi = clear + 1
  const out: number[] = []
  let cur = 0
  let nbits = 0
  let codeSize = minCodeSize + 1
  const emit = (code: number) => {
    cur |= code << nbits
    nbits += codeSize
    while (nbits >= 8) {
      out.push(cur & 255)
      cur >>>= 8
      nbits -= 8
    }
  }
  let dict = new Map<number, number>() // (prefix<<8 | byte) -> code
  let next = eoi + 1
  emit(clear)
  if (indices.length === 0) {
    emit(eoi)
    if (nbits > 0) out.push(cur & 255)
    return Uint8Array.from(out)
  }
  let prefix = indices[0]
  for (let i = 1; i < indices.length; i += 1) {
    const c = indices[i]
    const key = (prefix << 8) | c
    const hit = dict.get(key)
    if (hit !== undefined) {
      prefix = hit
      continue
    }
    emit(prefix)
    if (next < 4096) {
      dict.set(key, next)
      if (next === 1 << codeSize) codeSize += 1
      next += 1
    } else {
      emit(clear)
      dict = new Map()
      next = eoi + 1
      codeSize = minCodeSize + 1
    }
    prefix = c
  }
  emit(prefix)
  emit(eoi)
  if (nbits > 0) out.push(cur & 255)
  return Uint8Array.from(out)
}

export function encodeGif(o: GifOptions): Uint8Array {
  const { width, height } = o
  const maxColors = o.transparent ? 255 : 256
  const body = buildPalette(o.frames, maxColors)
  const nBody = body.length / 3
  const nPal = o.transparent ? nBody + 1 : nBody
  let bits = 1
  while (1 << bits < nPal) bits += 1
  const size = 1 << bits
  const pal = new Uint8Array(size * 3)
  pal.set(body, o.transparent ? 3 : 0) // index 0 = transparent slot (black) when used
  const off = o.transparent ? 1 : 0

  // nearest-colour lookup, cached per RGB555 bucket
  const cache = new Int16Array(32768).fill(-1)
  const nearest = (r: number, g: number, b: number): number => {
    const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
    const c = cache[k]
    if (c >= 0) return c
    let best = off
    let bestD = Infinity
    for (let i = 0; i < nBody; i += 1) {
      const dr = pal[(i + off) * 3] - r
      const dg = pal[(i + off) * 3 + 1] - g
      const db = pal[(i + off) * 3 + 2] - b
      const d = dr * dr * 2 + dg * dg * 4 + db * db * 3
      if (d < bestD) { bestD = d; best = i + off }
    }
    cache[k] = best
    return best
  }

  const bytes: number[] = []
  const push = (...v: number[]) => { for (const x of v) bytes.push(x) }
  const u16 = (v: number) => push(v & 255, (v >> 8) & 255)
  push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)
  u16(width)
  u16(height)
  push(0x80 | ((bits - 1) << 4) | (bits - 1), 0, 0)
  for (const b of pal) bytes.push(b)
  if (o.loop) push(0x21, 0xff, 0x0b, ...'NETSCAPE2.0'.split('').map((c) => c.charCodeAt(0)), 3, 1, 0, 0, 0)

  const minCode = Math.max(2, bits)
  for (const f of o.frames) {
    push(0x21, 0xf9, 4, o.transparent ? 0b00001001 : 0b00000100) // disposal 2 (restore bg) / 1 when opaque
    u16(Math.max(2, Math.round(f.delay)))
    push(o.transparent ? 0 : 0, 0)
    push(0x2c)
    u16(0)
    u16(0)
    u16(width)
    u16(height)
    push(0)
    push(minCode)
    const idx = new Uint8Array(width * height)
    const d = f.data
    for (let i = 0, j = 0; j < idx.length; i += 4, j += 1) {
      idx[j] = o.transparent && d[i + 3] < 128 ? 0 : nearest(d[i], d[i + 1], d[i + 2])
    }
    const code = lzwEncode(idx, minCode)
    for (let i = 0; i < code.length; i += 255) {
      const n = Math.min(255, code.length - i)
      bytes.push(n)
      for (let k = 0; k < n; k += 1) bytes.push(code[i + k])
    }
    push(0)
  }
  push(0x3b)
  return Uint8Array.from(bytes)
}
