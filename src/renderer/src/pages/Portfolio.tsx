import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import {
  FolderKanban, ChevronRight, Play, PauseCircle, PlayCircle, XCircle,
  List, LayoutGrid, MoreHorizontal, Trash2, ArrowRight, Target, Sparkles, FileDown
} from 'lucide-react'
import { useApp, projectProgress, nextAction, stageGate, fmtDate } from '../store/app'
import { Button, Card, Badge, PriorityBadge, StatusBadge, StageDot, ProgressBar, EmptyState, Modal } from '../components/ui'
import { CreateProjectModal } from '../components/modals'
import type { Project, Priority, ProjectStatus } from '@shared/types'

const STAGE_SHORTS = ['机会', '验证', '竞品', '定义', 'MVP', '开发', '软启动', '市场验证']

export function getMenuPosition(
  trigger: { top: number; bottom: number; right: number },
  menu: { width: number; height: number },
  viewport: { width: number; height: number }
): { top: number; right: number } {
  const margin = 8
  const gap = 4
  const opensUp = trigger.bottom + gap + menu.height > viewport.height - margin
  const rawTop = opensUp ? trigger.top - menu.height - gap : trigger.bottom + gap
  return {
    top: Math.max(margin, Math.min(rawTop, viewport.height - menu.height - margin)),
    right: Math.max(margin, viewport.width - trigger.right)
  }
}

