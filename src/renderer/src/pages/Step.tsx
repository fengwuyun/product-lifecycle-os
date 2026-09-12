import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ChevronRight, Target, Info, CheckSquare, Square, Sparkles,
  FileText, Plus, CheckCircle2, CircleDot
} from 'lucide-react'
import { useApp, fmtDate } from '../store/app'
import { Button, Card, Badge, StrengthBadge, EmptyState } from '../components/ui'
import { EvidenceModal, ArtifactModal, ArtifactViewer } from '../components/modals'
import type { ProjectStep } from '@shared/types'

export function StepPage() {
  const { projectId, stageId, stepId } = useParams()
  const navigate = useNavigate()
  const { data, load, toast } = useApp()

  const [evOpen, setEvOpen] = useState(false)
  const [artOpen, setArtOpen] = useState(false)
  const [viewArtifact, setViewArtifact] = useState<string | null>(null)
  const [assist, setAssist] = useState('')
  const [assistBusy, setAssistBusy] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // 本地草稿状态（输入即时响应，失焦/切换时保存）
  const [draft, setDraft] = useState<ProjectStep | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveRevisionRef = useRef(0)
  const currentStepKey = `${projectId ?? ''}:${stageId ?? ''}:${stepId ?? ''}`
  const currentStepKeyRef = useRef(currentStepKey)
  const savedAtRef = useRef<string>('')
  currentStepKeyRef.current = currentStepKey

  useEffect(() => {
    saveRevisionRef.current += 1
    setSaveState('idle')
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        saveTimer.current = null
      }
    }
  }, [currentStepKey])

  useEffect(() => {
    if (!data) return
    const project = data.projects.find((p) => p.id === projectId)
    const stage = project?.workflowSnapshot.stages.find((s) => s.id === stageId)
    const step = stage?.steps.find((s) => s.id === stepId)
    if (step && step.id !== savedAtRef.current) {
      savedAtRef.current = step.id
      setDraft(JSON.parse(JSON.stringify(step)))
    }
  }, [data, projectId, stageId, stepId])

  if (!data || !draft) return <div className="p-10 text-center text-ink-3 text-[13px]">加载中…</div>
  const project = data.projects.find((p) => p.id === projectId)
  if (!project) return <EmptyState icon={<span>?</span>} title="项目不存在" action={<Button onClick={() => navigate('/')}>返回</Button>} />
  const stage = project.workflowSnapshot.stages.find((s) => s.id === stageId)
  if (!stage) return <EmptyState icon={<span>?</span>} title="阶段不存在" action={<Button onClick={() => navigate(`/project/${project.id}`)}>返回</Button>} />

  const stepIndex = stage.steps.findIndex((s) => s.id === stepId)
  const claims = data.claims.filter((c) => c.projectId === project.id && c.stageId === stage.id)
  const evidences = data.evidences.filter((e) => e.projectId === project.id && e.stageId === stage.id)
  const artifacts = data.artifacts.filter((a) => a.projectId === project.id && a.stageId === stage.id)

  const persist = (checklist: ProjectStep['checklist'], answers: ProjectStep['answers']) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const revision = ++saveRevisionRef.current
    const stepKey = currentStepKey
    setSaveState('saving')
    saveTimer.current = setTimeout(async () => {
      try {
        await window.api.stepSave({
          projectId: project.id, stageId: stage.id, stepId: stepId!,
          patch: { checklist, answers }
        })
        await load()
        if (saveRevisionRef.current === revision && currentStepKeyRef.current === stepKey) setSaveState('saved')
      } catch (err) {
        if (saveRevisionRef.current === revision && currentStepKeyRef.current === stepKey) {
          setSaveState('error')
          toast((err as Error).message, 'bad')
        }
      }
    }, 450)
  }

  const toggleCheck = (cid: string) => {
    const current = draft.checklist.find((c) => c.id === cid)
    if (!current) return
    const checklist = draft.checklist.map((c) => (c.id === cid ? { ...c, done: !c.done } : c))
    setDraft({ ...draft, checklist })
    persist(checklist, draft.answers)
  }

  const setAnswer = (qid: string, value: string) => {
    const answers = { ...draft.answers, [qid]: value }
    setDraft({ ...draft, answers })
    persist(draft.checklist, answers)
  }

  const complete = async () => {
    const willComplete = draft.status !== 'done'
    try {
      // 先落盘草稿再标记完成
      await window.api.stepSave({
        projectId: project.id, stageId: stage.id, stepId: stepId!,
        patch: { checklist: draft.checklist, answers: draft.answers }
      })
      await window.api.stepComplete({ projectId: project.id, stageId: stage.id, stepId: stepId!, completed: willComplete })
      await load()
      toast(willComplete ? '执行步骤（Steps）已完成' : '已重新打开', 'ok')
      if (willComplete) {
        const next = stage.steps[stepIndex + 1]
        if (next) navigate(`/project/${project.id}/stage/${stage.id}/step/${next.id}`)
        else navigate(`/project/${project.id}/stage/${stage.id}`)
      }
    } catch (err) { toast((err as Error).message, 'bad') }
  }

  const runAssist = async () => {
    setAssistBusy(true)
    setAssist('')
    try {
      const r = await window.api.aiStepAssist({ projectId: project.id, stageId: stage.id, stepId: stepId! })
      if (r.error) toast(r.error, 'bad')
      else setAssist(r.text || '')
    } catch (err) { toast((err as Error).message, 'bad') } finally { setAssistBusy(false) }
  }

  const isDone = draft.status === 'done'
  const prevStep = stepIndex > 0 ? stage.steps[stepIndex - 1] : null
  const nextStep = stepIndex < stage.steps.length - 1 ? stage.steps[stepIndex + 1] : null

  return (
    <div className="p-7 max-w-[860px] mx-auto pb-16">
      {/* 面包屑 */}
      <div className="flex items-center gap-1.5 text-[12.5px] text-ink-3 mb-4 flex-wrap">
        <Link to="/" className="hover:text-primary">项目组合</Link>
        <ChevronRight size={13} />
        <Link to={`/project/${project.id}`} className="hover:text-primary">{project.name}</Link>
        <ChevronRight size={13} />
        <Link to={`/project/${project.id}/stage/${stage.id}`} className="hover:text-primary">{stage.name}</Link>
        <ChevronRight size={13} />
        <span className="text-ink-2 font-medium">{draft.name}</span>
      </div>

      {/* 头部 */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-[21px] font-bold tracking-tight">
              <span className="text-ink-3 mr-2">执行步骤（Steps）{stepIndex + 1}</span>{draft.name}
            </h1>
            {isDone && <Badge tone="ok">已完成</Badge>}
          </div>
          <div className="flex items-center gap-1.5 text-[12.5px] text-ink-3 mt-1">
            <Target size={12.5} /> 目标：{draft.goal}
          </div>
        </div>
        <Button variant={isDone ? 'default' : 'primary'} size="lg" onClick={complete}>
          <CheckCircle2 size={15} /> {isDone ? '重新打开' : '完成执行步骤（Steps）'}
        </Button>
      </div>

      {/* 说明 */}
      <Card className="p-4 mb-5 bg-[#fbfaf7]">
        <div className="flex items-start gap-3">
          <Info size={15} className="text-ink-3 mt-0.5 flex-shrink-0" />
          <p className="text-[13.5px] text-ink-2 leading-relaxed">{draft.description}</p>
        </div>
      </Card>

      {/* Checklist */}
      <div className="flex items-end justify-between mb-2.5">
        <div>
          <h2 className="font-bold text-[15.5px] flex items-center gap-2">
            <CheckSquare size={15} className="text-primary" /> Checklist
            <span className="text-[12px] font-normal text-ink-3">{draft.checklist.filter((c) => c.done).length}/{draft.checklist.length}</span>
          </h2>
        </div>
      </div>
      <Card className="p-4 mb-6" data-testid="checklist-card">
        <div className="space-y-2.5">
          {draft.checklist.map((c) => {
            return (
              <div key={c.id} className="rounded-[10px] border border-transparent transition-colors">
                <div className="flex items-center gap-3 px-2 py-1.5 text-[13.5px] group">
                  <button type="button" aria-label={c.done ? `取消完成 ${c.text}` : `完成 ${c.text}`} onClick={() => toggleCheck(c.id)}>
                    {c.done ? <CheckSquare size={17} className="text-ok flex-shrink-0" /> : <Square size={17} className="text-line-2 group-hover:text-primary flex-shrink-0" />}
                  </button>
                  <button type="button" className="flex-1 min-w-0 text-left" onClick={() => toggleCheck(c.id)}>
                    <span className={c.done ? 'line-through text-ink-3' : ''}>{c.text}</span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        {draft.questions.length > 0 && (
          <div className="border-t border-line mt-4 pt-4">
            <div className="font-bold text-[15.5px] flex items-center gap-2 mb-3">
              <CircleDot size={15} className="text-primary" /> 需要回答的问题
              <span className="text-[12px] font-normal text-ink-3">回答会自动保存，并汇入阶段成果</span>
              {saveState !== 'idle' && (
                <span role="status" className={saveState === 'error' ? 'text-bad text-[12px] font-normal' : 'text-ink-3 text-[12px] font-normal'}>
                  {saveState === 'saving' ? '保存中…' : saveState === 'saved' ? '已保存' : '保存失败'}
                </span>
              )}
            </div>
            <div className="space-y-3">
            {draft.questions.map((q) => (
              <div key={q.id} className="rounded-[10px] bg-[#faf9f6] p-3.5">
                <div className="text-[13.5px] font-semibold mb-1">{q.q}</div>
                {q.hint && <div className="text-[12px] text-ink-3 mb-2.5">{q.hint}</div>}
                <textarea rows={3} value={draft.answers[q.id] || ''} onChange={(e) => setAnswer(q.id, e.target.value)}
                  placeholder="基于真实观察回答，不要臆测……" />
              </div>
            ))}
            </div>
          </div>
        )}
      </Card>

      {/* AI 辅助 */}
      <Card className="p-4 mb-6 bg-gradient-to-r from-primary-soft/40 to-white border-primary-line">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-[14px] flex items-center gap-1.5"><Sparkles size={14} className="text-primary" /> AI 执行辅助</div>
            <div className="text-[12px] text-ink-3 mt-0.5">卡住了？让 AI 解释这个执行步骤（Steps）为什么重要、给出回答思路（AI 不会替你编造事实）</div>
          </div>
          <Button variant="soft" loading={assistBusy} onClick={runAssist}><Sparkles size={14} /> 获取建议</Button>
        </div>
        {assist && (
          <div className="mt-3.5 bg-white border border-primary-line rounded-[10px] px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap anim-in">{assist}</div>
        )}
      </Card>

      {/* 证据（Evidence）/ 资料（Artifacts）快捷入口 */}
      <div className="grid md:grid-cols-2 gap-3 mb-6">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2.5">
            <div className="font-semibold text-[13.5px]">本阶段证据（Evidence，{evidences.length}）</div>
            <Button size="sm" variant="ghost" onClick={() => setEvOpen(true)}><Plus size={13} /> 记录</Button>
          </div>
          {evidences.length === 0 ? (
            <div className="text-[12px] text-ink-3">暂无本阶段证据（Evidence）。这一步发现的任何真实事实，都值得记录下来。</div>
          ) : (
            <div className="space-y-1.5 max-h-44 overflow-y-auto">
              {evidences.map((e) => (
                <div key={e.id} className="flex items-center gap-2 text-[12.5px] bg-[#faf9f6] rounded-[8px] px-2.5 py-1.5">
                  <span className="truncate flex-1">{e.title}</span>
                  <StrengthBadge strength={e.strength} />
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2.5">
            <div className="font-semibold text-[13.5px]">本阶段资料（Artifacts，{artifacts.length}）</div>
            <Button size="sm" variant="ghost" onClick={() => setArtOpen(true)}><Plus size={13} /> 添加</Button>
          </div>
          {artifacts.length === 0 ? (
            <div className="text-[12px] text-ink-3">暂无本阶段资料（Artifacts）。访谈记录、竞品截图、数据表格都可保存并自动解析。</div>
          ) : (
            <div className="space-y-1.5 max-h-44 overflow-y-auto">
              {artifacts.map((a) => (
                <button key={a.id} onClick={() => setViewArtifact(a.id)} className="w-full flex items-center gap-2 text-[12.5px] bg-[#faf9f6] hover:bg-primary-soft/50 rounded-[8px] px-2.5 py-1.5 text-left transition-colors">
                  <FileText size={12.5} className="text-ink-3 flex-shrink-0" />
                  <span className="truncate flex-1">{a.title}</span>
                  {a.ext && <span className="text-ink-3">.{a.ext}</span>}
                  <span className="text-ink-3">{fmtDate(a.createdAt)}</span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* 上一步 / 下一步 */}
      <div className="flex items-center justify-between">
        {prevStep ? (
          <Link to={`/project/${project.id}/stage/${stage.id}/step/${prevStep.id}`} aria-label={`上一步：${prevStep.name}`}>
            <Button variant="ghost"><ArrowLeft size={14} style={{ marginRight: 4 }} /> {prevStep.name}</Button>
          </Link>
        ) : <span />}
        {nextStep ? (
          <Link to={`/project/${project.id}/stage/${stage.id}/step/${nextStep.id}`} aria-label={`下一步：${nextStep.name}`}>
            <Button variant="ghost">{nextStep.name} <ChevronRight size={14} /></Button>
          </Link>
        ) : (
          <Link to={`/project/${project.id}/stage/${stage.id}`}>
            <Button variant="soft">返回阶段 · 提交成果 <ChevronRight size={14} /></Button>
          </Link>
        )}
      </div>

      <EvidenceModal open={evOpen} onClose={() => setEvOpen(false)} project={project} stage={stage} claims={claims} onAdded={load} />
      <ArtifactModal open={artOpen} onClose={() => setArtOpen(false)} project={project} stage={stage} onAdded={load} />
      <ArtifactViewer open={!!viewArtifact} onClose={() => setViewArtifact(null)} artifactId={viewArtifact} />
    </div>
  )
}
