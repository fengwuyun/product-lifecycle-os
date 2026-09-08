import { useParams, Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  ChevronRight, CheckCircle2, Circle, ArrowLeft, FileDown,
  History, Trophy, PauseCircle, XCircle
} from 'lucide-react'
import { useApp, projectProgress, stageGate, fmtDate } from '../store/app'
import { Button, Card, Badge, PriorityBadge, StatusBadge, ProgressBar, EmptyState, Modal } from '../components/ui'
import type { Project, ProjectStage, Decision } from '@shared/types'

const DECISION_BADGE: Record<string, { tone: 'ok' | 'warn' | 'bad' | 'primary' | 'gray'; label: string }> = {
  advance: { tone: 'ok', label: '继续' },
  rollback: { tone: 'warn', label: '回退' },
  pause: { tone: 'gray', label: '暂停' },
  abandon: { tone: 'bad', label: '放弃' },
  pivot: { tone: 'warn', label: '调整定位' },
  resume: { tone: 'primary', label: '恢复' },
  complete: { tone: 'ok', label: '完成' }
}

export function PipelinePage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const { data, toast } = useApp()
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [withSummary, setWithSummary] = useState(false)

  if (!data) return null
  const project = data.projects.find((p) => p.id === projectId)
  if (!project) return <EmptyState icon={<span>?</span>} title="项目不存在" action={<Button onClick={() => navigate('/')}>返回 Portfolio</Button>} />

  const prog = projectProgress(project)
  const stages = [...project.workflowSnapshot.stages].sort((a, b) => a.order - b.order)
  const decisions = data.decisions.filter((d) => d.projectId === project.id)
  const gate = stages.find((s) => s.id === project.currentStageId) ? stageGate(project, stages.find((s) => s.id === project.currentStageId)!, data.evidences) : null

  const exportReport = async () => {
    setExporting(true)
    try {
      const r = await window.api.reportExport({ projectId: project.id, withAiSummary: withSummary })
      if (r.canceled) return
      if (r.error) toast(r.error, 'bad')
      else if (r.path) toast('报告已导出：' + r.path.split(/[\\/]/).pop(), 'ok')
    } catch (err) { toast((err as Error).message, 'bad') } finally { setExporting(false) }
  }

  return (
    <div className="p-7 max-w-[1000px] mx-auto pb-16">
      {/* 顶部：项目信息 */}
      <div className="flex items-start gap-4 mb-5">
        <button onClick={() => navigate('/')} className="mt-1.5 p-1.5 rounded-lg text-ink-3 hover:bg-black/5 hover:text-ink transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-[21px] font-bold tracking-tight">{project.name}</h1>
            <PriorityBadge p={project.priority} />
            <StatusBadge status={project.status} />
            <Badge tone="gray">Playbook v{project.playbookVersion}</Badge>
          </div>
          {project.description && <p className="text-[13px] text-ink-3 mt-1">{project.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setTimelineOpen(true)}><History size={15} /> 决策记录</Button>
          <Button variant="primary" loading={exporting} onClick={() => setWithSummary(true)}><FileDown size={15} /> 导出报告</Button>
        </div>
      </div>

      {/* 进度条 */}
      <Card className="p-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="text-[12.5px] text-ink-3 whitespace-nowrap">整体进度</div>
          <ProgressBar value={prog.total ? (prog.done / prog.total) * 100 : 0} className="flex-1" />
          <div className="text-[12.5px] font-semibold tabular-nums">{prog.done}/{prog.total} Steps</div>
          {gate && !gate.ready && (
            <Badge tone="warn" className="ml-2">Gate：还差 {gate.missing.length} 项</Badge>
          )}
        </div>
      </Card>

      {/* 生命周期 Pipeline（PRD §16） */}
      <div className="space-y-2.5">
        {stages.map((stage, idx) => (
          <StageRow key={stage.id} project={project} stage={stage} idx={idx} decisions={decisions} />
        ))}
      </div>

      {/* 决策 Timeline 弹窗 */}
      <Modal open={timelineOpen} onClose={() => setTimelineOpen(false)} title="Decision Timeline · 决策记录" width={620}>
        {decisions.length === 0 ? <div className="text-ink-3 text-[13px] py-6 text-center">暂无决策记录</div> : (
          <div className="border-l-2 border-line ml-2 pl-5 space-y-5 py-1">
            {decisions.map((d) => {
              const badge = DECISION_BADGE[d.type] || { tone: 'gray' as const, label: d.type }
              return (
                <div key={d.id} className="relative">
                  <span className="absolute -left-[27px] top-1 w-2.5 h-2.5 rounded-full bg-primary ring-3 ring-primary/15" />
                  <div className="flex items-center gap-2 text-[12px] text-ink-3">
                    {fmtDate(d.createdAt)} · {d.stageName && <span>{d.stageName}</span>}
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </div>
                  <div className="text-[13.5px] mt-1 leading-relaxed">{d.reason || <span className="text-ink-3">（未填写原因）</span>}</div>
                </div>
              )
            })}
          </div>
        )}
      </Modal>

      {/* 导出报告弹窗 */}
      <ExportModal open={withSummary} onClose={() => setWithSummary(false)} onConfirm={async (ai) => {
        setWithSummary(false)
        setExporting(true)
        try {
          const r = await window.api.reportExport({ projectId: project.id, withAiSummary: ai })
          if (!r.canceled && r.path) toast('报告已导出', 'ok')
          else if (r.error) toast(r.error, 'bad')
        } catch (err) { toast((err as Error).message, 'bad') } finally { setExporting(false) }
      }} />
    </div>
  )
}

