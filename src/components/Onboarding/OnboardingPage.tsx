import { useEffect, useRef, useState } from 'react'
import { Camera, ArrowRight, AudioLines, FileUp, HardDrive, PenLine } from 'lucide-react'
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

  const stepIndex = steps.indexOf(step)

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      {/* The green side: what Tala is, and the setup plotted as stars */}
      <aside className="flex shrink-0 flex-col bg-rail px-6 py-5 text-rail-fg md:w-[42%] md:max-w-[520px] md:px-12 md:py-12">
        <div className="flex items-center gap-2.5">
          <img src={`${import.meta.env.BASE_URL}app-icon-192.png`} alt="" width={30} height={30} className="size-[30px] rounded-[8px]" />
          <span className="text-[21px] font-bold tracking-[-0.02em]">Tala</span>
        </div>
        <div className="my-auto hidden pt-10 md:block">
          <StepSky count={steps.length} current={stepIndex} />
          <p className="mt-8 text-[30px] font-bold leading-[1.15] tracking-[-0.025em]">
            A notebook for lectures, kept on this device.
          </p>
          <ul className="mt-6 space-y-3.5 text-[14.5px] leading-snug text-rail-muted">
            <PromiseRow icon={PenLine}>Type and write with a pen on the same page.</PromiseRow>
            <PromiseRow icon={FileUp}>Import PDF slides and mark them up, even offline.</PromiseRow>
            <PromiseRow icon={AudioLines}>Record the lecture alongside your notes.</PromiseRow>
            <PromiseRow icon={HardDrive}>No account. Notes stay here unless you export or share them.</PromiseRow>
          </ul>
        </div>
        <p className="hidden text-xs text-rail-muted md:block">Pagtatala, made simple.</p>
      </aside>

      <main className="flex flex-1 items-center justify-center bg-panel px-6 py-10 md:px-12">
      <div className="w-full max-w-[400px] space-y-8">
        {/* Step indicator (phone; the sky shows it on wider screens) */}
        <div className="flex items-center justify-center gap-1.5 md:hidden" aria-hidden="true">
          {steps.map((s, i) => (
            <span
              key={s}
              className={cn('h-1.5 rounded-full transition-colors', i <= stepIndex ? 'w-10 bg-ink' : 'w-6 bg-lineSoft')}
            />
          ))}
        </div>
        <p className="sr-only" aria-live="polite">{`Step ${stepIndex + 1} of ${steps.length}`}</p>

        {step === 'welcome' && (
          <div className="space-y-4 text-center md:text-left">
            <Bituin size={112} motion="wave" blink className="mx-auto md:mx-0" />
            <h1 className="text-[30px] font-bold leading-tight tracking-[-0.025em]">Welcome to Tala</h1>
            <p className="text-[16px] font-semibold leading-snug text-ink">{BITUIN.welcome.title}</p>
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted md:mx-0">{BITUIN.welcome.body}</p>
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
            className="space-y-4 text-center md:text-left"
            onSubmit={(e) => {
              e.preventDefault()
              if (name.trim()) nextStep()
            }}
          >
            <h1 className="font-bold tracking-[-0.02em] text-2xl leading-tight">What should we call you?</h1>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoFocus
              aria-label="Your name"
              required
              className="h-12 w-full rounded-control border border-line bg-panel px-4 text-center text-lg outline-none transition focus:border-ballpoint focus:ring-2 focus:ring-ballpoint/20 md:text-left"
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
          <div className="space-y-4 text-center md:text-left">
            <h1 className="font-bold tracking-[-0.02em] text-2xl leading-tight">Add a profile picture</h1>
            <p className="text-sm text-muted">Choose a picture so you can personalize your workspace.</p>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={cn(
                'relative mx-auto md:mx-0 size-24 shrink-0 rounded-full border-4 flex items-center justify-center overflow-hidden transition-colors cursor-pointer',
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
            <p className="text-xs text-faint">JPG, PNG or WebP, cropped to a circle. It stays on this device.</p>
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
          <div className="space-y-4 text-center md:text-left">
            <Bituin size={72} blink className="mx-auto md:mx-0" />
            <h1 className="font-bold tracking-[-0.02em] text-2xl leading-tight">{BITUIN.install.title}</h1>
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted md:mx-0">{BITUIN.install.why}</p>
            <ol className="mx-auto max-w-sm space-y-2.5 text-left md:mx-0">
              {(env.platform === 'ios' ? BITUIN.install.iosSteps : BITUIN.install.androidSteps).map((line, i) => (
                <li key={line} className="flex gap-3 text-sm leading-relaxed">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-ink text-2xs font-semibold tabular-nums text-panel">
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
          <div className="space-y-6 text-center md:text-left">
            <Bituin size={96} motion="cheer" blink className="mx-auto md:mx-0" />
            <div className="space-y-1">
              <h1 className="font-bold tracking-[-0.02em] text-2xl leading-tight">You're all set, {name.trim() || 'there'}!</h1>
              <p className="text-muted">Three things worth knowing:</p>
            </div>
            <ol className="space-y-3 text-left text-sm leading-relaxed">
              <TipRow n={1} title="Type or Write">Tap Write in a note for the pen. The tools sit on the page edge.</TipRow>
              <TipRow n={2} title="Record">Record a lecture while you write; tap a stroke later to hear that moment.</TipRow>
              <TipRow n={3} title="Back up">Notes live on this device only. Save a backup from Settings now and then.</TipRow>
            </ol>
            <Button variant="primary" size="md" className="w-full" onClick={completeOnboarding}>
              <span className="flex items-center justify-center gap-2">
                Start Using Tala
                <ArrowRight className="size-4" />
              </span>
            </Button>
          </div>
        )}
      </div>
      </main>
    </div>
  )
}

function TipRow({ n, title, children }: { n: number; title: string; children: React.ReactNode }): React.ReactNode {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-ink text-2xs font-semibold tabular-nums text-panel">{n}</span>
      <span>
        <span className="font-semibold">{title}.</span> <span className="text-muted">{children}</span>
      </span>
    </li>
  )
}

/** One promise on the green side. */
function PromiseRow({ icon: Icon, children }: { icon: typeof PenLine; children: React.ReactNode }): React.ReactNode {
  return (
    <li className="flex items-start gap-3">
      <Icon size={17} className="mt-0.5 shrink-0 text-gold" aria-hidden="true" />
      <span className="text-rail-fg/90">{children}</span>
    </li>
  )
}

/** Setup progress as a small constellation: done and current steps are lit and joined. */
function StepSky({ count, current }: { count: number; current: number }): React.ReactNode {
  const pts = Array.from({ length: count }, (_, i) => {
    const x = 12 + (i * 216) / Math.max(1, count - 1)
    const y = [40, 16, 30, 10, 26][i % 5]!
    return [x, y] as const
  })
  const lit = pts.slice(0, current + 1)
  return (
    <svg viewBox="0 0 240 52" className="h-[72px] w-[330px]" aria-hidden="true">
      {lit.length > 1 && (
        <polyline points={lit.map((p) => p.join(',')).join(' ')} fill="none" stroke="rgb(var(--c-gold))" strokeOpacity={0.7} strokeWidth={1} />
      )}
      {pts.map(([x, y], i) =>
        i <= current ? (
          <circle key={i} cx={x} cy={y} r={i === current ? 5 : 3.5} fill="rgb(var(--c-gold))" />
        ) : (
          <circle key={i} cx={x} cy={y} r={2.5} fill="none" stroke="rgb(var(--c-rail-muted))" strokeWidth={1.1} />
        ),
      )}
    </svg>
  )
}

export function OnboardingPage(): React.ReactNode {
  return (
    <div className="h-full overflow-y-auto bg-panel animate-fade-in">
      <OnboardingContent />
    </div>
  )
}