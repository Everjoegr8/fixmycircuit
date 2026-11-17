/** @type {import('tailwindcss').Config} */
// Theme colours come from CSS variables (see src/renderer/src/index.css) so the
// same class names work in dark and light mode.
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;
const ramp = (pal, shades) => Object.fromEntries(shades.map((s) => [s, v(`${pal}-${s}`)]));

module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bench: ramp('bench', [950, 900, 850, 800, 700, 600, 500]),
        slate: ramp('slate', [100, 200, 300, 400, 500, 600]),
        amber: ramp('amber', [100, 200, 300, 400, 500]),
        cyan: ramp('cyan', [200, 300, 400, 500]),
        green: ramp('green', [200, 300, 400, 500]),
        red: ramp('red', [200, 300, 400, 500]),
        sky: ramp('sky', [100, 200, 300, 500]),
        accent: { DEFAULT: v('amber-500'), soft: 'rgb(var(--c-amber-500) / 0.2)' },
      },
      fontFamily: {
        sans: ['"Segoe UI Variable Text"', '"Segoe UI Variable"', '"Segoe UI"', 'system-ui', '-apple-system', 'Roboto', 'sans-serif'],
        display: ['"Segoe UI Variable Display"', '"Segoe UI Variable"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'Cascadia Mono', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
