import type { Config } from 'tailwindcss'

/**
 * Tala design tokens, taken from the app icon (tile green, star yellow).
 * Colors are RGB channel triplets in src/index.css mapped here, so light and
 * dark only swap CSS variables. Roles: green = actions, gold = stars only
 * (Bituin, Study days, starred notes), ballpoint = ink, links and focus,
 * red = destructive, rail = the green navigation column.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  // Touch fakes a hover on tap and leaves it stuck; hover: utilities apply only where a pointer hovers
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Hanken Grotesk Variable"', 'system-ui', '-apple-system', 'sans-serif'],
        // One face: titles are the same family, set larger and heavier
        display: ['"Hanken Grotesk Variable"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        canvas: 'rgb(var(--c-canvas) / <alpha-value>)',
        shelf: 'rgb(var(--c-shelf) / <alpha-value>)',
        rail: {
          DEFAULT: 'rgb(var(--c-rail) / <alpha-value>)',
          well: 'rgb(var(--c-rail-well) / <alpha-value>)',
          active: 'rgb(var(--c-rail-active) / <alpha-value>)',
          line: 'rgb(var(--c-rail-line) / <alpha-value>)',
          fg: 'rgb(var(--c-rail-fg) / <alpha-value>)',
          muted: 'rgb(var(--c-rail-muted) / <alpha-value>)',
        },
        panel: 'rgb(var(--c-panel) / <alpha-value>)',
        raise: 'rgb(var(--c-raise) / <alpha-value>)',
        overlay: 'rgb(var(--c-overlay) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        lineSoft: 'rgb(var(--c-line-soft) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        faint: 'rgb(var(--c-faint) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--c-accent) / <alpha-value>)',
          strong: 'rgb(var(--c-accent-strong) / <alpha-value>)',
          soft: 'rgb(var(--c-accent-soft) / <alpha-value>)',
          fg: 'rgb(var(--c-accent-fg) / <alpha-value>)',
        },
        gold: {
          DEFAULT: 'rgb(var(--c-gold) / <alpha-value>)',
          soft: 'rgb(var(--c-gold-soft) / <alpha-value>)',
          ink: 'rgb(var(--c-gold-ink) / <alpha-value>)',
          fg: 'rgb(var(--c-gold-fg) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'rgb(var(--c-danger) / <alpha-value>)',
          soft: 'rgb(var(--c-danger-soft) / <alpha-value>)',
        },
        selected: {
          DEFAULT: 'rgb(var(--c-selected) / <alpha-value>)',
          ink: 'rgb(var(--c-selected-ink) / <alpha-value>)',
        },
        ballpoint: {
          DEFAULT: 'rgb(var(--c-ballpoint) / <alpha-value>)',
          soft: 'rgb(var(--c-ballpoint-soft) / <alpha-value>)',
        },
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        rest: 'var(--shadow-rest)',
        raise: 'var(--shadow-raise)',
        float: 'var(--shadow-float)',
        sheet: 'var(--shadow-sheet)',
      },
      borderRadius: {
        surface: '14px',
        card: '10px',
        control: '8px',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97) translateY(6px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'editor-in': {
          from: { opacity: '0', transform: 'translateX(24px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'drawer-in': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },
        wiggle: {
          '0%, 100%': { transform: 'rotate(-1.5deg)' },
          '50%': { transform: 'rotate(1.5deg)' },
        },
        'bounce-soft': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
        'pen-pop-in': {
          from: { opacity: '0', transform: 'scale(0.85)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'pen-pop-out': {
          from: { opacity: '1', transform: 'scale(1)' },
          to: { opacity: '0', transform: 'scale(0.85)' },
        },
        'pen-node': {
          from: { opacity: '0', transform: 'scale(0.6)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'pen-swap': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'note-collapse': {
          from: { opacity: '1', transform: 'scale(1)' },
          to: { opacity: '0', transform: 'scale(0.92) translateX(-8px)' },
        },
        'note-expand': {
          from: { opacity: '0', transform: 'scale(0.94)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'star-pop': {
          '0%': { transform: 'scale(0.5) rotate(-12deg)', opacity: '0' },
          '60%': { transform: 'scale(1.25) rotate(5deg)', opacity: '1' },
          '100%': { transform: 'scale(1) rotate(0deg)', opacity: '1' },
        },
        'pin-wobble': {
          '0%': { transform: 'rotate(-8deg) scale(0.8)' },
          '40%': { transform: 'rotate(6deg) scale(1.1)' },
          '100%': { transform: 'rotate(0deg) scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'scale-in': 'scale-in 180ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up': 'slide-up 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        'editor-in': 'editor-in 240ms cubic-bezier(0.16, 1, 0.3, 1)',
        'drawer-in': 'drawer-in 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        wiggle: 'wiggle 3s ease-in-out infinite',
        'bounce-soft': 'bounce-soft 3s ease-in-out infinite',
        'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite',
        'pen-pop-in': 'pen-pop-in 180ms cubic-bezier(0.16, 1, 0.3, 1)',
        'pen-pop-out': 'pen-pop-out 130ms ease-in forwards',
        'pen-node': 'pen-node 170ms cubic-bezier(0.16, 1, 0.3, 1) backwards',
        'pen-swap': 'pen-swap 140ms ease-out',
        'note-collapse': 'note-collapse 200ms ease-in forwards',
        'note-expand': 'note-expand 240ms cubic-bezier(0.16, 1, 0.3, 1)',
        'star-pop': 'star-pop 400ms cubic-bezier(0.16, 1, 0.3, 1)',
        'pin-wobble': 'pin-wobble 350ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config
