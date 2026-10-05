import type { Config } from 'tailwindcss';
export default {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      fontFamily: { display: ['var(--font-display)'], sans: ['var(--font-sans)'], brand: ['var(--font-brand)'], mono: ['var(--font-mono)'] },
      colors: {
        canvas: 'rgb(var(--canvas) / <alpha-value>)', surface: 'rgb(var(--surface) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)', muted: 'rgb(var(--muted) / <alpha-value>)', line: 'rgb(var(--line) / <alpha-value>)',
        // SR Drilling & Mining brand (srdmining.com): deep blue + gold. Gold is an accent for dark surfaces, fills and
        // borders only — as text on white it is unreadable (1.8:1), so warnings and highlighted text use the darker `hazard` amber (5.1:1).
        navy: { DEFAULT: '#092F53', 900: '#061F38', 800: '#092F53', 700: '#1C3954', 600: '#2E5680', 100: '#E4EBF3' },
        gold: '#F6B839', hazard: '#9A6100', ok: '#2E8B57', warn: '#D49A10', crit: '#C2342A', steel: '#5B6877',
      },
      boxShadow: { card: '0 1px 2px rgb(6 31 56 / .06), 0 8px 24px -12px rgb(6 31 56 / .18)' },
    },
  },
  plugins: [],
} satisfies Config;
