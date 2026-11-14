import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    // Exponemos al renderer las variables VITE_* (Supabase, etc.)
    envPrefix: ['VITE_', 'RENDERER_VITE_'],
    resolve: {
      alias: {
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          // Separar las librerías pesadas en chunks propios. Las de PDF
          // (pdf-lib, pdfjs) quedan en su propio chunk y sólo se descargan
          // cuando se usa una función de PDF, no al arrancar la app.
          manualChunks(id: string): string | undefined {
            if (!id.includes('node_modules')) return undefined
            if (id.includes('pdfjs-dist')) return 'vendor-pdfjs'
            if (id.includes('pdf-lib')) return 'vendor-pdflib'
            if (id.includes('react-dom') || id.includes('/react/') || id.includes('react-router'))
              return 'vendor-react'
            if (id.includes('@supabase')) return 'vendor-supabase'
            if (id.includes('@tanstack')) return 'vendor-query'
            if (id.includes('lucide-react')) return 'vendor-icons'
            if (id.includes('date-fns')) return 'vendor-datefns'
            if (id.includes('@fontsource')) return undefined
            return 'vendor'
          }
        }
      }
    }
  }
})
