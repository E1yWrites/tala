/**
 * Ambient types for lucide's deep ESM entry.
 *
 * The app resolves `lucide-react` to `src/lib/lucideShim.tsx` at build time
 * (see vite.config.ts). To avoid an alias recursion inside the shim itself,
 * the shim imports this deep path instead — re-exporting the real package's
 * types keeps every call site fully type-checked.
 */
declare module 'lucide-react/dist/esm/lucide-react.mjs' {
  export * from 'lucide-react'
}
