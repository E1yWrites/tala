import { useEffect, useRef, useState } from 'react'
import { Camera, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { useSettingsStore } from '@/store/settingsStore'
import { useUIStore } from '@/store/uiStore'
import { cn } from '@/utils/cn'
import { Button } from '@/components/UI/Button'
import { processImageFile } from '@/utils/image'
import { Avatar } from '@/components/UI/Avatar'
import { Bituin } from '@/coach/Bituin'
import { BITUIN } from '@/coach/copy'
import { detectEnv } from '@/coach/env'

const AVATAR_SIZE = 256
/** Must match the formats promised in the UI copy. */
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']

type OnboardingStep = 'welcome' | 'name' | 'avatar' | 'safety' | 'complete'

function OnboardingContent(): React.ReactNode {
  const { settings, update } = useSettingsStore()
  const { setView } = useUIStore()
  // A phone or tablet tab gets a data-safety step: installed apps keep their notes protected
  const env = detectEnv()
  const steps: OnboardingStep[] =
    (env.platform === 'ios' || env.platform === 'android') && !env.standalone
      ? ['welcome', 'name', 'avatar', 'safety', 'complete']
      : ['welcome', 'name', 'avatar', 'complete']
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

  const nextStep = (): void => setStep(steps[Math.min(steps.length - 1, steps.indexOf(step) + 1)]!)
  const prevStep = (): void => setStep(steps[Math.max(0, steps.indexOf(step) - 1)]!)

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
          {steps.map((s, i) => (
            <span
              key={s}
              className={cn(
                'h-1.5 rounded-full transition-colors',
                i <= steps.indexOf(step) ? 'w-12 bg-accent' : 'w-8 bg-lineSoft',
              )}
            />
          ))}
        </div>

        {step === 'welcome' && (
          <div className="text-center space-y-4">
            <Bituin size={150} motion="wave" blink className="mx-auto" />
            <h1 className="font-display text-3xl leading-tight">Welcome to tala</h1>
            <p className="font-hand text-[20px] leading-snug text-ink">{BITUIN.welcome.title}</p>
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted">{BITUIN.welcome.body}</p>
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
              className="w-full h-12 rounded-card border border-lineSoft bg-canvas px-4 text-center text-lg outline-none transition focus:border-ballpoint focus:ring-2 focus:ring-ballpoint/20"
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
                'relative mx-auto size-24 shrink-0 rounded-full border-4 flex items-center justify-center overflow-hidden transition-colors cursor-pointer',
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
                    className="absolute bottom-0 right-0 z-10 grid size-7 translate-x-1 translate-y-1 place-items-center rounded-full border border-lineSoft bg-panel text-faint shadow-rest"
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
            <p className="text-center text-xs text-faint">JPG, PNG, WebP · Cropped to circle</p>
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

        {step === 'safety' && (
          <div className="space-y-4 text-center">
            <Bituin size={88} motion="bob" blink className="mx-auto" />
            <h1 className="font-display text-2xl leading-tight">{BITUIN.install.title}</h1>
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted">{BITUIN.install.why}</p>
            <ol className="mx-auto max-w-sm space-y-2.5 text-left">
              {(env.platform === 'ios' ? BITUIN.install.iosSteps : BITUIN.install.androidSteps).map((line, i) => (
                <li key={line} className="flex gap-3 text-sm leading-relaxed">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent text-2xs font-medium text-accent-fg">
                    {i + 1}
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
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
          </div>
        )}

        {step === 'complete' && (
          <div className="text-center space-y-6">
            <Bituin size={130} motion="cheer" blink className="mx-auto" />
            <div className="space-y-1">
              <h1 className="font-display text-2xl leading-tight">You're all set, {name.trim() || 'there'}!</h1>
              <p className="text-muted">Your workspace is ready. Galing!</p>
            </div>
            <Button variant="primary" size="md" className="w-full" onClick={completeOnboarding}>
              <span className="flex items-center justify-center gap-2">
                Start Using Tala
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