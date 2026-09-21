import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type InputHTMLAttributes } from 'react'
import { CaretDown, Minus, Plus, X } from '@phosphor-icons/react'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

const MOTION = 'transition-[background-color,color,box-shadow,transform,opacity] duration-300 ease-(--ease-out)'

/* ---------- Buttons ---------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md'
  icon?: ReactNode
  /** Sits in its own circle, flush right (the "button-in-button" pattern). */
  trailingIcon?: ReactNode
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-hover shadow-soft',
  secondary: 'bg-surface text-ink ring-1 ring-line-strong hover:bg-shell',
  ghost: 'text-ink-2 hover:bg-shell hover:text-ink',
  danger: 'bg-danger-soft text-danger hover:ring-1 hover:ring-danger/40',
}

export function Button({ variant = 'secondary', size = 'md', icon, trailingIcon, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'group inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45',
        MOTION,
        VARIANTS[variant],
        size === 'md' ? 'h-11 text-[15px]' : 'h-9 text-sm',
        trailingIcon ? (size === 'md' ? 'pl-5 pr-1.5' : 'pl-4 pr-1') : size === 'md' ? 'px-5' : 'px-3.5',
        className,
      )}
      {...rest}
    >
      {icon && <span aria-hidden className="-ml-0.5 flex text-[1.15em]">{icon}</span>}
      {children}
      {trailingIcon && (
        <span
          aria-hidden
          className={cx(
            'flex items-center justify-center rounded-full transition-transform duration-500 ease-(--ease-spring) group-hover:translate-x-0.5 group-hover:-translate-y-px group-hover:scale-105',
            size === 'md' ? 'size-8' : 'size-7',
            variant === 'primary' ? 'bg-accent-ink/15' : 'bg-ink/[0.07]',
          )}
        >
          {trailingIcon}
        </span>
      )}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  size?: 'sm' | 'md'
}

export function IconButton({ label, size = 'md', className, children, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-shell hover:text-ink active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40',
        MOTION,
        size === 'md' ? 'size-10 text-xl' : 'size-8 text-lg',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

/* ---------- Surfaces ---------- */

/** Double-bezel card: a soft outer tray holding the content panel. */
export function Shell({ children, className, coreClassName, as: Tag = 'div' }: { children: ReactNode; className?: string; coreClassName?: string; as?: 'div' | 'section' | 'article' }) {
  return (
    <Tag className={cx('rounded-shell bg-shell/70 p-1.5 ring-1 ring-line', className)}>
      <div className={cx('h-full rounded-core bg-surface shadow-core', coreClassName)}>{children}</div>
    </Tag>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="animate-rise flex flex-col gap-5 pb-8 pt-10 md:flex-row md:items-end md:justify-between md:pb-10 md:pt-16">
      <div className="min-w-0">
        <h1 className="text-[2rem] font-semibold leading-[1.1] tracking-[-0.03em] md:text-[2.75rem]">{title}</h1>
        {description && <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-ink-2 md:text-base">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <Shell className="animate-rise">
      <div className="flex flex-col items-center px-6 py-16 text-center">
        <div aria-hidden className="mb-5 flex size-14 items-center justify-center rounded-full bg-accent-soft text-3xl text-accent">{icon}</div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {children && <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-ink-2">{children}</p>}
        {action && <div className="mt-6">{action}</div>}
      </div>
    </Shell>
  )
}

type Tone = 'neutral' | 'accent' | 'warn' | 'danger'
const TONES: Record<Tone, string> = {
  neutral: 'bg-shell text-ink-2',
  accent: 'bg-accent-soft text-accent',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
}

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-xs font-medium', TONES[tone], className)}>
      {children}
    </span>
  )
}

/** A subject's color swatch. The color carries meaning (it matches the routine grid). */
export function Swatch({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cx('inline-block size-2.5 shrink-0 rounded-[3px]', className)} style={{ background: color }} />
}

/* ---------- Form controls ---------- */

export function Field({ label, hint, error, children, htmlFor, className }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; htmlFor: string; className?: string }) {
  return (
    <div className={cx('flex min-w-0 flex-col gap-2', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">{label}</label>
      {children}
      {error ? (
        <p role="alert" className="text-[13px] text-danger">{error}</p>
      ) : hint ? (
        <p className="text-[13px] leading-snug text-ink-3">{hint}</p>
      ) : null}
    </div>
  )
}

const FIELD = 'h-11 w-full min-w-0 rounded-field bg-surface px-3.5 text-[15px] text-ink ring-1 ring-line-strong placeholder:text-ink-3 hover:ring-ink/25 aria-invalid:ring-danger'

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input autoComplete="off" className={cx(FIELD, 'transition-shadow duration-200', className)} {...rest} />
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cx('relative min-w-0', className)}>
      <select className={cx(FIELD, 'appearance-none truncate pr-9')} {...rest}>{children}</select>
      <CaretDown aria-hidden weight="light" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3" />
    </div>
  )
}

