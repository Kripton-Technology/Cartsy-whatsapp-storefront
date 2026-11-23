/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Direct CSS Palette - Light Mode SaaS (Images 1, 2, 3)
        'tea-green': 'rgb(var(--color-brand-cream-rgb) / <alpha-value>)',
        'dusty-olive': '#64748b',
        'black': '#0f172a',
        'carbon-black': '#ffffff',
        'charcoal-brown': '#e2e8f0',
        'dusty-olive-2': '#94a3b8',
        'muted-teal': '#64748b',
        'celadon': '#334155',
        'celadon-2': '#1e293b',
        'tea-green-2': '#ecfdf5',

        // Dynamic theme tokens that automatically adjust with light/dark theme
        brand: {
          dark: 'rgb(var(--color-brand-dark-rgb) / <alpha-value>)',
          card: 'rgb(var(--color-brand-card-rgb) / <alpha-value>)',
          steel: 'rgb(var(--color-brand-steel-rgb) / <alpha-value>)',
          slate: 'rgb(var(--color-brand-slate-rgb) / <alpha-value>)',
          gray: 'rgb(var(--color-brand-gray-rgb) / <alpha-value>)',
          bronze: 'rgb(var(--color-brand-bronze-rgb) / <alpha-value>)',
          cream: 'rgb(var(--color-brand-cream-rgb) / <alpha-value>)',
          header: 'rgb(var(--color-text-header-rgb) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse-slow 10s infinite ease-in-out',
      },
      keyframes: {
        'pulse-slow': {
          '0%, 100%': { opacity: '0.3', transform: 'scale(1) translate(0, 0)' },
          '50%': { opacity: '0.5', transform: 'scale(1.1) translate(10px, -10px)' },
        },
      },
    },
  },
  plugins: [],
};

