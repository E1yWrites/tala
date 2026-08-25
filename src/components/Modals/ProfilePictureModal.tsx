import { useCallback, useRef, useState } from 'react'
import { Camera, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { processImageFile } from '@/utils/image'
import { useSettingsStore } from '@/store/settingsStore'
import { Modal } from '@/components/UI/Modal'
import { Button } from '@/components/UI/Button'
import { Avatar } from '@/components/UI/Avatar'
import { cn } from '@/utils/cn'

const AVATAR_SIZE = 256
/** Must match the formats promised in the UI copy. */
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function ProfilePictureModal({ onClose }: { onClose: () => void }): React.ReactNode {
  const { settings, update } = useSettingsStore()
  const currentAvatar = settings.profile.avatar ?? null
  const [preview, setPreview] = useState<string | null>(currentAvatar)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const canvasDivRef = useRef<HTMLDivElement>(null)

  const cropAndResize = useCallback(
    (dataUrl: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          const canvas = canvasRef.current
          if (!canvas) return reject(new Error('Canvas not available'))
          const ctx = canvas.getContext('2d')
          if (!ctx) return reject(new Error('Canvas context not available'))

          const size = AVATAR_SIZE
          canvas.width = size
          canvas.height = size

          const sourceSize = Math.min(img.width, img.height)
          const sourceX = (img.width - sourceSize) / 2
          const sourceY = (img.height - sourceSize) / 2

          ctx.drawImage(img, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size)

          const keepAlpha = dataUrl.startsWith('data:image/png') || dataUrl.startsWith('data:image/webp')
          resolve(canvas.toDataURL(keepAlpha ? 'image/png' : 'image/jpeg', keepAlpha ? undefined : 0.9))
        }
        img.onerror = () => reject(new Error('Failed to load image'))
        img.src = dataUrl
      })
    },
    [],
  )

  const handleFileSelect = async (file: File): Promise<void> => {
    if (!AVATAR_TYPES.includes(file.type)) {
      toast.error('Unsupported file type', {
        description: 'Please choose a JPG, PNG or WebP image.',
      })
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error('That picture is too large', { description: 'Maximum size is 8 MB.' })
      return
    }
    try {
      const dataUrl = await processImageFile(file)
      const cropped = await cropAndResize(dataUrl)
      setPreview(cropped)
    } catch {
      toast.error("Couldn't read that image", {
        description: 'The file may be corrupted — try a different picture.',
      })
    }
  }

  const handleDrop = useCallback(
    (e: React.DragEvent): void => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) void handleFileSelect(file)
    },
    [],
  )

  const handleDragOver = useCallback((e: React.DragEvent): void => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent): void => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const triggerFileInput = (): void => {
    fileInputRef.current?.click()
  }

  const saveAvatar = async (): Promise<void> => {
    await update({ profile: { ...settings.profile, avatar: preview } })
    toast.success(preview ? 'Profile picture updated' : 'Profile picture removed')
    onClose()
  }

  const removeAvatar = (): void => {
    setPreview(null)
  }

  const hasAvatar = preview !== null && preview !== ''
  const dirty = preview !== currentAvatar

  return (
    <Modal
      onClose={onClose}
      title="Profile Picture"
      subtitle="Choose or remove your profile picture"
      size="sm"
      standalone
    >
      <div className="p-5 space-y-4">
        <div
          ref={canvasDivRef}
          className="mx-auto"
          style={{ display: 'none' }}
          aria-hidden="true"
        >
          <canvas ref={canvasRef} />
        </div>
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            'relative mx-auto size-24 shrink-0 rounded-full border-4 border-dashed flex items-center justify-center overflow-hidden transition-colors cursor-pointer',
            isDragging ? 'border-accent bg-accent-soft' : 'border-lineSoft hover:border-ballpoint/40',
          )}
        >
          {hasAvatar ? (
            <img
              src={preview}
              alt="Profile picture preview"
              className="size-full object-cover"
            />
          ) : (
            <>
              {/* Live placeholder — exactly what the sidebar will show */}
              <div className="absolute inset-0">
                <Avatar src={null} name={settings.profile.name} size="xl" className="size-full border-0" />
              </div>
              <span
                className="absolute bottom-0 right-0 z-10 grid size-7 translate-x-1 translate-y-1 place-items-center rounded-full border-2 border-line bg-panel text-faint shadow-sketch-sm"
                aria-hidden="true"
              >
                <Camera className="size-3.5" />
              </span>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="absolute inset-0 opacity-0 cursor-pointer"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleFileSelect(file)
            }}
            aria-label="Choose profile picture"
          />
        </div>
        <p className="text-center text-xs text-faint">JPG, PNG, WebP · Max 8 MB · Cropped to circle</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="primary" size="sm" onClick={triggerFileInput} disabled={isDragging}>
            <Camera className="size-3.5 mr-1.5" aria-hidden="true" />
            Change Profile Picture
          </Button>
          {(hasAvatar || currentAvatar) && (
            <Button variant="ghost" size="sm" onClick={removeAvatar} disabled={!hasAvatar} className="text-accent">
              <Trash2 className="size-3.5 mr-1.5" aria-hidden="true" />
              Remove Profile Picture
            </Button>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={() => void saveAvatar()} disabled={isDragging || !dirty}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  )
}