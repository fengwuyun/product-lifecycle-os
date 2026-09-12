import React, { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2 } from 'lucide-react'
import type { EvidenceStrength, Priority, ProjectStatus } from '@shared/types'

// ─── Button ───

type BtnVariant = 'primary' | 'default' | 'ghost' | 'danger' | 'soft'
export function Button({ variant = 'default', size = 'md', loading, className = '', children, ...rest }: {
  variant?: BtnVariant
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base = 'inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 leading-none font-medium rounded-[9px] transition-all select-none disabled:opacity-50 disabled:pointer-events-none'
  const sizes = { sm: 'h-7 px-2.5 text-[12.5px]', md: 'h-9 px-3.5 text-[13.5px]', lg: 'h-10.5 px-5 text-[14.5px]' }
  const variants: Record<BtnVariant, string> = {
    primary: 'bg-primary text-white hover:bg-primary-deep shadow-sm shadow-primary/25 active:scale-[.98]',
    default: 'bg-white border border-line-2 text-ink hover:border-ink-3 hover:bg-[#fbfaf7] active:scale-[.98]',
    ghost: 'text-ink-2 hover:bg-black/5 hover:text-ink',
    danger: 'bg-bad text-white hover:brightness-110 active:scale-[.98]',
    soft: 'bg-primary-soft text-primary hover:bg-primary-line/60'
  }
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} disabled={loading || rest.disabled} {...rest}>
      {loading && <Loader2 size={14} className="spin" />}
      {children}
    </button>
  )
}

// ─── Card / Section ───

export function Card({ className = '', children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`bg-white border border-line rounded-xl ${className}`} {...rest}>
      {children}
    </div>
  )
}

export function SectionTitle({ icon, title, extra, desc }: { icon?: React.ReactNode; title: string; extra?: React.ReactNode; desc?: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      {icon && <span className="text-ink-3">{icon}</span>}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[15px] leading-tight">{title}</div>
        {desc && <div className="text-[12.5px] text-ink-3 mt-0.5">{desc}</div>}
      </div>
      {extra}
    </div>
  )
}

// ─── Badge ───

export function Badge({ tone = 'gray', children, className = '' }: { tone?: 'gray' | 'primary' | 'ok' | 'warn' | 'bad'; children: React.ReactNode; className?: string }) {
  const tones = {
    gray: 'bg-[#efede8] text-ink-2',
    primary: 'bg-primary-soft text-primary',
    ok: 'bg-ok-soft text-ok',
    warn: 'bg-warn-soft text-warn',
    bad: 'bg-bad-soft text-bad'
  }
  return <span className={`inline-flex items-center gap-1 text-[11.5px] font-semibold rounded-full px-2 py-[2px] whitespace-nowrap ${tones[tone]} ${className}`}>{children}</span>
}

const STRENGTH_TONE: Record<EvidenceStrength, 'ok' | 'warn' | 'gray'> = {
  极强: 'ok', 强: 'ok', 中: 'warn', 弱: 'warn', 极弱: 'gray'
}
export function StrengthBadge({ strength }: { strength: EvidenceStrength }) {
  return <Badge tone={STRENGTH_TONE[strength] || 'gray'}>{strength}</Badge>
}

const PRIORITY_TONE: Record<Priority, string> = {
  P1: 'bg-primary text-white', P2: 'bg-primary-soft text-primary', P3: 'bg-[#efede8] text-ink-2'
}
export function PriorityBadge({ p }: { p: Priority }) {
  return <span className={`inline-flex items-center justify-center w-7 h-5.5 rounded-md text-[11px] font-bold ${PRIORITY_TONE[p]}`}>{p}</span>
}

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: '进行中', waiting: '等待中', paused: '已暂停', completed: '已完成', abandoned: '已放弃'
}
export const STATUS_TONE: Record<ProjectStatus, 'primary' | 'warn' | 'ok' | 'gray' | 'bad'> = {
  active: 'primary', waiting: 'warn', paused: 'gray', completed: 'ok', abandoned: 'bad'
}
export function StatusBadge({ status }: { status: ProjectStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
}

// ─── 阶段状态点（PRD §15: ●已完成 ◉当前 ○未开始） ───

export function StageDot({ status, size = 12 }: { status: 'done' | 'current' | 'todo'; size?: number }) {
  if (status === 'done') return <span className="inline-block rounded-full bg-ok flex-shrink-0" style={{ width: size, height: size }} />
  if (status === 'current') return <span className="inline-block rounded-full bg-primary flex-shrink-0 ring-3 ring-primary/20" style={{ width: size, height: size }} />
  return <span className="inline-block rounded-full bg-[#d9d6cd] flex-shrink-0" style={{ width: size, height: size }} />
}

// ─── ProgressBar ───

export function ProgressBar({ value, className = '' }: { value: number; className?: string }) {
  return (
    <div className={`h-1.5 bg-[#ecebe5] rounded-full overflow-hidden ${className}`}>
      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(100, Math.round(value))}%` }} />
    </div>
  )
}

// ─── Modal ───

export function Modal({ open, onClose, title, width = 560, children, footer }: {
  open: boolean
  onClose: () => void
  title: string
  width?: number
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const wasOpenRef = useRef(false)
  const onCloseRef = useRef(onClose)
  const titleId = useId()

  if (open && !wasOpenRef.current) {
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }
  wasOpenRef.current = open

  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => {
    if (!open) return
    const getFocusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ) ?? []).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true')
    const focusable = getFocusable()
    focusable[0]?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const controls = getFocusable()
      if (controls.length === 0) { e.preventDefault(); return }
      const currentIndex = controls.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey && currentIndex <= 0) {
        e.preventDefault()
        controls[controls.length - 1].focus()
      } else if (!e.shiftKey && (currentIndex === -1 || currentIndex === controls.length - 1)) {
        e.preventDefault()
        controls[0].focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      triggerRef.current?.focus()
      triggerRef.current = null
    }
  }, [open])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative bg-white rounded-2xl shadow-2xl w-full anim-in flex flex-col max-h-[88vh]" style={{ maxWidth: width }}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h3 id={titleId} className="font-bold text-[16px]">{title}</h3>
          <button aria-label="关闭对话框" className="text-ink-3 hover:text-ink p-1 rounded-md hover:bg-black/5" onClick={onClose}><X size={17} /></button>
        </div>
        <div className="px-6 pb-5 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-line flex justify-end gap-2 bg-[#fbfaf8] rounded-b-2xl">{footer}</div>}
      </div>
    </div>, document.body
  )
}

// ─── Form bits ───

export function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3.5">
      <div className="text-[12.5px] font-semibold text-ink-2 mb-1.5">
        {label}{required && <span className="text-bad ml-0.5">*</span>}
        {hint && <span className="font-normal text-ink-3 ml-2">{hint}</span>}
      </div>
      {children}
    </label>
  )
}

export function EmptyState({ icon, title, desc, action }: { icon: React.ReactNode; title: string; desc?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-primary-soft text-primary flex items-center justify-center mb-4">{icon}</div>
      <div className="font-semibold text-[15.5px]">{title}</div>
      {desc && <div className="text-[13px] text-ink-3 mt-1.5 max-w-sm leading-relaxed">{desc}</div>}
      {action && <div className="mt-5 flex gap-2">{action}</div>}
    </div>
  )
}

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 size={16} className={`spin text-ink-3 ${className}`} />
}

export function KeyValue({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-[13px]">
      <span className="text-ink-3 flex-shrink-0">{k}</span>
      <span className="min-w-0">{v}</span>
    </div>
  )
}
