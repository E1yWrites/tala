import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { KeyboardEventHandler, ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/utils/cn'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

const SIZE_CLASSES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
} as const

interface ModalProps {
  onClose: () => void
  children: ReactNode
  /** Optional built-in header. Null/false renders no header (spotlight style). */
  title?: string | null
  subtitle?: string
  size?: keyof typeof SIZE_CLASSES
  /** Accessible label — id of the modal's heading element */
  labelledBy?: string
  ariaLabel?: string
  className?: string
  /** Align panel near the top (command palette style) or centered */
  align?: 'center' | 'top'
  /** Disable closing on backdrop click (e.g. destructive confirms) */
  dismissable?: boolean
  /** Auto-focus the first focusable element on open (default true) */
  initialFocus?: boolean
  /** Capture-phase key handling for arrow-key navigation (panel-scoped) */
  onKeyDownCapture?: KeyboardEventHandler<HTMLDivElement>
}

/**
 * Portal modal with washi-tape decoration, wobbly pencil border,
 * hard offset shadow, focus trap and click-outside dismissal.
 * Esc is handled globally via the modal stack.
 */
export function Modal({
  onClose,
  children,
  title,
  subtitle,
  size = 'md',
  labelledBy,
  ariaLabel,
  className,
  align = 'center',
  dismissable = true,
  initialFocus = true,
  onKeyDownCapture,
}: ModalProps): ReactNode {
  const panelRef = useRef<HTMLDivElement>(null)
  const headingId = useId()

  // Initial focus + focus trap
  useEffect(() => {
    if (!initialFocus) return
    const panel = panelRef.current
    if (!panel) return
    const previous = document.activeElement as HTMLElement | null
    window.setTimeout(() => {
      // Respect an explicit autoFocus target (e.g. ConfirmDialog's danger button)
      if (
        document.activeElement instanceof HTMLElement &&
        panel.contains(document.activeElement)
      ) {
        return
      }
      const first = panel.querySelector<HTMLElement>(FOCUSABLE)
      ;(first ?? panel).focus()
    }, 0)

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab') return
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusables.length === 0) return
      // If focus escaped the panel entirely, pull it back in
      if (!panel.contains(document.activeElement)) {
        e.preventDefault()
        focusables[0]!.focus()
        return
      }
      const firstEl = focusables[0]
      const lastEl = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }
    panel.addEventListener('keydown', onKeyDown)
    return () => {
      panel.removeEventListener('keydown', onKeyDown)
      previous?.focus?.()
    }
  }, [initialFocus])

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-40 flex justify-center bg-black/40 px-4 pb-4 animate-fade-in',
        align === 'center' ? 'items-center' : 'items-start pt-[12vh]',
      )}
      onMouseDown={(e) => {
        if (dismissable && e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? headingId : labelledBy}
        aria-label={title ? undefined : ariaLabel}
        tabIndex={-1}
        onKeyDownCapture={onKeyDownCapture}
        className={cn(
          'relative w-full outline-none animate-scale-in',
          SIZE_CLASSES[size],
          className,
        )}
      >
        {/* Washi tape straddling the top edge */}
        <span className="tape" aria-hidden="true" />
        <div className="overflow-hidden rounded-wobbly-md border-2 border-line bg-overlay shadow-sketch-lg">
          {title != null && (
            <header className="flex items-start justify-between gap-3 px-5 pt-4">
              <div className="min-w-0">
                <h2 id={headingId} className="font-display text-xl leading-snug">
                  {title}
                </h2>
                {subtitle && (
                  <p className="mt-0.5 truncate text-xs text-muted">{subtitle}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="-mr-1 grid size-8 shrink-0 place-items-center rounded-wobbly-sm text-faint transition-all duration-150 hover:rotate-90 hover:bg-raise hover:text-ink"
              >
                <X className="size-4" strokeWidth={2.5} />
              </button>
            </header>
          )}
          <div className={cn(title != null && 'px-5 pt-3 pb-5')}>{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
