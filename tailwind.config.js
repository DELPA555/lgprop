/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Paleta LG Prop (tinta + teal) ──────────────────────────────
        surface: '#0a0d12', // fondo app
        card: '#11151d', // paneles
        border: '#222836', // bordes/divisores
        accent: {
          DEFAULT: '#19b7a6', // teal identidad
          soft: '#22c9b7', // hover
          dim: '#0f8b7e' // fondos/estados apagados
        },
        // ── Semánticos de estado (independientes del accent) ───────────
        ok: '#3fbf8f',
        warn: '#e0a03a',
        bad: '#e5645b',
        info: '#4fa8e0',
        // ── Texto ──────────────────────────────────────────────────────
        ink: {
          DEFAULT: '#e8ebf2',
          2: '#a6aebf',
          3: '#5f6879'
        }
      },
      fontFamily: {
        // Cuerpo / UI
        sans: ['"IBM Plex Sans"', 'Segoe UI', 'system-ui', 'sans-serif'],
        // Títulos y números
        display: ['"Space Grotesk"', 'Segoe UI', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
}
