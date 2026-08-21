import type { Config } from 'tailwindcss';
export default {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      fontFamily: { display: ['var(--font-display)'], sans: ['var(--font-sans)'], mono: ['var(--font-mono)'] },
      colors: {
        canvas: 'rgb(var(--canvas) / <alpha-value>)', surface: 'rgb(var(--surface) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)', muted: 'rgb(var(--muted) / <alpha-value>)', line: 'rgb(var(--line) / <alpha-value>)',
        navy: { DEFAULT: '#132B4A', 900: '#0B1B30', 800: '#132B4A', 700: '#1C3557', 600: '#2A4A73', 100: '#E3EAF3' },
        hazard: '#E06A10', ok: '#2E8B57', warn: '#D49A10', crit: '#C2342A', steel: '#5B6877',
      },
      boxShadow: { card: '0 1px 2px rgb(11 27 48 / .06), 0 8px 24px -12px rgb(11 27 48 / .18)' },
    },
  },
  plugins: [],
} satisfies Config;
