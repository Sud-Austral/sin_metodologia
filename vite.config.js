import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Publicado en GitHub Pages bajo https://sud-austral.github.io/sin_metodologia/
export default defineConfig({
  base: '/sin_metodologia/',
  plugins: [react()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          react: ['react', 'react-dom', 'react-markdown'],
          exportar: ['jspdf', 'jszip'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
})
