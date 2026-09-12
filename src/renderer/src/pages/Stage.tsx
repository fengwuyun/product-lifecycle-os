import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Compass, Target, HelpCircle, ListChecks, Lightbulb, ShieldCheck,
  FileText, Database, CheckSquare, Square, Plus, Trash2, Sparkles, Gavel,
  ChevronRight, CircleDot, Link2, RefreshCw, Layers
} from 'lucide-react'
import { useApp, stageGate, fmtDate } from '../store/app'
import { Button, Card, Badge, StrengthBadge, EmptyState, Modal } from '../components/ui'
import { EvidenceModal, ArtifactModal, DeliverableModal, DecisionModal, ClaimInlineAdd, ArtifactViewer } from '../components/modals'
import type { ProjectStage, Project, AIReview } from '@shared/types'

export function StagePage() {
  const { projectId, stageId } = useParams()
  const navigate = useNavigate()
  const { data, load, toast } = useApp()

  const [evOpen, setEvOpen] = useState(false)
  const [artOpen, setArtOpen] = useState(false)
  const [delivId, setDelivId] = useState<string | null>(null)
  const [decisionOpen, setDecisionOpen] = useState(false)
  const [viewArtifact, setViewArtifact] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [todoConfirm, setTodoConfirm] = useState(false)

  if (!data) return null
  const project = data.projects.find((p) => p.id === projectId)
  if (!project) return <EmptyState icon={<span>?</span>} title="项目不存在" action={<Button onClick={() => navigate('/')}>返回项目组合</Button>} />
  const stage = project.workflowSnapshot.stages.find((s) => s.id === stageId)
  if (!stage) return <EmptyState icon={<span>?</span>} title="阶段不存在" action={<Button onClick={() => navigate(`/project/${project.id}`)}>返回项目流程</Button>} />

  const gate = stageGate(project, stage, data.evidences)
  const claims = data.claims.filter((c) => c.projectId === project.id && c.stageId === stage.id)
  const evidences = data.evidences.filter((e) => e.projectId === project.id && e.stageId === stage.id)
  const artifacts = data.artifacts.filter((a) => a.projectId === project.id && a.stageId === stage.id)
  const reviews = data.aiReviews.filter((r) => r.projectId === project.id && r.stageId === stage.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const stepsDone = stage.steps.filter((s) => s.status === 'done').length
  const isLocked = stage.status === 'locked'

  const toggleTodo = async (todoId: string) => {
    const todos = stage.todos.map((t) => (t.id === todoId ? { ...t, done: !t.done } : t))
    await window.api.stageUpdate({ projectId: project.id, stageId: stage.id, patch: { todos } })
    await load()
  }
  const toggleCriteria = async (cid: string) => {
    const exitCriteria = stage.exitCriteria.map((c) => (c.id === cid ? { ...c, met: !c.met } : c))
    await window.api.stageUpdate({ projectId: project.id, stageId: stage.id, patch: { exitCriteria } })
    await load()
  }

  const runReview = async () => {
    setReviewing(true)
    try {
      const r = await window.api.aiReviewStage({ projectId: project.id, stageId: stage.id })
      if (r.error) toast(r.error, 'bad')
      else { await load(); toast('AI 审查完成', 'ok') }
    } catch (err) { toast((err as Error).message, 'bad') } finally { setReviewing(false) }
  }

  const doDecision = async (type: string) => {
    if (type === 'ask') {
      setDecisionOpen(true)
      return
    }
    void todoConfirm
    setDecisionOpen(true)
  }
  void doDecision

  return (
    <div className="p-7 max-w-[980px] mx-auto pb-16">
      {/* 面包屑 */}
      <div className="flex items-center gap-1.5 text-[12.5px] text-ink-3 mb-4">
        <Link to="/" className="hover:text-primary">项目组合</Link>
        <ChevronRight size={13} />
        <Link to={`/project/${project.id}`} className="hover:text-primary">{project.name}</Link>
        <ChevronRight size={13} />
        <span className="text-ink-2 font-medium">{stage.name}</span>
      </div>

      {/* 阶段头 */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-[21px] font-bold tracking-tight">
              <span className="text-ink-3 mr-2">{stage.order}.</span>{stage.name}
            </h1>
            {stage.status === 'passed' && <Badge tone="ok">已通过</Badge>}
            {stage.status === 'active' && <Badge tone="primary">进行中</Badge>}
            {stage.status === 'locked' && <Badge tone="gray">未开始</Badge>}
          </div>
          <div className="text-[13px] text-ink-3 mt-1">第 {stage.order} / {project.workflowSnapshot.stages.length} 阶段</div>
        </div>
        {stage.status !== 'passed' && (
          <div className="flex items-center justify-end gap-2 flex-wrap">
            <Button variant="primary" size="lg" onClick={() => setDecisionOpen(true)} disabled={isLocked}>
              <Gavel size={15} /> 阶段决策
            </Button>
            {isLocked && <span className="text-[12px] text-ink-3">当前阶段尚未解锁，完成上一阶段决策后可操作</span>}
          </div>
        )}
      </div>

      {/* 关键问题 */}
      <Card className="p-4 mb-4 bg-gradient-to-r from-primary-soft/60 to-white border-primary-line">
        <div className="flex items-start gap-3">
          <HelpCircle size={18} className="text-primary mt-0.5 flex-shrink-0" />
          <div>
            <div className="text-[11.5px] font-bold text-primary tracking-wide mb-0.5">本阶段关键问题</div>
            <div className="text-[15px] font-semibold text-primary-deep">「{stage.keyQuestion}」</div>
          </div>
        </div>
      </Card>

      {/* 介绍 / 目标 / 方法论 */}
      <Card className="p-5 mb-4">
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <SectionHead icon={<Compass size={14} />} label="阶段介绍" />
            <p className="text-[13px] text-ink-2 leading-relaxed">{stage.introduction}</p>
            <div className="mt-4">
              <SectionHead icon={<Target size={14} />} label="阶段目标" />
              <p className="text-[13px] text-ink-2 leading-relaxed">{stage.objective}</p>
            </div>
          </div>
          <div>
            <SectionHead icon={<Lightbulb size={14} />} label="方法论" />
            <ol className="text-[13px] text-ink-2 leading-relaxed space-y-1.5 list-none">
              {stage.methodology.map((m, i) => (
                <li key={i} className="flex gap-2">
                  <span className="flex-shrink-0 w-4.5 h-4.5 rounded bg-primary-soft text-primary text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                  <span>{m}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Card>

      {/* 执行步骤（Steps） */}
      <SectionTitleBar icon={<Layers size={15} />} title={`执行步骤（Steps，${stepsDone}/${stage.steps.length}）`} desc="每个执行步骤（Steps）都是具体的执行单元：读说明 → 做检查项 → 回答问题" />
      <div className="space-y-2 mb-6">
        {stage.steps.map((step) => {
          const answered = Object.values(step.answers).filter((v) => v && v.trim()).length
          const checklistDone = step.checklist.filter((c) => c.done).length
          return (
            <Link key={step.id} to={`/project/${project.id}/stage/${stage.id}/step/${step.id}`} className="block group">
              <Card className={`p-4 flex items-center gap-3.5 group-hover:border-primary-line group-hover:shadow-sm transition-all ${step.status === 'done' ? 'bg-[#fbfdfc]' : ''}`}>
                {step.status === 'done'
                  ? <CheckSquare size={18} className="text-ok flex-shrink-0" />
                  : <Square size={18} className="text-line-2 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[14px] group-hover:text-primary transition-colors">{step.name}</div>
                  <div className="text-[12px] text-ink-3 mt-0.5 truncate">{step.goal}</div>
                </div>
                <div className="hidden md:flex items-center gap-2.5 text-[11.5px] text-ink-3 tabular-nums flex-shrink-0">
                  <span className={checklistDone === step.checklist.length && step.checklist.length > 0 ? 'text-ok font-semibold' : ''}>检查 {checklistDone}/{step.checklist.length}</span>
                  <span className={answered > 0 ? 'text-primary font-semibold' : ''}>回答 {answered}/{step.questions.length}</span>
                </div>
                <ChevronRight size={16} className="text-line-2 group-hover:text-primary flex-shrink-0" />
              </Card>
            </Link>
          )
        })}
      </div>

      {/* Todo（PRD 必做清单） */}
      <SectionTitleBar icon={<ListChecks size={15} />} title={`阶段 Todo（${gate.todosDone}/${gate.todosTotal}）`} desc="完成这些 Todo 是 Stage Gate 的第一道门槛" />
      <Card className="p-4 mb-6">
        <div className="space-y-2">
          {stage.todos.map((t) => (
            <label key={t.id} className="flex items-center gap-3 text-[13.5px] cursor-pointer group" onClick={() => toggleTodo(t.id)}>
              {t.done ? <CheckSquare size={17} className="text-ok flex-shrink-0" /> : <Square size={17} className="text-line-2 group-hover:text-primary flex-shrink-0" />}
              <span className={t.done ? 'line-through text-ink-3' : ''}>{t.text}</span>
            </label>
          ))}
        </div>
      </Card>

      {/* 假设（Claims） */}
      <SectionTitleBar icon={<CircleDot size={15} />} title={`假设（Claims，${claims.length}）`} desc="本阶段提出、等待证据（Evidence）检验的假设（Claims）" />
      <Card className="p-4 mb-6">
        {claims.length === 0 && <div className="text-[12.5px] text-ink-3 mb-3">还没有假设（Claims）。写下你当前最想验证的假设（Claims），AI 审查时会逐条检查证据（Evidence）支持度。</div>}
        <div className="space-y-2 mb-3">
          {claims.map((c) => {
            const linked = evidences.filter((e) => e.relatedClaimIds.includes(c.id))
            return (
              <div key={c.id} className="flex items-start gap-3 bg-[#faf9f6] border border-line rounded-[10px] px-3.5 py-2.5 group">
                <CircleDot size={14} className="text-primary mt-1 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] leading-relaxed">{c.statement}</div>
                  <div className="text-[11.5px] text-ink-3 mt-1 flex items-center gap-1.5 flex-wrap">
                    <Link2 size={11} /> {linked.length > 0 ? `已关联 ${linked.length} 条证据（Evidence）：${linked.map((e) => e.title).join('、')}` : '尚无证据（Evidence）关联'}
                  </div>
                </div>
                <button aria-label="删除假设（Claims）" className="opacity-50 group-hover:opacity-100 focus:opacity-100 text-ink-3 hover:text-bad focus:text-bad p-1 transition-all" onClick={async () => {
                  await window.api.claimDelete({ id: c.id })
                  await load()
                }}><Trash2 size={13.5} /></button>
              </div>
            )
          })}
        </div>
        <ClaimInlineAdd projectId={project.id} stageId={stage.id} onAdded={load} />
      </Card>

      {/* 证据（Evidence） */}
      <SectionTitleBar icon={<Database size={15} />} title={`证据（Evidence，${evidences.length}${stage.minEvidence > 0 ? ` / 至少 ${stage.minEvidence}` : ''}）`}
        desc="证据（Evidence）来自真实世界。行为 > 表态；AI 会检查证据（Evidence）的成色" extra={
          <Button size="sm" variant="soft" onClick={() => setEvOpen(true)}><Plus size={14} /> 记录证据</Button>
        } />
      {evidences.length === 0 ? (
        <Card className="p-4 mb-6"><div className="text-[12.5px] text-ink-3 text-center py-3">暂无证据（Evidence）—— 去和真实用户聊聊，把发生的事实记下来</div></Card>
      ) : (
        <div className="space-y-2 mb-6">
          {evidences.map((e) => (
            <Card key={e.id} className="p-4 group">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[14px]">{e.title}</span>
                    <StrengthBadge strength={e.strength} />
                    <Badge>{e.type}</Badge>
                  </div>
                  <div className="text-[13px] text-ink-2 mt-1.5 leading-relaxed">{e.content}</div>
                  <div className="text-[11.5px] text-ink-3 mt-1.5 flex items-center gap-3 flex-wrap">
                    <span>{fmtDate(e.createdAt)}</span>
                    {e.sourceUrl && <a href={e.sourceUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1 max-w-[280px] truncate"><Link2 size={11} />{e.sourceUrl}</a>}
                    {e.relatedClaimIds.length > 0 && <span>支持 {e.relatedClaimIds.length} 个假设（Claims）</span>}
                    {e.notes && <span className="text-ink-2">· {e.notes}</span>}
                  </div>
                </div>
                <button aria-label="删除证据（Evidence）" className="opacity-50 group-hover:opacity-100 focus:opacity-100 text-ink-3 hover:text-bad focus:text-bad p-1 transition-all" onClick={async () => {
                  await window.api.evidenceDelete({ id: e.id })
                  await load()
                }}><Trash2 size={13.5} /></button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Deliverables */}
      <SectionTitleBar icon={<FileText size={15} />} title={`阶段成果（${gate.deliverablesDone}/${gate.deliverablesRequired} 必需）`} desc="提交规定格式的成果，是 Stage Gate 的第二道门槛" extra={
        <Button size="sm" variant="soft" onClick={() => setArtOpen(true)}><Plus size={14} /> 添加资料</Button>
      } />
      <div className="space-y-2.5 mb-6">
        {stage.deliverables.map((d) => (
          <Card key={d.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-[14px]">{d.name}</span>
                  {d.required && <Badge tone="primary">必需</Badge>}
                  {d.submittedAt && <Badge tone="ok">已提交 {fmtDate(d.submittedAt)}</Badge>}
                </div>
                <div className="text-[12px] text-ink-3 mt-1">{d.description}</div>
              </div>
              <Button size="sm" variant={d.content ? 'default' : 'primary'} onClick={() => setDelivId(d.id)}>
                {d.content ? '查看 / 编辑' : '提交成果'}
              </Button>
            </div>
            {d.content && (
              <div className="mt-3 bg-[#faf9f6] border border-line rounded-[10px] px-4 py-3 text-[13px] whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">{d.content}</div>
            )}
            {d.artifactIds.length > 0 && (
              <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                <span className="text-[11.5px] text-ink-3">关联资料（Artifacts）：</span>
                {d.artifactIds.map((aid) => {
                  const a = artifacts.find((x) => x.id === aid)
                  return a ? (
                    <button key={aid} onClick={() => setViewArtifact(aid)} className="text-[12px] bg-primary-soft text-primary rounded-full px-2.5 py-0.5 font-medium hover:bg-primary-line/60">
                      {a.title}
                    </button>
                  ) : null
                })}
              </div>
            )}
          </Card>
        ))}

        {/* 本阶段资料列表 */}
        {artifacts.length > 0 && (
          <Card className="p-4">
            <div className="text-[12.5px] font-semibold text-ink-2 mb-2.5">本阶段资料（Artifacts，{artifacts.length}）</div>
            <div className="flex flex-wrap gap-2">
              {artifacts.map((a) => (
                <button key={a.id} onClick={() => setViewArtifact(a.id)}
                  className="flex items-center gap-1.5 bg-[#faf9f6] border border-line rounded-full px-3 py-1.5 text-[12.5px] hover:border-primary-line hover:text-primary transition-colors">
                  <FileText size={12.5} /> {a.title}
                  {a.ext && <span className="text-ink-3">.{a.ext}</span>}
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* AI Review */}
      <SectionTitleBar icon={<ShieldCheck size={15} />} title="AI 审查"
        desc="AI 通读本阶段目标、Todo、假设（Claims）、证据（Evidence）与成果，输出 Ready / 风险 / 证据不足 / 矛盾——但不会替你决策" extra={
          <Button size="sm" variant="soft" loading={reviewing} onClick={runReview}><Sparkles size={14} /> {reviews.length ? '重新审查' : '运行 AI 审查'}</Button>
        } />
      {reviews.length === 0 ? (
        <Card className="p-6"><div className="text-[12.5px] text-ink-3 text-center">尚未审查。建议在提交成果后运行，AI 会找出未验证的假设（Claims）与证据（Evidence）缺口。</div></Card>
      ) : (
        <div className="space-y-3 mb-6">
          {reviews.map((r) => <ReviewCard key={r.id} review={r} />)}
        </div>
      )}

      {/* Exit Criteria */}
      <SectionTitleBar icon={<ShieldCheck size={15} />} title={`Exit Criteria（${gate.criteriaMet}/${gate.criteriaTotal}）`} desc="全部满足后，Stage Gate 才会放行" />
      <Card className="p-4 mb-6">
        <div className="space-y-2">
          {stage.exitCriteria.map((c) => (
            <label key={c.id} className="flex items-center gap-3 text-[13.5px] cursor-pointer group" onClick={() => toggleCriteria(c.id)}>
              {c.met ? <CheckSquare size={17} className="text-ok flex-shrink-0" /> : <Square size={17} className="text-line-2 group-hover:text-primary flex-shrink-0" />}
              <span className={c.met ? 'text-ink-2' : ''}>{c.text}</span>
            </label>
          ))}
        </div>
        <div className={`mt-3.5 rounded-[10px] px-4 py-3 text-[12.5px] leading-relaxed ${gate.ready ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'}`}>
          {gate.ready ? '✓ Stage Gate 已满足 —— 你可以做出阶段决策了' : `Stage Gate 还差：${gate.missing.join('；')}`}
        </div>
      </Card>

      {/* 弹窗集合 */}
      {evOpen && <EvidenceModal open={evOpen} onClose={() => setEvOpen(false)} project={project} stage={stage} claims={claims} onAdded={load} />}
      {artOpen && <ArtifactModal open={artOpen} onClose={() => setArtOpen(false)} project={project} stage={stage} onAdded={load} />}
      {delivId && <DeliverableModal open={!!delivId} onClose={() => setDelivId(null)} project={project} stage={stage} deliverableId={delivId} artifacts={data.artifacts} onSaved={load} />}
      <DecisionModal open={decisionOpen} onClose={() => setDecisionOpen(false)} project={project} stage={stage} gate={gate} onDecided={load} />
      <ArtifactViewer open={!!viewArtifact} onClose={() => setViewArtifact(null)} artifactId={viewArtifact} />
    </div>
  )
}

function SectionHead({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11.5px] font-bold text-ink-3 tracking-widest mb-1.5">
      {icon} {label}
    </div>
  )
}

function SectionTitleBar({ icon, title, desc, extra }: { icon: React.ReactNode; title: string; desc?: string; extra?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between mb-2.5 mt-1">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-primary">{icon}</span>
          <h2 className="font-bold text-[15.5px]">{title}</h2>
        </div>
        {desc && <div className="text-[12px] text-ink-3 mt-0.5 ml-[26px]">{desc}</div>}
      </div>
      {extra}
    </div>
  )
}

function ReviewCard({ review }: { review: AIReview }) {
  const tone = review.status === 'Ready' ? 'ok' : review.status === 'Contradiction' ? 'bad' : 'warn'
  const label = review.status === 'Ready' ? 'Ready · 可以进入决策'
    : review.status === 'Ready with risks' ? 'Ready with risks · 可决策但有风险'
    : review.status === 'Contradiction' ? 'Contradiction · 存在矛盾'
    : 'Insufficient Evidence · 证据不足'
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2.5 mb-3.5">
        <Badge tone={tone as 'ok' | 'warn' | 'bad'}>{label}</Badge>
        <span className="text-[11.5px] text-ink-3">{fmtDate(review.createdAt)}</span>
      </div>
      <div className="space-y-3.5 text-[13px]">
        {review.verified.length > 0 && (
          <div>
            <div className="text-[11.5px] font-bold text-ok mb-1.5">✓ 已验证判断</div>
            {review.verified.map((v, i) => (
              <div key={i} className="flex gap-2 py-0.5">
                <CheckSquare size={14} className="text-ok mt-0.5 flex-shrink-0" />
                <span>{v.text} <span className="text-ink-3 text-[12px]">〔依据：{v.evidence}〕</span></span>
              </div>
            ))}
          </div>
        )}
        {review.unverified.length > 0 && (
          <div>
            <div className="text-[11.5px] font-bold text-warn mb-1.5">⚠ 未验证假设（Claims）</div>
            {review.unverified.map((v, i) => (
              <div key={i} className="py-0.5">
                <div>⚠ {v.text}</div>
                {v.suggestion && <div className="text-ink-3 text-[12px] ml-5">建议：{v.suggestion}</div>}
              </div>
            ))}
          </div>
        )}
        {review.gaps.length > 0 && (
          <div>
            <div className="text-[11.5px] font-bold text-bad mb-1.5">证据（Evidence）不足</div>
            {review.gaps.map((g, i) => (
              <div key={i} className="bg-bad-soft/50 rounded-[8px] px-3 py-2 mb-1.5">
                <div className="font-medium">假设（Claims）：{g.claim}</div>
                <div className="text-ink-2 text-[12.5px]">现有：{g.existing} · 缺失：{g.missing}</div>
              </div>
            ))}
          </div>
        )}
        {review.logicIssues.length > 0 && (
          <div>
            <div className="text-[11.5px] font-bold text-bad mb-1.5">逻辑漏洞</div>
            {review.logicIssues.map((l, i) => <div key={i} className="py-0.5">· {l}</div>)}
          </div>
        )}
        {review.nextStep && (
          <div className="bg-primary-soft/60 rounded-[10px] px-3.5 py-2.5">
            <span className="font-semibold text-primary-deep">下一步最低成本建议：</span>
            <span className="text-[13px]">{review.nextStep}</span>
          </div>
        )}
      </div>
    </Card>
  )
}
