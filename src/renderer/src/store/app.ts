import { create } from 'zustand'
import type { AppData, Project, ProjectStage, StageGate } from '@shared/types'

export interface Toast { id: number; kind: 'ok' | 'bad' | 'info'; msg: string }

interface AppState {
  data: AppData | null
  loading: boolean
  toasts: Toast[]
  portfolioView: 'list' | 'grid'
  setPortfolioView: (v: 'list' | 'grid') => void
  load: () => Promise<void>
  toast: (msg: string, kind?: 'ok' | 'bad' | 'info') => void
  dismissToast: (id: number) => void
}

let toastSeq = 1

export const useApp = create<AppState>((set, get) => ({
  data: null,
  loading: true,
  toasts: [],
  portfolioView: 'list',
  setPortfolioView: (v) => set({ portfolioView: v }),
  load: async () => {
    try {
      const data = await window.api.getData()
      set({ data, loading: false })
    } catch (err) {
      get().toast('数据加载失败：' + (err as Error).message, 'bad')
      set({ loading: false })
    }
  },
  toast: (msg, kind = 'info') => {
    const id = toastSeq++
    set((s) => ({ toasts: [...s.toasts, { id, kind, msg }] }))
    setTimeout(() => get().dismissToast(id), 4200)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))

// ─── 派生工具 ───

export function projectProgress(p: Project): { done: number; total: number } {
  let done = 0
  let total = 0
  for (const st of p.workflowSnapshot.stages) {
    for (const sp of st.steps) {
      total++
      if (sp.status === 'done') done++
    }
  }
  return { done, total }
}

export function stageGate(p: Project, st: ProjectStage, evidences: { projectId: string; stageId: string }[]): StageGate {
  const evCount = evidences.filter((e) => e.projectId === p.id && e.stageId === st.id).length
  const todosDone = st.todos.filter((t) => t.done).length
  const delReq = st.deliverables.filter((d) => d.required).length
  const delDone = st.deliverables.filter((d) => d.required && d.content && d.content.trim()).length
  const critMet = st.exitCriteria.filter((c) => c.met).length
  const missing: string[] = []
  if (todosDone < st.todos.length) missing.push(`Todo 未完成（${todosDone}/${st.todos.length}）`)
  if (delDone < delReq) missing.push(`必要成果未提交（${delDone}/${delReq}）`)
  if (evCount < st.minEvidence) missing.push(`证据不足（${evCount}/${st.minEvidence}）`)
  if (critMet < st.exitCriteria.length) missing.push(`退出条件未满足（${critMet}/${st.exitCriteria.length}）`)
  return {
    todosDone,
    todosTotal: st.todos.length,
    deliverablesDone: delDone,
    deliverablesRequired: delReq,
    evidenceCount: evCount,
    evidenceRequired: st.minEvidence,
    criteriaMet: critMet,
    criteriaTotal: st.exitCriteria.length,
    ready: missing.length === 0,
    missing
  }
}

export function fmtDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  const md = `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')}`
  return sameYear ? md : `${d.getFullYear()}-${md}`
}

export function nextAction(p: Project): string {
  const stage = p.workflowSnapshot.stages.find((s) => s.id === p.currentStageId)
  if (!stage) return '—'
  if (stage.status === 'passed') {
    const next = p.workflowSnapshot.stages.find((s) => s.status === 'active')
    return next ? `进入「${next.name}」` : '待决策'
  }
  const step = stage.steps.find((s) => s.status !== 'done')
  if (step) return `${stage.name} / ${step.name}`
  return `${stage.name} / 待提交成果与决策`
}

declare global {
  interface Window {
    api: import('@shared/types').Api
  }
}
