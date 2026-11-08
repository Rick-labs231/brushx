/** 0.9 s for small projects; about 4x the last save time (up to 5 s) for large ones, so saving never hogs the screen. */
export function autosaveDelay(lastMs: number) {
  return Math.round(Math.min(5000, Math.max(900, Number.isFinite(lastMs) ? lastMs * 4 : 0)))
}
