import { useState, useRef, useEffect } from 'react'
import { Monitor } from 'lucide-react'
import type { ThemeMode } from '@/types/models'
import { cn } from '@/utils/cn'
import { useSettingsStore, useSystemDark } from '@/store/settingsStore'
import { Tooltip } from './Tooltip'

const THEME_ORDER: ThemeMode[] = ['light', 'dark', 'system']

/**
 * Animated sun ↔ moon theme toggle.
 * In light mode a hand-drawn sun shows; in dark a crescent moon with stars.
 * "System" shows the Monitor icon and resolves via useSystemDark.
 *
 * Animation is CSS-transition based (~500ms) and disabled under reduced motion.
 */
export function ThemeToggle({ collapsed }: { collapsed: boolean }): React.ReactNode {
  const { settings, setTheme } = useSettingsStore()
  const systemDark = useSystemDark()
  const [transitioning, setTransitioning] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const resolvedDark =
    settings.theme === 'dark' || (settings.theme === 'system' && systemDark)

  const cycleTheme = (): void => {
    const idx = THEME_ORDER.indexOf(settings.theme)
    const next = THEME_ORDER[(idx + 1) % THEME_ORDER.length]
    setTransitioning(true)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setTheme(next)
    timeoutRef.current = setTimeout(() => setTransitioning(false), 520)
  }

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }, [])

  const label =
    settings.theme === 'system'
      ? `System (${systemDark ? 'dark' : 'light'})`
      : settings.theme === 'dark'
        ? 'Dark mode'
        : 'Light mode'

  const btn = (
    <button
      type="button"
      onClick={cycleTheme}
      aria-label={`Theme: ${label}. Click to switch.`}
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-wobbly-sm text-muted transition-colors hover:bg-raise hover:text-ink',
      )}
    >
      <span className="grid size-full place-items-center overflow-visible" aria-hidden="true">
        {settings.theme === 'system' ? (
          <Monitor size={26} />
        ) : (
          <svg
            viewBox="0 0 32 32"
            fill="none"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-[22px]"
          >
            {/* Sun disc — visible when light, fades/scales when dark */}
            <circle
              cx="16"
              cy="16"
              r="7"
              className={cn(
                'transition-all duration-[500ms] ease-[cubic-bezier(0.33,1,0.68,1)]',
                transitioning && 'scale-75',
                resolvedDark ? 'scale-0 opacity-0' : 'scale-100 opacity-100',
              )}
              style={{ transformOrigin: 'center', stroke: 'currentColor' }}
              fill="rgb(var(--c-accent))"
            />
            {/* Sun rays — retract in dark mode */}
            <g
              className={cn(
                'transition-all duration-[450ms] ease-[cubic-bezier(0.33,1,0.68,1)]',
                resolvedDark ? 'scale-50 opacity-0' : 'scale-100 opacity-100',
              )}
              style={{ transformOrigin: 'center', stroke: 'currentColor' }}
            >
              {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
                const rad = (deg * Math.PI) / 180
                const x1 = 16 + Math.cos(rad) * 10.5
                const y1 = 16 + Math.sin(rad) * 10.5
                const x2 = 16 + Math.cos(rad) * 13.5
                const y2 = 16 + Math.sin(rad) * 13.5
                return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} />
              })}
            </g>
            {/* Crescent moon — appears in dark mode */}
            <path
              d="M22 13.5A8.5 8.5 0 1 1 13.5 22a7 7 0 0 0 8.5-8.5z"
              className={cn(
                'transition-all duration-[500ms] ease-[cubic-bezier(0.33,1,0.68,1)]',
                resolvedDark ? 'scale-100 opacity-100' : 'scale-75 opacity-0',
              )}
              style={{ transformOrigin: 'center', stroke: 'currentColor' }}
              fill="rgb(var(--c-accent))"
            />
            {/* Stars — fade in during dark mode */}
            {[
              { cx: 25, cy: 7, r: 0.8 },
              { cx: 28, cy: 12, r: 0.6 },
              { cx: 6, cy: 8, r: 0.7 },
            ].map((s, i) => (
              <circle
                key={i}
                cx={s.cx}
                cy={s.cy}
                r={s.r}
                className={cn(
                  'transition-all duration-[600ms] ease-[cubic-bezier(0.33,1,0.68,1)]',
                  resolvedDark ? 'opacity-80' : 'opacity-0',
                )}
                style={{
                  transitionDelay: resolvedDark ? `${150 + i * 80}ms` : '0ms',
                  fill: 'currentColor',
                }}
              />
            ))}
          </svg>
        )}
      </span>
    </button>
  )

  return collapsed ? (
    <Tooltip label={label} side="right">
      {btn}
    </Tooltip>
  ) : (
    btn
  )
}
