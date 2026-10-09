import { useMemo, useState } from 'react'
import { ChevronRight, Plus } from 'lucide-react'
import { balances, CATEGORIES, categoryOf, monthSummary, safeToSpend } from '@/entries/money'
import type { Account, MoneyRef } from '@/entries/money'
import { accountName, formatDay, formatPeso } from '@/entries/parse'
import { addAccount, removeAccount, renameAccount, setBalance, setCategory, setKeep, useMoneyStore } from '@/library/money'
import { useEntries } from '@/components/Agenda/useAgenda'
import { QuickCapture } from '@/components/QuickCapture'
import { DropdownMenu } from '@/components/UI/DropdownMenu'
import { SidebarToggle } from '@/components/layout/SidebarToggle'
import { useUIStore } from '@/store/uiStore'
import { cn } from '@/utils/cn'

const monthName = new Intl.DateTimeFormat(undefined, { month: 'long' })
const label = 'text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint'
const card = 'overflow-hidden rounded-card border border-lineSoft bg-panel'
const parseAmount = (s: string): number => Number(s.replace(/[₱,\s]/g, '').replace(/^p(hp)?/i, ''))

/** Money from every ₱ line: safe to spend today, accounts, this month by category, the lines themselves. */
export function MoneyPage(): React.ReactNode {
  const { refs, today } = useEntries()
  const { accounts, keep, categories } = useMoneyStore()
  const safe = useMemo(() => safeToSpend(refs, accounts, keep, today), [refs, accounts, keep, today])
  const bal = useMemo(() => balances(refs, accounts), [refs, accounts])
  const month = useMemo(() => monthSummary(refs, today.slice(0, 7), categories), [refs, today, categories])
  const maxCat = month.byCategory[0]?.[1] ?? 1

  return (
    <section aria-label="Money" className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="flex items-center gap-2 px-4 pb-2 pt-4">
        <SidebarToggle className="-ml-1" />
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-snug tracking-[-0.02em]">Money</h1>
          <p className="text-xs text-faint">From every ₱ line in your notes</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-24 pt-2">
        <QuickCapture />

        <SafeCard safe={safe} keep={keep} />

        <section aria-labelledby="money-accounts">
          <h2 id="money-accounts" className={cn(label, 'mb-1.5 px-1')}>
            Accounts · {formatPeso(Math.round(safe.total))}
          </h2>
          <ul className={card}>
            {accounts.map((a) => (
              <AccountRow key={a.id} account={a} balance={bal.get(a.id) ?? 0} canRemove={accounts.length > 1} />
            ))}
            <AddAccount />
          </ul>
          <KeepRow keep={keep} />
        </section>

        <section aria-labelledby="money-month">
          <h2 id="money-month" className={cn(label, 'mb-1.5 px-1')}>
            {monthName.format(new Date())} · spent {formatPeso(month.spent)}
            {month.income > 0 && ` · in ${formatPeso(month.income)}`}
          </h2>
          {month.byCategory.length === 0 ? (
            <p className="rounded-card border border-dashed border-lineSoft px-4 py-3 text-sm text-muted">
              No spending yet this month. Write “P150 lunch gcash” in any note.
            </p>
          ) : (
            <ul className={cn(card, 'px-3 py-2')}>
              {month.byCategory.map(([cat, amount]) => (
                <li key={cat} className="py-1.5">
                  <div className="flex justify-between text-[13px]">
                    <span>{cat}</span>
                    <span className="tabular-nums text-muted">{formatPeso(amount)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-raise">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(amount / maxCat) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {month.lines.length > 0 && (
          <section aria-labelledby="money-lines">
            <h2 id="money-lines" className={cn(label, 'mb-1.5 px-1')}>
              Lines this month
            </h2>
            <ul className={card}>
              {month.lines.slice(0, 50).map((r) => (
                <MoneyLine key={`${r.pageId}|${r.ink ?? r.path.join('.')}`} r={r} category={categoryOf(r.entry.text, categories)} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </section>
  )
}

/** The baon meter: today's share of what's left until money comes in. */
export function SafeCard({ safe, keep, compact = false }: { safe: ReturnType<typeof safeToSpend>; keep: number; compact?: boolean }): React.ReactNode {
  const over = safe.leftToday < 0
  const until = `${formatDay(safe.until)}${safe.incomeName ? ` (${safe.incomeName})` : ''}`
  return (
    <div className={cn(card, 'px-4 py-3.5')}>
      <p className={label}>Safe to spend today</p>
      <p className={cn('mt-1 text-[32px] font-bold leading-none tracking-[-0.02em] tabular-nums', over && 'text-danger')}>
        {formatPeso(Math.round(Math.max(0, safe.leftToday)))}
      </p>
      <p className="mt-1.5 text-sm text-muted">
        {over
          ? `${formatPeso(Math.round(-safe.leftToday))} over today’s share`
          : `${formatPeso(Math.round(Math.max(0, safe.perDay)))} a day until ${until}`}
      </p>
      {!compact && (
        <p className="mt-0.5 text-xs text-faint">
          Spent today {formatPeso(safe.spentToday)}
          {safe.bills > 0 && ` · bills before then ${formatPeso(safe.bills)}`}
          {keep > 0 && ` · keeping ${formatPeso(keep)}`}
        </p>
      )}
      {!compact && !safe.incomeName && (
        <p className="mt-2 text-xs text-muted">
          Counting to the month’s end. To count to your next baon or sweldo, write a line like “@ tuwing kinsenas at katapusan +P8000 sweldo”.
        </p>
      )}
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
        <span className="shrink-0 font-mono text-[11px] text-faint">{account.tag}</span>
        <span className={cn('w-24 shrink-0 text-right text-[14px] font-semibold tabular-nums', balance < 0 && 'text-danger')}>
          {formatPeso(balance)}
        </span>
      </button>
      {open && (
        <form
          className="space-y-2 px-3.5 pb-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim() !== account.name && !renameAccount(account.id, name)) return setError('That word is taken by another account.')
            const n = parseAmount(amount)
            if (amount.trim() && Number.isFinite(n)) setBalance(account.id, n)
            setAmount('')
            setError('')
            setOpen(false)
          }}
        >
          <label className="flex items-center gap-2 text-xs text-muted">
            <span className="w-16 shrink-0">Has now</span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={formatPeso(balance)}
              aria-label={`What ${account.name} has now`}
              className="h-9 min-w-0 flex-1 rounded-control border border-lineSoft bg-canvas px-2.5 text-sm text-ink tabular-nums"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-muted">
            <span className="w-16 shrink-0">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Account name"
              className="h-9 min-w-0 flex-1 rounded-control border border-lineSoft bg-canvas px-2.5 text-sm text-ink"
            />
          </label>
          <p className="text-xs text-faint">
            Type “{account.tag}” in a line to use it: “P150 lunch {account.tag}”.
          </p>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-between">
            {canRemove ? (
              <button type="button" onClick={() => removeAccount(account.id)} className="text-xs font-medium text-danger hover:underline">
                Remove account
              </button>
            ) : (
              <span />
            )}
            <button type="submit" className="rounded-control bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg">
              Save
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
          if (!addAccount(name)) return setError('Pick a name whose first word no other account uses.')
          setName('')
          setError('')
        }}
      >
        <Plus size={14} className="shrink-0 text-faint" aria-hidden="true" />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add an account (BPI, Seabank, Ipon jar)"
          aria-label="New account name"
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
      <span className="min-w-0 flex-1">Keep aside (ipon), not counted as spendable</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => setKeep(parseAmount(value || '0'))}
        placeholder="₱0"
        aria-label="Amount to keep aside"
        className="h-8 w-28 shrink-0 rounded-control border border-lineSoft bg-panel px-2 text-sm text-ink tabular-nums"
      />
    </label>
  )
}

function MoneyLine({ r, category }: { r: MoneyRef; category: string }): React.ReactNode {
  const selectNote = useUIStore((s) => s.selectNote)
  const e = r.entry
  const word = e.text.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  const sign = e.flow === 'in' ? '+' : e.flow === 'out' ? '−' : ''
  return (
    <li className="flex items-center border-b border-lineSoft last:border-b-0">
      <button type="button" onClick={() => selectNote(r.noteId, r.pageId)} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 pl-3.5 text-left hover:bg-raise">
        <span className="w-12 shrink-0 text-xs tabular-nums text-faint">{formatDay(e.day).replace(/^\w+,\s*/, '')}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px]">{e.text || (e.flow === 'move' ? 'Transfer' : 'Untitled')}</span>
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
          items={CATEGORIES.map((c) => ({ id: c, label: c, checked: c === category, onSelect: () => setCategory(word, c) }))}
          trigger={(props) => (
            <button
              {...props}
              type="button"
              aria-label={`Category for “${word}”: ${category}`}
              className="mr-2 shrink-0 rounded-full border border-lineSoft px-2 py-0.5 text-[11px] font-medium text-muted hover:border-line hover:text-ink"
            >
              {category}
            </button>
          )}
        />
      ) : (
        <span className="mr-2 w-0" />
      )}
    </li>
  )
}
