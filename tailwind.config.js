/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta LG Prop
        surface: '#0b0d12',
        card: '#12151c',
        border: '#232833',
        accent: {
          DEFAULT: '#2563eb', // azul inmobiliario
          soft: '#3b82f6'
        }
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
}
