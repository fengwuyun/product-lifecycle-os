import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { CheckCircle2, AlertCircle, Info } from 'lucide-react'
import { useApp } from './store/app'
import { Sidebar } from './components/Sidebar'
import { PortfolioPage } from './pages/Portfolio'

const PipelinePage = lazy(() => import('./pages/Pipeline').then((m) => ({ default: m.PipelinePage })))
const StagePage = lazy(() => import('./pages/Stage').then((m) => ({ default: m.StagePage })))
const StepPage = lazy(() => import('./pages/Step').then((m) => ({ default: m.StepPage })))
const PlaybookPage = lazy(() => import('./pages/Playbook').then((m) => ({ default: m.PlaybookPage })))
const SettingsPage = lazy(() => import('./pages/Settings').then((m) => ({ default: m.SettingsPage })))

export function ToastHost() {
  const { toasts, dismissToast } = useApp()
  return (
    <div aria-live="polite" aria-atomic="true" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] space-y-2 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} onClick={() => dismissToast(t.id)}
          className={`pointer-events-auto cursor-pointer anim-in flex items-center gap-2.5 rounded-xl px-4 py-3 shadow-lg text-[13.5px] font-medium max-w-md ${
            t.kind === 'ok' ? 'bg-ink text-white' : t.kind === 'bad' ? 'bg-bad text-white' : 'bg-ink text-white'
          }`}>
          {t.kind === 'ok' ? <CheckCircle2 size={16} className="flex-shrink-0 text-emerald-400" />
            : t.kind === 'bad' ? <AlertCircle size={16} className="flex-shrink-0" />
            : <Info size={16} className="flex-shrink-0" />}
          {t.msg}
        </div>
      ))}
    </div>
  )
}

export default function App() {
  const { load, loading, toast } = useApp()

  useEffect(() => { load() }, [load])

  // 全局错误兜底：IPC 失败自动 toast
  useEffect(() => {
    const handler = (e: PromiseRejectionEvent) => {
      toast(String(e.reason?.message || e.reason), 'bad')
    }
    window.addEventListener('unhandledrejection', handler)
    return () => window.removeEventListener('unhandledrejection', handler)
  }, [toast])

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-paper">
        <div className="flex flex-col items-center gap-3 text-ink-3">
          <svg width="34" height="34" viewBox="0 0 26 26" className="spin">
            <circle cx="13" cy="13" r="11" fill="none" stroke="#e7e4dc" strokeWidth="2.5" />
            <path d="M 13 2 A 11 11 0 0 1 24 13" fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <div className="text-[13px]">正在加载本地数据…</div>
        </div>
      </div>
    )
  }

  return (
    <HashRouter>
      <div className="h-full flex">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-y-auto">
          <Suspense fallback={<div className="h-full flex items-center justify-center text-[13px] text-ink-3">正在打开页面…</div>}>
            <Routes>
            <Route path="/" element={<PortfolioPage />} />
            <Route path="/project/:projectId" element={<PipelinePage />} />
            <Route path="/project/:projectId/stage/:stageId" element={<StagePage />} />
            <Route path="/project/:projectId/stage/:stageId/step/:stepId" element={<StepPage />} />
            <Route path="/playbook" element={<PlaybookPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
        <ToastHost />
      </div>
    </HashRouter>
  )
}