/** Whole-number input with -/+ buttons. */
export function Stepper({ id, value, min = 0, max = 99, onChange, label }: { id?: string; value: number; min?: number; max?: number; onChange: (n: number) => void; label: string }) {
  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n)))
  return (
    <div className="inline-flex h-11 w-fit items-center self-start rounded-full bg-surface ring-1 ring-line-strong">
      <IconButton label={`Decrease ${label}`} size="sm" className="ml-1.5" disabled={value <= min} onClick={() => onChange(clamp(value - 1))}>
        <Minus weight="light" />
      </IconButton>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        onChange={(e) => e.target.value !== '' && onChange(clamp(Number(e.target.value)))}
        className="w-10 bg-transparent text-center font-mono text-[15px] tabular-nums [appearance:textfield] focus-visible:outline-offset-0 [&::-webkit-inner-spin-button]:appearance-none"
      />
      <IconButton label={`Increase ${label}`} size="sm" className="mr-1.5" disabled={value >= max} onClick={() => onChange(clamp(value + 1))}>
        <Plus weight="light" />
      </IconButton>
    </div>
  )
}

export function ToggleChip({ pressed, onClick, children, disabled, title }: { pressed: boolean; onClick: () => void; children: ReactNode; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cx(
        'inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40',
        MOTION,
        pressed ? 'bg-accent-soft font-medium text-accent ring-1 ring-accent/35' : 'bg-surface text-ink-2 ring-1 ring-line-strong hover:text-ink hover:ring-ink/25',
      )}
    >
      {children}
    </button>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-full bg-shell p-1 ring-1 ring-line">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-medium',
            MOTION,
            value === o.value ? 'bg-surface text-ink shadow-core' : 'text-ink-2 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------- Dialogs ---------- */

export function Dialog({ open, onClose, title, description, children, footer, wide }: {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx(
        'm-auto max-h-[min(88dvh,900px)] w-[calc(100%-2rem)] overflow-visible bg-transparent p-0 text-ink open:animate-rise backdrop:animate-fade',
        wide ? 'max-w-3xl' : 'max-w-lg',
      )}
    >
      {open && (
        <Shell coreClassName="flex max-h-[calc(min(88dvh,900px)-0.75rem)] flex-col">
          <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-6">
            <div className="min-w-0">
              <h2 id={titleId} className="text-xl font-semibold tracking-tight">{title}</h2>
              {description && <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{description}</p>}
            </div>
            <IconButton label="Close" className="-mr-2 -mt-1" onClick={onClose}><X weight="light" /></IconButton>
          </div>
          {children && <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">{children}</div>}
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
        </Shell>
      )}
    </dialog>
  )
}

export function ConfirmDialog({ open, onClose, onConfirm, title, children, confirmLabel, tone = 'danger' }: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  children?: ReactNode
  confirmLabel: string
  tone?: 'danger' | 'primary'
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={tone} onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</Button>
        </>
      }
    >
      {children && <div className="text-[15px] leading-relaxed text-ink-2">{children}</div>}
    </Dialog>
  )
}
