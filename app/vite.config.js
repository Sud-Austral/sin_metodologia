import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/sin_metodologia/',
  plugins: [react(), tailwindcss()],
  worker: {
    format: 'es',
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
