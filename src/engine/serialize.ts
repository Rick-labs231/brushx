import { uid } from './ids.ts'
import type { Project } from './types.ts'

// Bitmaps (from merge-down) are raw bytes; JSON needs base64.

function toBase64(bytes: Uint8Array | Uint8ClampedArray): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(bin)
}

function fromBase64(b64: string): Uint8ClampedArray {
  const bin = atob(b64)
  const out = new Uint8ClampedArray(bin.length)
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
  return out
}

export const FILE_KIND = 'brushx-project'

export function projectToJSON(p: Project): string {
  return JSON.stringify(
    { kind: FILE_KIND, version: 1, project: p },
    (_key, value) => {
      if (value instanceof Uint8ClampedArray) return { __bytes: toBase64(value) }
      if (value instanceof Uint8Array) return { __u8: toBase64(value) }
      return value
    },
  )
}

export class ProjectFileError extends Error {}

/** Parses a .brushx file exactly as saved (same id, name and times). Used for cloud copies. */
export function parseProjectFile(text: string): Project {
  let raw: unknown
  try {
    raw = JSON.parse(text, (_k, v) => (v && typeof v === 'object' && typeof (v as { __bytes?: unknown }).__bytes === 'string' ? fromBase64((v as { __bytes: string }).__bytes) : v && typeof v === 'object' && typeof (v as { __u8?: unknown }).__u8 === 'string' ? new Uint8Array(fromBase64((v as { __u8: string }).__u8)) : v))
  } catch {
    throw new ProjectFileError('That file isn’t a Brush X project.')
  }
  const env = raw as { kind?: string; project?: Project }
  const p = env?.project
  if (env?.kind !== FILE_KIND || !p || !Array.isArray(p.layers) || !Array.isArray(p.frames) || !p.width || !p.height) {
    throw new ProjectFileError('That file isn’t a Brush X project.')
  }
  if (p.layers.length === 0 || p.frames.length === 0) throw new ProjectFileError('This project has no layers or frames.')
  return p
}

/** Parses a .brushx file for import. Gives the project a fresh id so imports never overwrite. */
export function projectFromJSON(text: string): Project {
  const p = parseProjectFile(text)
  return { ...p, id: uid(), name: `${p.name} (imported)`, updatedAt: Date.now(), archived: false }
}
