export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16)
  if (Number.isNaN(n)) return [0, 0, 0]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

export function rgba(hex: string, a: number) {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r},${g},${b},${a})`
}

export function isValidHex(v: string) {
  return /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim())
}

export function normalizeHex(v: string) {
  let h = v.trim().replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  return `#${h.toLowerCase()}`
}

/** h 0..360, s and v 0..1 */
export type Hsv = { h: number; s: number; v: number }

export function rgbToHsv(r: number, g: number, b: number): Hsv {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const d = max - Math.min(R, G, B)
  let h = 0
  if (d > 0) {
    if (max === R) h = ((G - B) / d) % 6
    else if (max === G) h = (B - R) / d + 2
    else h = (R - G) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const hh = (((h % 360) + 360) % 360) / 60
  const c = v * s
  const x = c * (1 - Math.abs((hh % 2) - 1))
  const m = v - c
  const [r, g, b] = hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

export const hexToHsv = (hex: string): Hsv => rgbToHsv(...hexToRgb(hex))
export const hsvToHex = (h: number, s: number, v: number): string => rgbToHex(...hsvToRgb(h, s, v))

/** A big swatch grid: greys, then 12 hues in 6 shades from light to dark. Uppercase hex. */
export function buildPaletteGrid(): string[] {
  const out: string[] = []
  for (let i = 0; i < 12; i += 1) out.push(hsvToHex(0, 0, 1 - i / 11).toUpperCase())
  const shades: [number, number][] = [[0.25, 1], [0.5, 1], [0.8, 1], [1, 1], [1, 0.75], [1, 0.5]] // [s, v]
  for (const [s, v] of shades) {
    for (let k = 0; k < 12; k += 1) out.push(hsvToHex(k * 30, s, v).toUpperCase())
  }
  return out
}
