import type { Config } from 'tailwindcss'
import tokens from './src/tokens.json'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: tokens.colors,
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono Variable"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { chunk: '22px' },
      transitionTimingFunction: {
        spring: 'cubic-bezier(.34,1.4,.5,1)',
        press: 'cubic-bezier(.3,.7,.4,1)',
      },
    },
  },
  plugins: [],
} satisfies Config
