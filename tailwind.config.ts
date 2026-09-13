import type { Config } from 'tailwindcss'

/**
 * Tala design tokens — Hand-Drawn ("sunlight & moonlight") theme.
 * Colors are defined as RGB channel triplets in src/index.css and mapped here,
 * so light/dark themes only swap CSS variables.
 *
 * Hard offset shadows and wobbly radii are theme-aware via CSS variables:
 * light mode draws solid pencil offsets, dark mode uses faint chalk lifts.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Patrick Hand"', '"Comic Sans MS"', 'cursive'],
        display: ['Kalam', '"Patrick Hand"', 'cursive'],
        body: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        canvas: 'rgb(var(--c-canvas) / <alpha-value>)',
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
        postit: {
          DEFAULT: 'rgb(var(--c-postit) / <alpha-value>)',
          ink: 'rgb(var(--c-postit-ink) / <alpha-value>)',
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
        sketch: 'var(--sketch-shadow)',
        'sketch-sm': 'var(--sketch-shadow-sm)',
        'sketch-lg': 'var(--sketch-shadow-lg)',
      },
      borderRadius: {
        wobbly: '255px 15px 225px 15px / 15px 225px 15px 255px',
        'wobbly-md': '105px 12px 115px 12px / 12px 115px 12px 105px',
        'wobbly-sm': '35px 8px 45px 8px / 8px 45px 8px 35px',
        'wobbly-blob': '58% 42% 55% 45% / 48% 55% 45% 52%',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96) rotate(-1.25deg) translateY(6px)' },
          to: { opacity: '1', transform: 'scale(1) rotate(0deg) translateY(0)' },
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
        'popover-in': {
          from: { opacity: '0', transform: 'scale(0.96) translateY(-4px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' },
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
        'popover-in': 'popover-in 140ms cubic-bezier(0.16, 1, 0.3, 1)',
        'note-collapse': 'note-collapse 200ms ease-in forwards',
        'note-expand': 'note-expand 240ms cubic-bezier(0.16, 1, 0.3, 1)',
        'star-pop': 'star-pop 400ms cubic-bezier(0.2, 0.9, 0.3, 1.2)',
        'pin-wobble': 'pin-wobble 350ms cubic-bezier(0.2, 0.9, 0.3, 1.2)',
      },
    },
  },
  plugins: [],
} satisfies Config