function ExportModal({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (withAi: boolean) => void }) {
  return (
    <Modal open={open} onClose={onClose} title="导出项目报告" width={460}
      footer={<>
        <Button onClick={onClose}>取消</Button>
        <Button variant="primary" onClick={() => onConfirm(true)}>生成并导出</Button>
      </>}>
      <div className="text-[13px] text-ink-2 leading-relaxed mb-4">
        导出为<b>单文件 HTML</b>（双击即可查看），包含全部阶段执行情况、Claims &amp; Evidence、资料完整正文、AI Review 与 Decision Timeline。
      </div>
      <div className="text-[13px] font-semibold mb-2">AI 项目总结</div>
      <div className="text-[12.5px] text-ink-3 leading-relaxed">导出时可让 AI 通读全部阶段数据，生成项目总结（需要已在设置中配置 AI 服务）。</div>
    </Modal>
  )
}

function StageRow({ project, stage, idx, decisions }: { project: Project; stage: ProjectStage; idx: number; decisions: Decision[] }) {
  const { data } = useApp()
  if (!data) return null
  const gate = stageGate(project, stage, data.evidences)
  const evCount = gate.evidenceCount
  const stageDecisions = decisions.filter((d) => d.stageId === stage.id)

  const dot = stage.status === 'passed' ? <CheckCircle2 size={22} className="text-ok" />
    : stage.status === 'active' ? <span className="w-[22px] h-[22px] rounded-full bg-primary ring-4 ring-primary/15 flex items-center justify-center"><span className="w-2 h-2 rounded-full bg-white" /></span>
    : stage.status === 'abandoned' ? <XCircle size={22} className="text-bad/60" />
    : <Circle size={22} className="text-line-2" />

  return (
    <Link to={`/project/${project.id}/stage/${stage.id}`} className="block group">
      <Card className={`p-4 flex items-center gap-4 transition-all group-hover:border-primary-line group-hover:shadow-sm ${stage.status === 'active' ? 'border-primary-line bg-gradient-to-r from-white to-primary-soft/25' : ''}`}>
        <div className="flex flex-col items-center gap-1">
          {dot}
          {idx < project.workflowSnapshot.stages.length - 1 && <span className="w-px h-4 bg-line-2" />}
        </div>
        <div className="w-8 text-center">
          <div className={`text-[15px] font-bold ${stage.status === 'locked' ? 'text-line-2' : 'text-ink'}`}>{idx + 1}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-semibold text-[15px] ${stage.status === 'locked' ? 'text-ink-3' : ''}`}>{stage.name}</span>
            {stage.status === 'passed' && <Badge tone="ok">已通过</Badge>}
            {stage.status === 'active' && <Badge tone="primary">进行中</Badge>}
            {stage.status === 'abandoned' && <Badge tone="bad">已放弃</Badge>}
            {stage.decision && stageDecisions.length > 0 && (
              <Badge tone={DECISION_BADGE[stage.decision.type]?.tone || 'gray'}>
                {DECISION_BADGE[stage.decision.type]?.label || stage.decision.type} · {fmtDate(stage.decision.at)}
              </Badge>
            )}
          </div>
          <div className="text-[12.5px] text-ink-3 mt-1 truncate">{stage.keyQuestion}</div>
        </div>
        {/* Gate 摘要 */}
        <div className="hidden md:flex items-center gap-3 text-[11.5px] text-ink-3 tabular-nums flex-shrink-0">
          <span className={gate.todosDone === gate.todosTotal ? 'text-ok font-semibold' : ''}>Todo {gate.todosDone}/{gate.todosTotal}</span>
          <span className={gate.deliverablesDone === gate.deliverablesRequired ? 'text-ok font-semibold' : ''}>成果 {gate.deliverablesDone}/{gate.deliverablesRequired}</span>
          <span className={evCount >= gate.evidenceRequired ? 'text-ok font-semibold' : ''}>证据 {evCount}/{gate.evidenceRequired}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {stage.status === 'active' && gate.ready && <Badge tone="ok"><Trophy size={11} /> 可决策</Badge>}
          {stage.status === 'active' && !gate.ready && <Badge tone="warn"><PauseCircle size={11} /> 推进中</Badge>}
          <ChevronRight size={17} className="text-line-2 group-hover:text-primary transition-colors" />
        </div>
      </Card>
    </Link>
  )
}
