import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  // relative paths so the same build works at a site root, in a sub-folder (GitHub Pages) and inside the Android app
  base: './',
  plugins: [react()],
  // the update check compares this with the newest GitHub release
  define: { __APP_VERSION__: JSON.stringify(version) },
})
