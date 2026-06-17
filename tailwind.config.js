/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f4f8',
          100: '#d9e2ec',
          200: '#bcccdc',
          300: '#9fb3c8',
          400: '#829ab1',
          500: '#627d98',
          600: '#486581',
          700: '#334e68',
          800: '#243b53',
          900: '#102a43',
          950: '#061826',
        },
        navy: {
          50: '#f2f5f9',
          100: '#e2eaf3',
          200: '#c9d8e8',
          300: '#a4bed8',
          400: '#779cc3',
          500: '#567fb0',
          600: '#426595',
          700: '#37527a',
          800: '#304665',
          900: '#2b3c55',
          950: '#1c2640',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
