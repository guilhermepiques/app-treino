import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { fix, fmtNum, parseNum } from '../lib/util'
import { IconMinus, IconPlus, IconX } from './Icons'

// ---------- Sheet (painel que sobe de baixo) ----------

let openSheets = 0

export function Sheet({
  open,
  onClose,
  title,
  children,
  tall,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  tall?: boolean
}) {
  useEffect(() => {
    if (!open) return
    openSheets++
    document.body.classList.add('no-scroll')
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      openSheets--
      if (!openSheets) document.body.classList.remove('no-scroll')
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className={`sheet${tall ? ' sheet-tall' : ''}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <div className="sheet-title">{title}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <IconX />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

export function MenuItem({
  icon,
  label,
  hint,
  onClick,
  danger,
  disabled,
}: {
  icon?: ReactNode
  label: string
  hint?: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button className={`menu-item${danger ? ' danger' : ''}`} onClick={onClick} disabled={disabled}>
      <span className="menu-icon">{icon}</span>
      <span className="menu-text">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
    </button>
  )
}

// ---------- Stepper (− valor +) ----------

export function Stepper({
  label,
  value,
  onChange,
  step,
  unit,
  decimals = true,
  compact,
}: {
  label?: string
  value: number
  onChange: (v: number) => void
  step: number
  unit?: string
  decimals?: boolean
  compact?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')

  const commit = () => {
    const v = parseNum(text)
    if (v !== null && v >= 0) onChange(fix(decimals ? v : Math.round(v)))
    setEditing(false)
  }

  return (
    <div className={`stepper${compact ? ' compact' : ''}`}>
      {label && <div className="stepper-label">{label}</div>}
      <div className="stepper-row">
        <button
          className="step-btn"
          onClick={() => onChange(fix(Math.max(0, value - step)))}
          aria-label={`Menos ${label ?? ''}`}
        >
          <IconMinus size={compact ? 18 : 22} />
        </button>
        {editing ? (
          <input
            className="step-input"
            inputMode={decimals ? 'decimal' : 'numeric'}
            autoFocus
            value={text}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            aria-label={label}
          />
        ) : (
          <button
            className="step-value"
            onClick={() => {
              setText(fmtNum(value))
              setEditing(true)
            }}
            aria-label={`${label ?? ''} ${fmtNum(value)}, tocar para digitar`}
          >
            {fmtNum(value)}
            {unit && <span className="unit">{unit}</span>}
          </button>
        )}
        <button className="step-btn" onClick={() => onChange(fix(value + step))} aria-label={`Mais ${label ?? ''}`}>
          <IconPlus size={compact ? 18 : 22} />
        </button>
      </div>
    </div>
  )
}

// ---------- Chips ----------

export function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <button className={`chip${active ? ' active' : ''}`} onClick={onClick} aria-pressed={active}>
      {children}
    </button>
  )
}

// ---------- Texto editável no lugar ----------

export function InlineText({
  value,
  placeholder,
  onSave,
  className,
  maxLength = 60,
}: {
  value: string
  placeholder: string
  onSave: (v: string) => void
  className?: string
  maxLength?: number
}) {
  const [text, setText] = useState(value)
  const last = useRef(value)
  useEffect(() => {
    if (value !== last.current) {
      setText(value)
      last.current = value
    }
  }, [value])
  return (
    <input
      className={`inline-text ${className ?? ''}`}
      value={text}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text.trim() !== value) {
          last.current = text.trim()
          onSave(text.trim())
        }
      }}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

// ---------- Toast ----------

export const toast = (msg: string) => window.dispatchEvent(new CustomEvent('app-toast', { detail: msg }))

export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const on = (e: Event) => {
      setMsg((e as CustomEvent<string>).detail)
      clearTimeout(t)
      t = setTimeout(() => setMsg(null), 2600)
    }
    window.addEventListener('app-toast', on)
    return () => window.removeEventListener('app-toast', on)
  }, [])
  return msg ? (
    <div className="toast" role="status">
      {msg}
    </div>
  ) : null
}

export function TopBar({ left, title, sub, right }: { left?: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <header className="topbar">
      {left}
      <div className="topbar-title">
        <h1>{title}</h1>
        {sub && <div className="topbar-sub">{sub}</div>}
      </div>
      {right}
    </header>
  )
}
