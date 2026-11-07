import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // relative paths so the same build works at a site root, in a sub-folder (GitHub Pages) and inside the Android app
  base: './',
  plugins: [react()],
})
