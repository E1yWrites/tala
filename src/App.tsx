import { Component, useRef } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { toast, Toaster } from 'sonner'
import { CheckSoft, Info } from 'lucide-react'
import { bootApp } from '@/database/hydration'
import { useSettingsStore } from '@/store/settingsStore'
import { AppShell } from '@/components/layout/AppShell'

/** Removes the index.html splash with a short fade. */
function dismissSplash(): void {
  const el = document.getElementById('splash')
  if (!el) return
  el.style.opacity = '0'
  window.setTimeout(() => el.remove(), 280)
}

/**
 * The splash is part of the brand — hold it on screen for a beat even when
 * the app boots instantly, so it never flashes by unreadably fast.
 */
const SPLASH_MIN_MS = 1500
const splashShownAt = Date.now()

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[notely] render error', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="grid h-full place-items-center p-6 text-center">
          <div className="max-w-sm">
            <p className="font-display text-xl">Something went wrong</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              An unexpected error occurred while rendering Notely. Your notes are safe on this device.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-wobbly-sm border-[3px] border-line bg-accent px-4 py-2 text-sm text-white shadow-sketch transition-all hover:-translate-y-0.5 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none dark:text-charcoal"
            >
              Reload Notely
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App(): React.ReactNode {
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  // 'blocked' = another tab holds the DB; 'slow' = hydration watchdog fired.
  const [bootHint, setBootHint] = useState<'none' | 'blocked' | 'slow'>('none')
  const theme = useSettingsStore((s) => s.settings.theme)
  const warnedRef = useRef(false)

  useEffect(() => {
    const onBlocked = () => {
      setBootHint((h) => (h === 'none' ? 'blocked' : h))
      if (!warnedRef.current) {
        warnedRef.current = true
        toast.warning('Database is locked by another Notely tab', {
          description: 'Close other Notely tabs or windows, then reload.',
          duration: 15000,
        })
      }
    }
    window.addEventListener('notely:db-blocked', onBlocked)
    const slowTimer = window.setTimeout(() => {
      setBootHint((h) => (h === 'none' ? 'slow' : h))
    }, 10000)

    bootApp()
      .then(() => {
        clearTimeout(slowTimer)
        setReady(true)
      })
      .catch((err) => {
        console.error('[notely] boot failed', err)
        clearTimeout(slowTimer)
        setFailed(true)
      })

    return () => {
      window.removeEventListener('notely:db-blocked', onBlocked)
      clearTimeout(slowTimer)
    }
  }, [])

  useEffect(() => {
    if (!(ready || failed || bootHint !== 'none')) return
    const remaining = Math.max(0, SPLASH_MIN_MS - (Date.now() - splashShownAt))
    const t = window.setTimeout(dismissSplash, remaining)
    return () => window.clearTimeout(t)
  }, [ready, failed, bootHint])

  return (
    <>
      <Toaster
        position="bottom-right"
        theme={theme}
        gap={8}
        icons={{ success: <CheckSoft className="size-4" />, info: <Info className="size-4" /> }}
        toastOptions={{
          style: {
            background: 'rgb(var(--c-overlay))',
            color: 'rgb(var(--c-ink))',
            border: '2px solid rgb(var(--c-line))',
            borderRadius: '14px 10px 16px 9px',
            fontFamily: "'Patrick Hand', cursive",
            fontSize: '15px',
            boxShadow: '4px 4px 0 0 rgb(0 0 0 / 0.12)',
          },
        }}
      />
      {failed ? (
        <div className="grid h-full place-items-center p-6 text-center">
          <div className="max-w-sm">
            <p className="font-display text-xl">Notely could not start</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Local storage may be unavailable or corrupted. Try reloading; if the problem persists,
              clear this site&rsquo;s data in your browser settings.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-wobbly-sm border-[3px] border-line bg-accent px-4 py-2 text-sm text-white shadow-sketch transition-all hover:-translate-y-0.5 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none dark:text-charcoal"
            >
              Reload
            </button>
          </div>
        </div>
      ) : ready ? (
        <ErrorBoundary>
          <AppShell />
        </ErrorBoundary>
      ) : bootHint !== 'none' ? (
        <div className="grid h-full place-items-center p-6 text-center">
          <div className="max-w-sm">
            <p className="font-display text-xl">
              {bootHint === 'blocked' ? 'Waiting for another tab…' : 'Still loading…'}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              {bootHint === 'blocked'
                ? 'Another Notely tab or window is holding this browser profile’s database. Close the other tab, then reload Notely.'
                : 'Loading your notes is taking longer than expected. Your data is safe — try reloading.'}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-wobbly-sm border-[3px] border-line bg-accent px-4 py-2 text-sm text-white shadow-sketch transition-all hover:-translate-y-0.5 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none dark:text-charcoal"
            >
              Reload Notely
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
