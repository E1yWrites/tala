import { useSyncExternalStore } from 'react'
import { Bituin } from '@/coach/Bituin'
import { BITUIN } from '@/coach/copy'
import { canPromptInstall, detectEnv, onInstallAvailabilityChange, promptInstall } from '@/coach/env'
import { useUIStore } from '@/store/uiStore'
import { Button } from '@/components/UI/Button'
import { Modal } from '@/components/UI/Modal'

/** Platform-specific steps for putting Tala on the Home Screen, with Bituin explaining why it matters. */
export function InstallGuideModal(): React.ReactNode {
  const close = useUIStore((s) => s.closeModal)
  const env = detectEnv()
  const canInstall = useSyncExternalStore(onInstallAvailabilityChange, canPromptInstall)
  const steps = env.platform === 'ios' ? BITUIN.install.iosSteps : BITUIN.install.androidSteps

  return (
    <Modal title={BITUIN.install.title} onClose={close} size="sm">
      <div className="flex items-start gap-3">
        <Bituin size={64} motion="bob" blink />
        <p className="text-sm leading-relaxed text-muted">{BITUIN.install.why}</p>
      </div>

      {env.standalone ? (
        <p className="mt-4 rounded-card bg-accent-soft px-3 py-2 text-sm text-ink">{BITUIN.install.done}</p>
      ) : (
        <ol className="mt-4 space-y-2.5">
          {steps.map((step, i) => (
            <li key={step} className="flex gap-3 text-sm leading-relaxed">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent text-2xs font-medium text-accent-fg">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-5 flex justify-end gap-2">
        {canInstall && !env.standalone && (
          <Button
            variant="primary"
            onClick={() => {
              void promptInstall()
              close()
            }}
          >
            Install now
          </Button>
        )}
        <Button variant={canInstall && !env.standalone ? 'ghost' : 'primary'} onClick={close}>
          Got it
        </Button>
      </div>
    </Modal>
  )
}
