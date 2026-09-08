import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, BookOpen, Settings, CircleDot, Scale, Plus, Zap, ChevronDown, ChevronRight, GripVertical, PanelLeftClose, ArrowUp, ArrowDown } from 'lucide-react'
import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../store/app'
import { useSidebarWorkspace } from '../store/sidebarWorkspace'
import { CreateProjectModal } from './modals'

const NAV = [
  { to: '/', label: '项目组合', icon: LayoutDashboard, end: true },
  { to: '/playbook', label: '生命周期方法', icon: BookOpen },
  { to: '/settings', label: '设置', icon: Settings }
]

export function LogoMark({ size = 26 }: { size?: number }) {
  const dots = Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2 - Math.PI / 2; return { x: 13 + 8.2 * Math.cos(a), y: 13 + 8.2 * Math.sin(a), i } })
  return <svg width={size} height={size} viewBox="0 0 26 26"><rect x="1" y="1" width="24" height="24" rx="7" fill="#4f46e5" />{dots.map((d) => <circle key={d.i} cx={d.x} cy={d.y} r={d.i === 2 ? 2.2 : 1.6} fill={d.i === 2 ? '#fbbf24' : '#ffffff'} opacity={d.i === 2 ? 1 : 0.85} />)}<circle cx="13" cy="13" r="2.4" fill="#ffffff" /></svg>
}

