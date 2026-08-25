import { useEffect, useRef, useState } from 'react'
import { Camera, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { useSettingsStore } from '@/store/settingsStore'
import { useUIStore } from '@/store/uiStore'
import { cn } from '@/utils/cn'
import { Button } from '@/components/UI/Button'
import { processImageFile } from '@/utils/image'
import { Avatar } from '@/components/UI/Avatar'
import brandMarkUrl from '@/assets/icons/light/notely_set_N.png'

const AVATAR_SIZE = 256
/** Must match the formats promised in the UI copy. */
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']

type OnboardingStep = 'welcome' | 'name' | 'avatar' | 'complete'

function OnboardingContent(): React.ReactNode {
  const { settings, update } = useSettingsStore()
  const { setView } = useUIStore()
  const [step, setStep] = useState<OnboardingStep>('welcome')
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState<string | null>(settings.profile.avatar ?? null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(settings.profile.avatar ?? null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const cropAndResize = async (dataUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
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
  }

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
      setAvatarPreview(cropped)
      setAvatar(cropped)
    } catch {
      toast.error("Couldn't read that image", {
        description: 'The file may be corrupted — try a different picture.',
      })
    }
  }

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) void handleFileSelect(file)
  }

  const handleDragOver = (e: React.DragEvent): void => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent): void => {
    e.preventDefault()
    setIsDragging(false)
  }

  const nextStep = (): void => {
    if (step === 'welcome') setStep('name')
    else if (step === 'name') setStep('avatar')
    else if (step === 'avatar') setStep('complete')
  }

  const prevStep = (): void => {
    if (step === 'name') setStep('welcome')
    else if (step === 'avatar') setStep('name')
    else if (step === 'complete') setStep('avatar')
  }

  const completeOnboarding = async (): Promise<void> => {
    await update({
      profile: { ...settings.profile, name: name.trim(), avatar },
      setupCompleted: true,
    })
    setView({ kind: 'home' })
  }

  // Escape key skips the wizard entirely
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') void completeOnboarding()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, avatar])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10 animate-fade-in">
      <div className="w-full max-w-md space-y-8">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2">
          {(['welcome', 'name', 'avatar', 'complete'] as OnboardingStep[]).map((s, i) => (
            <span
              key={s}
              className={cn(
                'h-1.5 rounded-full transition-colors',
                i < (['welcome', 'name', 'avatar', 'complete'].indexOf(step)) ? 'w-12 bg-accent' : 'w-8 bg-lineSoft',
              )}
            />
          ))}
        </div>

        {step === 'welcome' && (
          <div className="text-center space-y-4">
            <img
              src={brandMarkUrl}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="mx-auto size-20 -rotate-3 animate-wiggle drop-shadow-sm"
            />
            <h1 className="font-display text-3xl leading-tight">Welcome to Notely</h1>
            <p className="text-muted">Let's get your workspace ready.</p>
            <Button variant="primary" size="md" className="w-full" onClick={nextStep}>
              <span className="flex items-center justify-center gap-2">
                Get Started
                <ArrowRight className="size-4" />
              </span>
            </Button>
          </div>
        )}

        {step === 'name' && (
          <form
            className="text-center space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (name.trim()) nextStep()
            }}
          >
            <h1 className="font-display text-2xl leading-tight">What should we call you?</h1>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoFocus
              aria-label="Your name"
              required
              className="w-full h-12 rounded-wobbly-md border-2 border-line bg-canvas px-4 text-center text-lg outline-none transition focus:border-ballpoint focus:ring-2 focus:ring-ballpoint/20"
              maxLength={40}
            />
            <div className="flex gap-3">
              <Button variant="ghost" size="md" type="button" className="flex-1" onClick={prevStep}>
                Back
              </Button>
              <Button variant="primary" size="md" type="submit" className="flex-1" disabled={!name.trim()}>
                <span className="flex items-center justify-center gap-2">
                  Continue
                  <ArrowRight className="size-4" />
                </span>
              </Button>
            </div>
          </form>
        )}

        {step === 'avatar' && (
          <div className="text-center space-y-4">
            <h1 className="font-display text-2xl leading-tight">Add a profile picture</h1>
            <p className="text-sm text-muted">Choose a picture so you can personalize your workspace.</p>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={cn(
                'relative mx-auto size-24 shrink-0 rounded-full border-4 border-dashed flex items-center justify-center overflow-hidden transition-colors cursor-pointer',
                isDragging ? 'border-accent bg-accent-soft' : 'border-lineSoft hover:border-ballpoint/40',
              )}
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="Profile picture preview" className="size-full object-cover" />
              ) : (
                <>
                  {/* Live placeholder — exactly what appears if they skip */}
                  <div className="absolute inset-0">
                    <Avatar src={null} name={name} size="xl" className="size-full border-0" />
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
            <div className="flex gap-3">
              <Button variant="ghost" size="md" className="flex-1" onClick={prevStep}>
                Back
              </Button>
              <Button variant="primary" size="md" className="flex-1" onClick={nextStep}>
                <span className="flex items-center justify-center gap-2">
                  Continue
                  <ArrowRight className="size-4" />
                </span>
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setAvatar(null); setAvatarPreview(null); nextStep(); }}>
              Skip for now
            </Button>
          </div>
        )}

        {step === 'complete' && (
          <div className="text-center space-y-6">
            <Avatar src={avatar} name={name} size="xl" />
            <div className="space-y-1">
              <h1 className="font-display text-2xl leading-tight">You're all set, {name.trim() || 'there'}!</h1>
              <p className="text-muted">Your workspace is ready.</p>
            </div>
            <Button variant="primary" size="md" className="w-full" onClick={completeOnboarding}>
              <span className="flex items-center justify-center gap-2">
                Start Using Notely
                <ArrowRight className="size-4" />
              </span>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export function OnboardingPage(): React.ReactNode {
  return (
    <div className="flex h-full flex-col bg-canvas animate-fade-in">
      <OnboardingContent />
    </div>
  )
}