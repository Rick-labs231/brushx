let counter = 0

/** Short unique id. Works in browsers, Node and tests. */
export function uid(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c && typeof c.randomUUID === 'function') return c.randomUUID().slice(0, 13)
  counter += 1
  return `${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 7)}`
}
