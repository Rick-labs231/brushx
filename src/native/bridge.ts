// The Android app (Capacitor) can't use <a download>, so saving goes through the
// native Filesystem + Share plugins. Written against window.Capacitor so the web
// build needs no extra packages.
interface CapacitorGlobal {
  isNativePlatform?: () => boolean
  Plugins?: Record<string, Record<string, (o: unknown) => Promise<{ uri?: string }>>>
}

const cap = (): CapacitorGlobal | undefined => (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor

export const isNativeApp = (): boolean => {
  try { return !!cap()?.isNativePlatform?.() } catch { return false }
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(r.error)
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.readAsDataURL(blob)
  })
}

/** Saves a file in the Android app and opens the share sheet (save to Files, WhatsApp, Drive…). Returns false if it can't. */
export async function shareNativeFile(blob: Blob, filename: string): Promise<boolean> {
  const p = cap()?.Plugins
  const fs = p?.Filesystem
  const share = p?.Share
  if (!isNativeApp() || !fs || !share) return false
  const written = await fs.writeFile({ path: filename, data: await toBase64(blob), directory: 'CACHE' })
  await share.share({ title: filename, url: written.uri, dialogTitle: 'Save or send' })
  return true
}
