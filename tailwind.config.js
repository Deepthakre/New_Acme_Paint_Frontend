/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Neutral surface — a hair cooler than pure white so white cards
        // still read as "lifted" without a visible border doing all the work.
        bg: '#F6F8FA',
        panel: '#FFFFFF',
        ink: '#1B2430',
        'ink-soft': '#68727E',
        'ink-faint': '#98A1AB',
        line: '#E4E8EB',

        // Brand — a confident, industrial steel-blue. Doubles as the
        // "Factory" stage color, so the brand mark and the product's own
        // status system are literally the same color language.
        brand: '#215B82',
        'brand-dark': '#123F57',
        'brand-tint': '#E7F3F7',

        // Status palette — named after the physical stage a paint tin is
        // in, and chosen to read like an actual pigment swatch rather than
        // a generic UI hue: steel blue / ochre primer / forest green /
        // barn red / plum.
        blue: '#1E5A7A',    // factory / info
        ochre: '#C47A2C',   // in-transit / warning
        green: '#2F805A',   // in-stock / success
        red: '#BE3B4C',     // sold / alert
        violet: '#6C5896',  // verified / reward
      },
      fontFamily: {
        display: ['Sora', 'Archivo', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '12px',
        sm: '8px',
        md: '10px',
        lg: '14px',
        xl: '18px',
        '2xl': '20px',
        '3xl': '26px',
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgba(20, 29, 39, 0.04)',
        sm: '0 1px 3px 0 rgba(20, 29, 39, 0.06), 0 1px 2px -1px rgba(20, 29, 39, 0.06)',
        DEFAULT: '0 2px 6px -1px rgba(20, 29, 39, 0.07), 0 1px 2px -1px rgba(20, 29, 39, 0.05)',
        md: '0 4px 12px -2px rgba(20, 29, 39, 0.08), 0 2px 4px -2px rgba(20, 29, 39, 0.05)',
        lg: '0 12px 24px -6px rgba(20, 29, 39, 0.12), 0 4px 8px -4px rgba(20, 29, 39, 0.06)',
        pop: '0 20px 40px -12px rgba(20, 29, 39, 0.22)',
      },
      letterSpacing: {
        tightish: '-0.01em',
      },
    },
  },
  plugins: [],
};
