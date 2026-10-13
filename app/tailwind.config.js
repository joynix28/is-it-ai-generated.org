/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,css}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        canvas: {
          light: '#FAFAFA',
          dark: '#0A0A0A',
        },
        surface: {
          light: '#FFFFFF',
          dark: '#101010',
        },
        sage: {
          50: '#F2F6F3',
          200: '#C6DACB',
          600: '#4E7A5B',
          900: '#1F3A28',
        },
      },
      fontFamily: {
        // No webfonts: privacy and speed. Inter/Geist when installed, else the
        // platform UI stack. Mono for every number.
        sans: ['Inter', 'Geist', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['JetBrains Mono', 'Geist Mono', 'ui-monospace', 'SFMono-Regular', 'SF Mono', 'Menlo', 'Consolas', 'monospace'],
        reading: ['Charter', 'Bitstream Charter', 'Sitka Text', 'Cambria', 'Georgia', 'serif'],
      },
      fontSize: {
        micro: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.08em' }],
        label: ['0.75rem', { lineHeight: '1.1rem' }],
        ui: ['0.8125rem', { lineHeight: '1.25rem' }],
        body: ['0.875rem', { lineHeight: '1.5rem' }],
        read: ['1rem', { lineHeight: '1.75rem' }],
        score: ['3.25rem', { lineHeight: '1', letterSpacing: '-0.03em' }],
      },
      borderRadius: {
        // Neo-brutalist: near-square corners.
        none: '0',
        sm: '2px',
        DEFAULT: '3px',
        md: '4px',
      },
      transitionTimingFunction: {
        precise: 'cubic-bezier(0.2, 0, 0, 1)',
      },
    },
  },
  plugins: [],
};
