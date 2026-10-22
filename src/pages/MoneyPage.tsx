import { useMemo, useState } from 'react'
import { ChevronRight, Plus } from 'lucide-react'
import { CATEGORIES, categoryLabel, categoryOf } from '@/entries/categories'
import { balances, monthSummary, safeToSpend } from '@/entries/money'
import type { Account, MoneyRef, SafeToSpend } from '@/entries/money'
import { accountName, formatDay, formatPeso } from '@/entries/parse'
import { ISIP } from '@/isip/copy'
import { foodMix, gymFood, planLine, priceChanges, recurring } from '@/isip/insights'
import { captureLine } from '@/components/QuickCapture'
import type { FoodMix, GymFood, PriceChange, Recurring } from '@/isip/insights'
import { addAccount, removeAccount, renameAccount, setBalance, setCategory, setKeep, useMoneyStore } from '@/library/money'
import { useEntries } from '@/components/Agenda/useAgenda'
import { QuickCapture } from '@/components/QuickCapture'
import { DropdownMenu } from '@/components/UI/DropdownMenu'
import { CARD, PlannerSection, PlannerView } from '@/components/Planner/PlannerView'
import { useUIStore } from '@/store/uiStore'
import { cn } from '@/utils/cn'

const monthName = new Intl.DateTimeFormat(undefined, { month: 'long' })
const parseAmount = (s: string): number => Number(s.replace(/[₱,\s]/g, '').replace(/^p(hp)?/i, ''))