export function PortfolioPage() {
  const { data, portfolioView, setPortfolioView, toast, load } = useApp()
  const navigate = useNavigate()
  const [demoBusy, setDemoBusy] = useState(false)

  if (!data) return null
  const projects = [...data.projects].sort((a, b) => {
    const pr = (p: Project) => (p.priority === 'P1' ? 0 : p.priority === 'P2' ? 1 : 2)
    const order: Record<ProjectStatus, number> = { active: 0, waiting: 1, paused: 2, completed: 3, abandoned: 4 }
    return pr(a) - pr(b) || order[a.status] - order[b.status]
  })
  const focus = projects.find((p) => p.priority === 'P1' && (p.status === 'active' || p.status === 'waiting'))
  const evidences = data.evidences

  const createDemo = async () => {
    setDemoBusy(true)
    try {
      const r = await window.api.createDemoProject()
      await load()
      toast('示例项目已创建，可完整体验闭环', 'ok')
      navigate(`/project/${r.projectId}`)
    } catch (err) { toast((err as Error).message, 'bad') } finally { setDemoBusy(false) }
  }

  return (
    <div className="p-7 max-w-[1180px] mx-auto pb-16">
      {/* 页头 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[21px] font-bold tracking-tight">Portfolio</h1>
          <p className="text-[13px] text-ink-3 mt-0.5">多项目总览 —— 现在应该推进什么，一目了然</p>
        </div>
        <div className="flex items-center gap-1 bg-white border border-line rounded-[10px] p-1">
          <button onClick={() => setPortfolioView('list')} className={`h-7.5 px-3 rounded-lg text-[12.5px] font-medium flex items-center gap-1.5 ${portfolioView === 'list' ? 'bg-primary-soft text-primary' : 'text-ink-3 hover:text-ink'}`}>
            <List size={14} /> 列表
          </button>
          <button onClick={() => setPortfolioView('grid')} className={`h-7.5 px-3 rounded-lg text-[12.5px] font-medium flex items-center gap-1.5 ${portfolioView === 'grid' ? 'bg-primary-soft text-primary' : 'text-ink-3 hover:text-ink'}`}>
            <LayoutGrid size={14} /> 阶段
          </button>
        </div>
      </div>

      {/* 当前焦点（PRD §14.4） */}
      {focus && <FocusCard project={focus} nextStep={nextAction(focus)} />}

      {/* 项目列表 / 阶段视图 */}
      {projects.length === 0 ? (
        <Card className="mt-4">
          <EmptyState
            icon={<FolderKanban size={26} />}
            title="还没有项目"
            desc="创建第一个项目，把「想法 → 验证 → 开发 → 上线」固化为一套可执行的方法论。或者先用示例项目快速了解产品。"
            action={<>
              <CreateProjectModalDemo />
              <Button variant="soft" loading={demoBusy} onClick={createDemo}><Sparkles size={15} /> 创建示例项目</Button>
            </>}
          />
        </Card>
      ) : portfolioView === 'list' ? (
        <Card className="overflow-hidden mt-4">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="text-left text-[12px] text-ink-3 bg-[#faf9f6] border-b border-line">
                <th className="font-semibold px-5 py-2.5">项目</th>
                <th className="font-semibold px-3 py-2.5 w-16">优先级</th>
                <th className="font-semibold px-3 py-2.5 w-28">当前阶段</th>
                <th className="font-semibold px-3 py-2.5">当前任务</th>
                <th className="font-semibold px-3 py-2.5 w-32">进度</th>
                <th className="font-semibold px-3 py-2.5 w-20">状态</th>
                <th className="font-semibold px-3 py-2.5 w-20">最近更新</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const prog = projectProgress(p)
                const stage = p.workflowSnapshot.stages.find((s) => s.id === p.currentStageId)
                const step = stage?.steps.find((s) => s.id === p.currentStepId)
                return (
                  <tr key={p.id} className="border-b border-line/70 last:border-0 hover:bg-[#fafaf7] cursor-pointer group"
                    onClick={() => navigate(`/project/${p.id}`)}>
                    <td className="px-5 py-3">
                      <div className="font-semibold group-hover:text-primary transition-colors">{p.name}</div>
                      {p.description && <div className="text-[12px] text-ink-3 truncate max-w-[240px] mt-0.5">{p.description}</div>}
                    </td>
                    <td className="px-3 py-3"><PriorityBadge p={p.priority} /></td>
                    <td className="px-3 py-3">
                      {stage && <Badge tone={stage.status === 'passed' ? 'ok' : stage.status === 'active' ? 'primary' : 'gray'}>{stage.short || stage.name}</Badge>}
                    </td>
                    <td className="px-3 py-3 text-ink-2">{step ? step.name : stage ? stage.name : '—'}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <ProgressBar value={prog.total ? (prog.done / prog.total) * 100 : 0} className="flex-1" />
                        <span className="text-[11.5px] text-ink-3 tabular-nums">{prog.done}/{prog.total}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3"><StatusBadge status={p.status} /></td>
                    <td className="px-3 py-3 text-ink-3 text-[12.5px]">{fmtDate(p.lastActiveAt)}</td>
                    <td className="px-3 py-3"><RowActions project={p} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      ) : (
        // 阶段视图（PRD §15）
        <Card className="mt-4 overflow-x-auto p-1">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-ink-3">
                <th className="font-semibold px-4 py-3 sticky left-0 bg-white">项目</th>
                {STAGE_SHORTS.map((s) => <th key={s} className="font-semibold px-2 py-3 text-center w-14 whitespace-nowrap">{s}</th>)}
                <th className="font-semibold px-3 py-3 w-20">状态</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-t border-line/70 hover:bg-[#fafaf7] cursor-pointer" onClick={() => navigate(`/project/${p.id}`)}>
                  <td className="px-4 py-2.5 sticky left-0 bg-white font-medium group-hover:text-primary">
                    <span className="font-semibold">{p.name}</span>
                  </td>
                  {p.workflowSnapshot.stages.map((s) => (
                    <td key={s.id} className="px-2 py-2.5 text-center" title={s.name}>
                      <StageDot status={s.status === 'passed' ? 'done' : s.status === 'active' ? 'current' : 'todo'} />
                    </td>
                  ))}
                  <td className="px-3 py-2.5"><StatusBadge status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

function CreateProjectModalDemo() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}><FolderKanban size={15} /> 创建第一个项目</Button>
      <CreateProjectModal open={open} onClose={() => setOpen(false)} onCreated={(id) => navigate(`/project/${id}`)} />
    </>
  )
}

function FocusCard({ project, nextStep }: { project: Project; nextStep: string }) {
  const navigate = useNavigate()
  const { data } = useApp()
  const stage = project.workflowSnapshot.stages.find((s) => s.id === project.currentStageId)
  const step = stage?.steps.find((s) => s.id === project.currentStepId)
  const gate = stage && data ? stageGate(project, stage, data.evidences) : null
  const next = gate?.ready ? 'Gate 已满足 · 可提交成果并做出阶段决策' : nextStep
  return (
    <Card className="mb-5 overflow-hidden border-primary-line bg-gradient-to-br from-white to-primary-soft/40">
      <div className="p-5 flex items-center gap-5">
        <div className="w-11 h-11 rounded-xl bg-primary text-white flex items-center justify-center flex-shrink-0">
          <Target size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[11.5px] font-bold text-primary tracking-wide">
            当前焦点 <PriorityBadge p={project.priority} />
          </div>
          <div className="font-bold text-[16px] mt-0.5">{project.name}</div>
          <div className="text-[13px] text-ink-2 mt-1 flex items-center gap-1.5 flex-wrap">
            <span className="text-ink-3">当前：</span>
            <Badge tone="primary">{stage?.name}</Badge>
            {step && <span className="text-ink-2">{step.name}</span>}
          </div>
          <div className="text-[13px] text-ink-2 mt-0.5 flex items-center gap-1.5">
            <span className="text-ink-3">下一步：</span>
            <span>{next}</span>
          </div>
        </div>
        <Button variant="primary" size="lg" onClick={() => navigate(step && stage ? `/project/${project.id}/stage/${stage.id}/step/${step.id}` : `/project/${project.id}/stage/${stage?.id || ''}`)}>
          <Play size={15} /> 继续
        </Button>
      </div>
    </Card>
  )
}

function RowActions({ project }: { project: Project }) {
  const { load, toast } = useApp()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 })
  const triggerElement = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useLayoutEffect(() => {
    if (!menuOpen || !menuRef.current || !triggerElement.current) return
    const update = () => {
      if (!menuRef.current || !triggerElement.current) return
      setMenuPosition(getMenuPosition(
        triggerElement.current.getBoundingClientRect(),
        menuRef.current.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight }
      ))
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [menuOpen])

  const setStatus = async (status: ProjectStatus, label: string) => {
    setMenuOpen(false)
    try {
      await window.api.setProjectStatus({ id: project.id, status, reason: label })
      await load()
      toast(`项目已${label}`, 'ok')
    } catch (err) { toast((err as Error).message, 'bad') }
  }

  const setPriority = async (priority: Priority) => {
    setMenuOpen(false)
    try {
      await window.api.updateProject({ id: project.id, patch: { priority } })
      await load()
    } catch (err) { toast((err as Error).message, 'bad') }
  }

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button aria-label="打开项目操作菜单" className="p-1.5 rounded-lg text-ink-3 hover:bg-black/5 hover:text-ink" onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        triggerElement.current = event.currentTarget
        setMenuPosition(getMenuPosition(rect, { width: 176, height: 280 }, { width: window.innerWidth, height: window.innerHeight }))
        setMenuOpen((v) => !v)
      }}>
        <MoreHorizontal size={16} />
      </button>
      {menuOpen && createPortal(<>
        <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
        <div ref={menuRef} role="menu" aria-label="项目操作" className="fixed z-50 w-44 bg-white rounded-xl border border-line shadow-xl py-1.5 anim-in text-[13px]" style={menuPosition}>
          <div className="px-3 pt-1 pb-1 text-[11px] font-semibold text-ink-3">优先级</div>
          {(['P1', 'P2', 'P3'] as Priority[]).map((p) => (
            <button key={p} className="w-full text-left px-3 py-1.5 hover:bg-[#faf9f6] flex items-center gap-2" onClick={() => setPriority(p)}>
              <PriorityBadge p={p} /> {p === 'P1' ? '当前主要' : p === 'P2' ? '并行' : '低优先级'}
            </button>
          ))}
          <div className="h-px bg-line my-1" />
          {project.status !== 'paused' && <MenuItem icon={<PauseCircle size={14} />} label="暂停项目" onClick={() => setStatus('paused', '暂停')} />}
          {project.status === 'paused' && <MenuItem icon={<PlayCircle size={14} />} label="恢复推进" onClick={() => setStatus('active', '恢复')} />}
          {project.status !== 'abandoned' && <MenuItem icon={<XCircle size={14} />} label="标记放弃" danger onClick={() => setStatus('abandoned', '放弃')} />}
          <MenuItem icon={<FileDown size={14} />} label="导出报告" onClick={() => { setMenuOpen(false); navigate(`/project/${project.id}`) }} />
          <div className="h-px bg-line my-1" />
          <MenuItem icon={<Trash2 size={14} />} label="删除项目" danger onClick={() => { setMenuOpen(false); setConfirmDelete(true) }} />
        </div>
      </>, document.body)}
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="删除项目" width={420}
        footer={<>
          <Button onClick={() => setConfirmDelete(false)}>取消</Button>
          <Button variant="danger" onClick={async () => {
            await window.api.deleteProject({ id: project.id })
            setConfirmDelete(false)
            await load()
            toast('项目已删除', 'ok')
          }}>确认删除</Button>
        </>}>
        <div className="text-[13.5px] leading-relaxed">确定删除项目「{project.name}」？该项目的全部 Claim、Evidence、资料、决策记录都会一并删除，此操作不可恢复。</div>
      </Modal>
    </div>
  )
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button className={`w-full text-left px-3 py-1.5 hover:bg-[#faf9f6] flex items-center gap-2 ${danger ? 'text-bad' : ''}`} onClick={onClick}>
      {icon} {label}
    </button>
  )
}
