import type { ReactNode } from 'react'
import { Button } from './Button'
import { Modal } from './Modal'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
  /** Forwarded to Modal when the dialog lives outside the store stack */
  standalone?: boolean
}

/** Destructive-action confirmation. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = true,
  onConfirm,
  onCancel,
  standalone = false,
}: ConfirmDialogProps): ReactNode {
  if (!open) return null
  return (
    <Modal
      onClose={onCancel}
      ariaLabel={title}
      dismissable={false}
      className="max-w-sm"
      standalone={standalone}
    >
      <div className="p-5">
        <h2 className="font-display text-xl leading-snug">{title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} size="sm" onClick={onConfirm} autoFocus>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