export function Sidebar() {
  const { data } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [createOpen, setCreateOpen] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ projectId: string; x: number; y: number; trigger: HTMLElement } | null>(null)
  const firstMenuItem = useRef<HTMLButtonElement | null>(null)
  const lastAutoOpenedRoute = useRef<string | undefined>()
  const workspace = useSidebarWorkspace()
  const routeProjectId = location.pathname.startsWith('/project/') ? location.pathname.split('/')[2] : undefined

  useEffect(() => {
    if (!data) return
    workspace.hydrate(data.projects.map((p) => p.id))
  }, [data])

  useEffect(() => {
    if (!routeProjectId) {
      lastAutoOpenedRoute.current = undefined
      return
    }
    if (!data?.projects.some((p) => p.id === routeProjectId) || lastAutoOpenedRoute.current === routeProjectId) return
    workspace.openProject(routeProjectId)
    lastAutoOpenedRoute.current = routeProjectId
  }, [data, routeProjectId])

  useEffect(() => {
    if (!menu) return
    requestAnimationFrame(() => firstMenuItem.current?.parentElement?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus())
    const close = () => setMenu(null)
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMenu(null)
      menu.trigger.focus()
    }
    window.addEventListener('click', close); window.addEventListener('resize', close); window.addEventListener('scroll', close, true); window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('click', close); window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true); window.removeEventListener('keydown', onKey) }
  }, [menu])

  const shortcut = useCallback((e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); setCreateOpen(true) } }, [])
  useEffect(() => { window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut) }, [shortcut])
  const openProjects = workspace.projectIds.map((id) => data?.projects.find((p) => p.id === id)).filter(Boolean)

  return <aside className="w-[248px] flex-shrink-0 bg-sidebar text-white flex flex-col select-none">
    <div className="px-4 pt-5 pb-4 flex items-center gap-2.5"><LogoMark /><div className="leading-tight"><div className="font-bold text-[13.5px] tracking-wide">Lifecycle OS</div><div className="text-[10.5px] text-white/40 font-medium">产品生命周期决策台</div></div></div>
    <div className="px-3"><button onClick={() => setCreateOpen(true)} className="w-full flex items-center gap-2 h-9 px-3 rounded-[9px] bg-primary hover:bg-primary-deep text-white text-[13px] font-medium transition-colors"><Plus size={15} /> 新建项目</button></div>
    <nav className="mt-4 px-3 space-y-0.5">{NAV.map((item) => { const active = item.end ? location.pathname === '/' : location.pathname.startsWith(item.to); return <NavLink key={item.to} to={item.to} className={`flex items-center gap-2.5 h-9 px-3 rounded-[9px] text-[13px] font-medium transition-colors ${active ? 'bg-white/10 text-white' : 'text-white/55 hover:text-white hover:bg-white/5'}`}><item.icon size={15.5} className={active ? 'text-indigo-300' : ''} />{item.label}</NavLink> })}</nav>

    <div className="mt-4 flex-1 min-h-0 overflow-y-auto px-3 pb-3">
      {openProjects.length > 0 && <div className="text-[10.5px] font-semibold text-white/35 tracking-widest px-3 mb-1.5">已打开项目</div>}
      <div className="space-y-1">{openProjects.map((project) => {
        if (!project) return null
        const expanded = workspace.expandedProjectIds.includes(project.id), activeProject = routeProjectId === project.id
        const stages = [...project.workflowSnapshot.stages].sort((a, b) => a.order - b.order)
        return <div key={project.id} draggable onDragStart={(event) => { setDraggingId(project.id); workspace.collapseProject(project.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', project.id) }} onDragEnd={() => setDraggingId(null)} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }} onDrop={(event) => { event.preventDefault(); const sourceId = event.dataTransfer.getData('text/plain') || draggingId; if (sourceId) workspace.moveProject(sourceId, project.id); setDraggingId(null) }} className={`rounded-[9px] ${draggingId === project.id ? 'opacity-45' : ''}`}>
          <div tabIndex={0} aria-label={`${project.name} 项目菜单`} className={`flex items-center h-9 rounded-[9px] outline-none focus:ring-1 focus:ring-indigo-300/70 ${activeProject ? 'bg-white/10' : 'hover:bg-white/5'}`}
            onContextMenu={(event) => { event.preventDefault(); setMenu({ projectId: project.id, x: Math.max(6, Math.min(event.clientX, window.innerWidth - 182)), y: Math.max(6, Math.min(event.clientY, window.innerHeight - 126)), trigger: event.currentTarget }) }}
            onKeyDown={(event) => { if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); setMenu({ projectId: project.id, x: Math.max(6, Math.min(rect.left + 20, window.innerWidth - 182)), y: Math.max(6, Math.min(rect.bottom + 4, window.innerHeight - 126)), trigger: event.currentTarget }) } }}>
            <span className="p-1 pl-2 text-white/25 cursor-grab active:cursor-grabbing" title="拖动排序"><GripVertical size={13} /></span>
            <button type="button" onClick={() => workspace.toggleExpanded(project.id)} className="p-1 text-white/45" aria-label={expanded ? `折叠 ${project.name}` : `展开 ${project.name}`}>{expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>
            <button type="button" onClick={() => navigate(`/project/${project.id}`)} className="flex-1 min-w-0 text-left pr-2 text-[12.5px] font-medium truncate">{project.name}</button>
          </div>
          {expanded && <div className="ml-7 border-l border-white/10 py-1">{stages.map((stage) => { const activeStage = activeProject && location.pathname.includes(`/stage/${stage.id}`); return <button key={stage.id} type="button" onClick={() => navigate(`/project/${project.id}/stage/${stage.id}`)} className={`w-full flex items-center gap-2 min-h-7 px-3 text-left text-[11.5px] transition-colors ${activeStage ? 'text-white bg-white/8' : 'text-white/45 hover:text-white/80'}`}><CircleDot size={9.5} className={stage.status === 'passed' ? 'text-emerald-400' : stage.status === 'active' ? 'text-indigo-300' : 'text-white/20'} /><span className="truncate">{stage.order}. {stage.name}</span></button> })}</div>}
        </div>
      })}</div>
    </div>

    <div className="px-6 pb-5 text-[10.5px] text-white/30 leading-relaxed"><div className="flex items-center gap-1.5 mb-1"><Scale size={11} /> 证据胜于观点</div><div className="flex items-center gap-1.5"><Zap size={11} /> {data?.projects.length ?? 0} 个项目进行中</div></div>
    {menu && createPortal(<div role="menu" aria-label="项目侧边栏操作" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      event.preventDefault()
      const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')]
      const current = items.indexOf(document.activeElement as HTMLButtonElement)
      const next = event.key === 'ArrowDown' ? (current + 1) % items.length : (current - 1 + items.length) % items.length
      items[next]?.focus()
    }} className="fixed z-[1000] w-[174px] rounded-[10px] border border-line bg-white p-1.5 text-[12px] text-ink shadow-xl" style={{ left: menu.x, top: menu.y }}>
      <button ref={firstMenuItem} role="menuitem" disabled={workspace.projectIds.indexOf(menu.projectId) === 0} onClick={() => { workspace.moveProjectBy(menu.projectId, -1); setMenu(null) }} className="w-full flex items-center gap-2 rounded-[7px] px-2.5 py-2 hover:bg-[#f5f4f1] disabled:opacity-35"><ArrowUp size={13} /> 上移</button>
      <button role="menuitem" disabled={workspace.projectIds.indexOf(menu.projectId) === workspace.projectIds.length - 1} onClick={() => { workspace.moveProjectBy(menu.projectId, 1); setMenu(null) }} className="w-full flex items-center gap-2 rounded-[7px] px-2.5 py-2 hover:bg-[#f5f4f1] disabled:opacity-35"><ArrowDown size={13} /> 下移</button>
      <div className="my-1 border-t border-line" /><button role="menuitem" onClick={() => { workspace.removeProject(menu.projectId); setMenu(null) }} className="w-full flex items-center gap-2 rounded-[7px] px-2.5 py-2 text-bad hover:bg-red-50"><PanelLeftClose size={13} /> 从侧边栏移除</button>
    </div>, document.body)}
    <CreateProjectModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(id) => { setCreateOpen(false); workspace.openProject(id); navigate(`/project/${id}`) }} />
  </aside>
}
