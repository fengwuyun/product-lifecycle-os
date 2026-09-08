import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, BookOpen, Settings, CircleDot, Scale,
  Plus, Zap
} from 'lucide-react'
import { useEffect, useState, useCallback } from 'react'
import { useApp } from '../store/app'
import { CreateProjectModal } from './modals'

const NAV = [
  { to: '/', label: 'Portfolio', icon: LayoutDashboard, end: true },
  { to: '/playbook', label: 'Playbook', icon: BookOpen },
  { to: '/settings', label: 'Settings', icon: Settings }
]

export function LogoMark({ size = 26 }: { size?: number }) {
  // 生命周期 logo：8 个阶段点环绕 + 当前高亮
  const dots = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2
    const r = 8.2
    return { x: 13 + r * Math.cos(a), y: 13 + r * Math.sin(a), i }
  })
  return (
    <svg width={size} height={size} viewBox="0 0 26 26">
      <rect x="1" y="1" width="24" height="24" rx="7" fill="#4f46e5" />
      {dots.map((d) => (
        <circle key={d.i} cx={d.x} cy={d.y} r={d.i === 2 ? 2.2 : 1.6} fill={d.i === 2 ? '#fbbf24' : '#ffffff'} opacity={d.i === 2 ? 1 : 0.85} />
      ))}
      <circle cx="13" cy="13" r="2.4" fill="#ffffff" />
    </svg>
  )
}

export function Sidebar() {
  const { data } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [createOpen, setCreateOpen] = useState(false)
  const [inProject, setInProject] = useState(false)
  const project = data?.projects.find((p) => p.id === location.pathname.split('/')[2])

  useEffect(() => {
    setInProject(location.pathname.startsWith('/project/'))
  }, [location.pathname])

  const shortcut = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault()
      setCreateOpen(true)
    }
  }, [])
  useEffect(() => {
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [shortcut])

  return (
    <aside className="w-[212px] flex-shrink-0 bg-sidebar text-white flex flex-col select-none">
      <div className="px-4 pt-5 pb-4 flex items-center gap-2.5">
        <LogoMark />
        <div className="leading-tight">
          <div className="font-bold text-[13.5px] tracking-wide">Lifecycle OS</div>
          <div className="text-[10.5px] text-white/40 font-medium">产品生命周期决策台</div>
        </div>
      </div>

      <div className="px-3">
        <button
          onClick={() => setCreateOpen(true)}
          className="w-full flex items-center gap-2 h-9 px-3 rounded-[9px] bg-primary hover:bg-primary-deep text-white text-[13px] font-medium transition-colors"
        >
          <Plus size={15} /> 新建项目
        </button>
      </div>

      <nav className="mt-4 px-3 space-y-0.5">
        {NAV.map((item) => {
          const active = item.end ? location.pathname === '/' : location.pathname.startsWith(item.to)
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex items-center gap-2.5 h-9 px-3 rounded-[9px] text-[13px] font-medium transition-colors ${
                active ? 'bg-white/10 text-white' : 'text-white/55 hover:text-white hover:bg-white/5'
              }`}
            >
              <item.icon size={15.5} className={active ? 'text-indigo-300' : ''} />
              {item.label}
            </NavLink>
          )
        })}
      </nav>

      {inProject && project && (
        <div className="mt-5 px-3">
          <div className="text-[10.5px] font-semibold text-white/35 tracking-widest px-3 mb-1.5">当前项目</div>
          <div className="px-3 py-2 rounded-[9px] bg-white/5">
            <div className="text-[13px] font-medium truncate">{project.name}</div>
            <div className="text-[11px] text-white/45 mt-0.5 flex items-center gap-1.5">
              <CircleDot size={11} />
              {project.workflowSnapshot.stages.find((s) => s.id === project.currentStageId)?.name || ''}
            </div>
          </div>
        </div>
      )}

      <div className="mt-auto px-6 pb-5 text-[10.5px] text-white/30 leading-relaxed">
        <div className="flex items-center gap-1.5 mb-1"><Scale size={11} /> Evidence &gt; Opinion</div>
        <div className="flex items-center gap-1.5"><Zap size={11} /> {data?.projects.length ?? 0} 个项目进行中</div>
      </div>

      <CreateProjectModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(id) => { setCreateOpen(false); navigate(`/project/${id}`) }} />
    </aside>
  )
}
