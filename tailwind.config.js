/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bench: { 950: '#0b0e12', 900: '#11151b', 850: '#161b22', 800: '#1c222b', 700: '#262e39', 600: '#333d4b', 500: '#4a5566' },
        accent: { DEFAULT: '#f5a524', soft: '#f5a52433' },
      },
      fontFamily: { mono: ['ui-monospace', 'Consolas', 'monospace'] },
    },
  },
  plugins: [],
};