/** Money from every ₱ Entry: safe to spend today, accounts, this month by category, the lines themselves. */
export function MoneyPage(): React.ReactNode {
  const { refs, today } = useEntries()
  const { accounts, keep, categories } = useMoneyStore()
  const safe = useMemo(() => safeToSpend(refs, accounts, keep, today), [refs, accounts, keep, today])
  const bal = useMemo(() => balances(refs, accounts), [refs, accounts])
  const month = useMemo(() => monthSummary(refs, today.slice(0, 7), categories), [refs, today, categories])
  const maxCat = month.byCategory[0]?.[1] ?? 1
  const mix = useMemo(() => foodMix(refs, today), [refs, today])
  const back = useMemo(() => recurring(refs), [refs])
  const prices = useMemo(() => priceChanges(refs).slice(0, 8), [refs])
  const gym = useMemo(() => gymFood(refs, today), [refs, today])

  return (
    <PlannerView
      label={ISIP.money.title}
      title={ISIP.money.title}
      note={ISIP.money.note}
      aside={
        <>
          <PlannerSection id="money-accounts" title={ISIP.money.accounts}>
            <ul className={CARD}>
              {accounts.map((a) => (
                <AccountRow key={a.id} account={a} balance={bal.get(a.id) ?? 0} canRemove={accounts.length > 1} />
              ))}
              <li className="flex min-h-11 items-center border-b border-lineSoft bg-shelf/60 px-3.5 text-[14px]">
                <span className="flex-1 font-medium text-muted">{ISIP.money.allAccounts}</span>
                <span className="font-semibold tabular-nums">{formatPeso(Math.round(safe.total))}</span>
              </li>
              <AddAccount />
            </ul>
            <KeepRow keep={keep} />
          </PlannerSection>

          {month.lines.length > 0 && (
            <PlannerSection id="money-lines" title={ISIP.money.lines}>
              <ul className={CARD}>
                {month.lines.slice(0, 50).map((r, i) => (
                  <MoneyLine key={`${r.isip}-${i}`} r={r} category={r.entry.category ?? categoryOf(r.entry.text, categories)} />
                ))}
              </ul>
            </PlannerSection>
          )}
        </>
      }
    >
      <QuickCapture />
      <SafeCard safe={safe} keep={keep} />

      <PlannerSection id="money-month" title={monthName.format(new Date())}>
        {month.byCategory.length === 0 ? (
          <p className="rounded-card border border-dashed border-lineSoft px-4 py-3 text-sm text-muted">
            {ISIP.empty.money}
          </p>
        ) : (
          <div className={CARD}>
            <dl className="flex gap-6 border-b border-lineSoft px-3.5 py-2.5 text-[14px]">
              <div className="flex items-baseline gap-1.5">
                <dt className="text-muted">{ISIP.money.spent}</dt>
                <dd className="font-semibold tabular-nums">{formatPeso(month.spent)}</dd>
              </div>
              {month.income > 0 && (
                <div className="flex items-baseline gap-1.5">
                  <dt className="text-muted">{ISIP.money.in}</dt>
                  <dd className="font-semibold tabular-nums">{formatPeso(month.income)}</dd>
                </div>
              )}
            </dl>
            <ul className="px-3.5 py-2">
            {month.byCategory.map(([cat, amount]) => (
              <li key={cat} className="py-1.5">
                <div className="flex justify-between text-[13px]">
                  <span>{cat}</span>
                  <span className="tabular-nums text-muted">{formatPeso(amount)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-raise">
                  <div className="h-full origin-left rounded-full bg-accent" style={{ transform: `scaleX(${amount / maxCat})` }} />
                </div>
                {cat === 'Food' && month.food.some(([sub]) => sub !== 'Food') && (
                  <ul aria-label={ISIP.insight.food.byKind} className="mt-1.5 space-y-0.5 pl-3">
                    {month.food.map(([sub, n]) => (
                      <li key={sub} className="flex justify-between text-xs text-muted">
                        <span>{sub === 'Food' ? ISIP.insight.food.other : sub}</span>
                        <span className="tabular-nums">{formatPeso(n)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
            </ul>
          </div>
        )}
      </PlannerSection>

      {mix && <FoodMixCard mix={mix} />}
      {gym && <GymFoodCard gym={gym} />}
      {back.length > 0 && (
        <RecurringCard
          list={back}
          planned={new Set(refs.flatMap((r) => (r.entry.kind === 'event' && r.entry.repeat && r.entry.amount ? [r.entry.amount] : [])))}
        />
      )}
      {prices.length > 0 && <PricesCard list={prices} />}
    </PlannerView>
  )
}

function FoodMixCard({ mix }: { mix: FoodMix }): React.ReactNode {
  const c = ISIP.insight.food
  const rows: Array<[string, number]> = [[c.groceries, mix.groceries], [c.eatingOut, mix.eatingOut], [c.delivery, mix.delivery]]
  const max = Math.max(...rows.map((r) => r[1]), 1)
  return (
    <PlannerSection id="money-food-mix" title={c.title}>
      <div className={cn(CARD, 'px-3.5 py-2')}>
        <ul>
          {rows.map(([label, n]) => (
            <li key={label} className="py-1.5">
              <div className="flex justify-between text-[13px]">
                <span>{label}</span>
                <span className="tabular-nums text-muted">{formatPeso(n)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-raise">
                <div className="h-full origin-left rounded-full bg-accent" style={{ transform: `scaleX(${n / max})` }} />
              </div>
            </li>
          ))}
        </ul>
        <p className="pb-1 pt-1.5 text-xs text-faint">{c.note}</p>
      </div>
    </PlannerSection>
  )
}

function GymFoodCard({ gym }: { gym: GymFood }): React.ReactNode {
  const c = ISIP.insight.gym
  return (
    <PlannerSection id="money-gym-food" title={c.title}>
      <div className={cn(CARD, 'px-3.5 py-3')}>
        <dl className="flex gap-8 text-[14px]">
          {([[c.gym, gym.gym], [c.rest, gym.rest]] as const).map(([label, n]) => (
            <div key={label}>
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="font-semibold tabular-nums">
                {formatPeso(Math.round(n))} <span className="text-xs font-normal text-faint">{c.perDay}</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-1.5 text-xs text-faint">{c.note(gym.gymDays, gym.restDays)}</p>
      </div>
    </PlannerSection>
  )
}

/** Costs that come back; one tap plans one as a repeating bill, so safe to spend counts it before it is due. */
function RecurringCard({ list, planned }: { list: Recurring[]; planned: Set<number> }): React.ReactNode {
  const c = ISIP.insight.recurring
  return (
    <PlannerSection id="money-recurring" title={c.title}>
      <ul className={CARD}>
        {list.map((r) => (
          <li key={`${r.amount}|${r.category}`} className="flex min-h-12 items-center gap-3 border-b border-lineSoft px-3.5 py-2 last:border-b-0">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px]">{r.text || categoryLabel(r.category)}</span>
              <span className="block truncate text-xs text-faint">
                {c.every(r.every)} · {c.next(formatDay(r.next))}
              </span>
            </span>
            <span className="shrink-0 text-[14px] font-semibold tabular-nums">{formatPeso(r.amount)}</span>
            {planned.has(r.amount) ? (
              <span className="shrink-0 text-xs text-faint">{c.planned}</span>
            ) : (
              <button
                type="button"
                onClick={() => captureLine(planLine(r))}
                aria-label={c.planLabel(formatPeso(r.amount), r.text || categoryLabel(r.category))}
                className="min-h-9 shrink-0 rounded-control border border-lineSoft px-3 text-xs font-semibold transition-[border-color,transform] duration-150 ease-out hover:border-line active:scale-[0.97] [@media(pointer:coarse)]:min-h-11"
              >
                {c.plan}
              </button>
            )}
          </li>
        ))}
      </ul>
    </PlannerSection>
  )
}

function PricesCard({ list }: { list: PriceChange[] }): React.ReactNode {
  const c = ISIP.insight.prices
  return (
    <PlannerSection id="money-prices" title={c.title}>
      <ul className={CARD}>
        {list.map((p) => (
          <li key={p.name.toLowerCase()} className="flex min-h-12 items-center gap-3 border-b border-lineSoft px-3.5 py-2 last:border-b-0">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px]">{p.name}</span>
              <span className="block truncate text-xs text-faint">{c.change(p.last, p.prev)}</span>
            </span>
            <span className="shrink-0 text-[14px] font-semibold tabular-nums">{formatPeso(p.last)}</span>
          </li>
        ))}
      </ul>
    </PlannerSection>
  )
}

/**
 * Today's share of what's left until money comes in, said as a sentence. Going
 * over is said plainly, never in red: tomorrow's share already takes it in.
 */
export function SafeCard({ safe, keep, compact = false }: { safe: SafeToSpend; keep: number; compact?: boolean }): React.ReactNode {
  const over = safe.leftToday < 0
  const until = `${formatDay(safe.until)}${safe.incomeName ? ` · ${safe.incomeName}` : ''}`
  // From tomorrow, what is left spreads over one day fewer
  const fromTomorrow = safe.days > 1 ? Math.max(0, (safe.total - keep - safe.bills) / (safe.days - 1)) : 0
  return (
    <div className={cn(CARD, 'px-4 py-3.5')}>
      <p className="text-[21px] font-bold leading-snug tracking-[-0.02em]">
        <span className="tabular-nums">{formatPeso(Math.round(Math.abs(safe.leftToday)))}</span>{' '}
        <span className={over ? '' : 'font-semibold text-muted'}>{over ? ISIP.money.over : ISIP.money.toSpend}</span>
      </p>
      <p className="mt-0.5 text-[13px] text-muted">
        {over && safe.days > 1
          ? ISIP.money.fromTomorrow(formatPeso(Math.round(fromTomorrow)), until)
          : ISIP.money.perDay(formatPeso(Math.round(Math.max(0, safe.perDay))), until)}
      </p>
      {!compact && <Runway days={safe.days} over={over} />}
      {!compact && (
        <p className="mt-2 text-xs tabular-nums text-faint">
          {ISIP.money.spentToday(formatPeso(safe.spentToday))}
          {safe.bills > 0 && ISIP.money.bills(formatPeso(safe.bills))}
          {keep > 0 && ISIP.money.keeping(formatPeso(keep))}
        </p>
      )}
      {!compact && !safe.incomeName && (
        <p className="mt-2 text-xs text-muted">
          {ISIP.money.noIncome}
        </p>
      )}
    </div>
  )
}

/** The days the money has to last, plotted like the week in the rail: today first, the income day last. */
function Runway({ days, over }: { days: number; over: boolean }): React.ReactNode {
  const n = Math.min(days, 31)
  return (
    <div aria-hidden="true" className="relative mt-3 flex h-3 items-center justify-between">
      <span className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-lineSoft" />
      {Array.from({ length: n + 1 }, (_, i) => (
        <span
          key={i}
          className={cn(
            'relative rounded-full',
            i === 0
              ? cn('size-3 border-2', over ? 'border-accent bg-panel' : 'border-accent bg-accent')
              : i === n
                ? 'size-2.5 border-[1.5px] border-accent bg-panel'
                : 'size-1.5 bg-line/60',
          )}
        />
      ))}
    </div>
  )
}

function AccountRow({ account, balance, canRemove }: { account: Account; balance: number; canRemove: boolean }): React.ReactNode {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [name, setName] = useState(account.name)
  const [error, setError] = useState('')
  return (
    <li className="border-b border-lineSoft last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center gap-2 px-3.5 text-left hover:bg-raise"
      >
        <ChevronRight size={14} className={cn('shrink-0 text-faint transition-transform', open && 'rotate-90')} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-[14px]">{account.name}</span>
        <span className="shrink-0 text-xs text-faint">{account.tag}</span>
        <span className="w-24 shrink-0 text-right text-[14px] font-semibold tabular-nums">
          {formatPeso(balance)}
        </span>
      </button>
      {open && (
        <form
          className="space-y-2 px-3.5 pb-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim() !== account.name && !renameAccount(account.id, name)) return setError(ISIP.money.wordTaken)
            const n = parseAmount(amount)
            if (amount.trim() && Number.isFinite(n)) setBalance(account.id, n)
            setAmount('')
            setError('')
            setOpen(false)
          }}
        >
          <label className="flex items-center gap-2 text-xs text-muted">
            <span className="w-16 shrink-0">{ISIP.money.hasNow}</span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={formatPeso(balance)}
              aria-label={ISIP.money.hasNowLabel(account.name)}
              className="h-9 min-w-0 flex-1 rounded-control border border-lineSoft bg-canvas px-2.5 text-sm text-ink tabular-nums"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-muted">
            <span className="w-16 shrink-0">{ISIP.money.name}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label={ISIP.money.nameLabel}
              className="h-9 min-w-0 flex-1 rounded-control border border-lineSoft bg-canvas px-2.5 text-sm text-ink"
            />
          </label>
          <p className="text-xs text-faint">
            {ISIP.money.useWord(account.tag)}
          </p>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-between">
            {canRemove ? (
              <button type="button" onClick={() => removeAccount(account.id)} className="text-xs font-medium text-danger hover:underline">
                {ISIP.money.removeAccount}
              </button>
            ) : (
              <span />
            )}
            <button type="submit" className="rounded-control bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg">
              {ISIP.money.save}
            </button>
          </div>
        </form>
      )}
    </li>
  )
}

function AddAccount(): React.ReactNode {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  return (
    <li>
      <form
        className="flex items-center gap-2 px-3.5 py-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          if (!addAccount(name)) return setError(ISIP.money.nameTaken)
          setName('')
          setError('')
        }}
      >
        <Plus size={14} className="shrink-0 text-faint" aria-hidden="true" />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={ISIP.money.addPlaceholder}
          aria-label={ISIP.money.addLabel}
          className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
        />
        {error && <span className="shrink-0 text-xs text-danger">{error}</span>}
      </form>
    </li>
  )
}

function KeepRow({ keep }: { keep: number }): React.ReactNode {
  const [value, setValue] = useState(keep ? String(keep) : '')
  return (
    <label className="mt-2 flex items-center gap-2 px-1 text-xs text-muted">
      <span className="min-w-0 flex-1">{ISIP.money.keep}</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => setKeep(parseAmount(value || '0'))}
        placeholder="₱0"
        aria-label={ISIP.money.keepLabel}
        className="h-8 w-28 shrink-0 rounded-control border border-lineSoft bg-panel px-2 text-sm text-ink tabular-nums"
      />
    </label>
  )
}

function MoneyLine({ r, category }: { r: MoneyRef; category: string }): React.ReactNode {
  const openEntry = useUIStore((s) => s.openEntry)
  const e = r.entry
  // A choice is saved under the merchant or first word Isip read
  const word = r.key ?? e.text.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  const sign = e.flow === 'in' ? '+' : e.flow === 'out' ? '−' : ''
  return (
    <li className="flex items-center border-b border-lineSoft last:border-b-0">
      <button type="button" onClick={() => r.isip && openEntry(r.isip)} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 pl-3.5 text-left hover:bg-raise">
        <span className="w-12 shrink-0 text-xs tabular-nums text-faint">{formatDay(e.day).replace(/^\w+,\s*/, '')}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px]">{e.text || (e.flow === 'move' ? ISIP.money.transfer : ISIP.money.untitled)}</span>
          <span className="block truncate text-xs text-faint">
            {e.flow === 'move' ? `${accountName(e.account!)} → ${accountName(e.to!)}` : e.account ? accountName(e.account) : ''}
          </span>
        </span>
        <span className={cn('shrink-0 pr-2 text-[14px] font-semibold tabular-nums', e.flow === 'in' && 'text-accent')}>
          {sign}
          {formatPeso(e.amount)}
        </span>
      </button>
      {e.flow === 'out' && word ? (
        <DropdownMenu
          items={CATEGORIES.map((c) => ({ id: c, label: categoryLabel(c), checked: c === category, onSelect: () => setCategory(word, c) }))}
          trigger={(props) => (
            <button
              {...props}
              type="button"
              aria-label={ISIP.money.categoryFor(word, categoryLabel(category))}
              className="mr-2 shrink-0 rounded-full border border-lineSoft px-2 py-0.5 text-[11px] font-medium text-muted hover:border-line hover:text-ink"
            >
              {categoryLabel(category)}
            </button>
          )}
        />
      ) : (
        <span className="mr-2 w-0" />
      )}
    </li>
  )
}
