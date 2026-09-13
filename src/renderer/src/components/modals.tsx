import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, FileText, Trash2, ExternalLink, ShieldAlert, Sparkles } from 'lucide-react'
import type { EvidenceStrength, Priority, ProjectStage, Project, Claim, ArtifactMeta, DecisionType, StageGate } from '@shared/types'
import { EVIDENCE_STRENGTHS } from '@shared/types'
import { Modal, Field, Button, Badge } from './ui'
import { useApp, fmtDate } from '../store/app'

// ─── 创建项目 ───

export function CreateProjectModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (id: string) => void }) {
  const { data, toast, load } = useApp()
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [priority, setPriority] = useState<Priority>('P1')
  const [busy, setBusy] = useState(false)
  const playbook = data?.playbooks[0]

  const reset = () => { setName(''); setDesc(''); setPriority('P1') }
  const submit = async () => {
    if (!name.trim()) { toast('请填写项目名称', 'bad'); return }
    setBusy(true)
    try {
      const r = await window.api.createProject({ name, description: desc, priority })
      await load()
      toast('项目已创建', 'ok')
      reset()
      onCreated?.(r.projectId)
      onClose()
    } catch (err) { toast((err as Error).message, 'bad') } finally { setBusy(false) }
  }

  return (
    <Modal
      open={open} onClose={() => { reset(); onClose() }} title="创建新项目" width={520}
      footer={<>
        <Button onClick={() => { reset(); onClose() }}>取消</Button>
        <Button variant="primary" loading={busy} onClick={submit}>创建项目</Button>
      </>}
    >
      <div className="text-[12.5px] text-ink-3 mb-4 -mt-1">
        项目将基于 <b className="text-ink-2">{playbook?.name} v{playbook?.version}</b> 创建生命周期快照，之后修改 Playbook 不影响本项目。
      </div>
      <Field label="项目名称" required>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：小时工记账" autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
      </Field>
      <Field label="一句话描述" hint="它是什么、为谁解决什么">
        <textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="为按天结算的小时工提供最轻量的工时与工资记录工具" />
      </Field>
      <Field label="优先级" hint="P1 当前主要项目 · P2 并行 · P3 低优先级">
        <div className="flex gap-2">
          {(['P1', 'P2', 'P3'] as Priority[]).map((p) => (
            <button key={p} onClick={() => setPriority(p)}
              className={`h-8.5 px-4 rounded-[9px] text-[13px] font-semibold border transition-all ${priority === p ? 'bg-primary text-white border-primary' : 'bg-white border-line-2 text-ink-2 hover:border-ink-3'}`}>
              {p}
            </button>
          ))}
        </div>
      </Field>
    </Modal>
  )
}

// ─── Evidence 新增 ───

export function EvidenceModal({ open, onClose, project, stage, claims, onAdded }: {
  open: boolean; onClose: () => void; project: Project; stage: ProjectStage; claims: Claim[]; onAdded: () => void
}) {
  const { toast } = useApp()
  const [title, setTitle] = useState('')
  const [type, setType] = useState('用户访谈')
  const [strength, setStrength] = useState<EvidenceStrength>('中')
  const [content, setContent] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [related, setRelated] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const TYPES = ['用户访谈', '用户行为', '社区讨论', '用户评论', '竞品收费页面', '搜索数据', '实际付款', '产品数据', '用户反馈', '其他']

  useEffect(() => {
    if (open) { setTitle(''); setType('用户访谈'); setStrength('中'); setContent(''); setSourceUrl(''); setNotes(''); setRelated([]) }
  }, [open])

  const submit = async () => {
    if (!title.trim() || !content.trim()) { toast('请填写证据标题和内容', 'bad'); return }
    setBusy(true)
    try {
      await window.api.evidenceAdd({
        projectId: project.id, stageId: stage.id, title: title.trim(), type, strength,
        content: content.trim(), sourceUrl: sourceUrl.trim() || undefined, notes: notes.trim() || undefined,
        relatedClaimIds: related
      })
      toast('证据（Evidence）已记录', 'ok')
      onAdded()
      onClose()
    } catch (err) { toast((err as Error).message, 'bad') } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="记录证据（Evidence）" width={620}
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" loading={busy} onClick={submit}>保存证据</Button></>}>
      <div className="bg-warn-soft/70 text-warn text-[12.5px] rounded-[9px] px-3.5 py-2.5 mb-4 leading-relaxed">
        <ShieldAlert size={13} className="inline mr-1 -mt-0.5" />
        证据（Evidence）必须来自真实世界（访谈、行为、数据、付款），不要把你的判断或行业常识记录为证据。
      </div>
      <Field label="证据标题" required>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：4 位受访者中 3 位有被少算工资的经历" autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="证据类型">
          <select value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        </Field>
        <Field label="证据强度" hint="行为 > 表态">
          <select value={strength} onChange={(e) => setStrength(e.target.value as EvidenceStrength)}>
            {EVIDENCE_STRENGTHS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      <Field label="证据内容" required hint="发生了什么？你怎么知道的？">
        <textarea rows={4} value={content} onChange={(e) => setContent(e.target.value)} placeholder="记录具体事实：谁、什么时候、做了什么、数字是多少……" />
      </Field>
      <Field label="来源链接" hint="可选">
        <input type="text" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" />
      </Field>
      {claims.length > 0 && (
        <Field label="关联假设（Claims）" hint="此证据（Evidence）支持哪些假设（Claims）">
          <div className="space-y-1.5">
            {claims.map((c) => (
              <label key={c.id} className="flex items-start gap-2.5 text-[13px] bg-[#faf9f6] border border-line rounded-[9px] px-3 py-2 cursor-pointer hover:border-line-2">
                <input type="checkbox" className="mt-0.5" checked={related.includes(c.id)}
                  onChange={(e) => setRelated((r) => e.target.checked ? [...r, c.id] : r.filter((x) => x !== c.id))} />
                <span className="min-w-0">{c.statement}</span>
              </label>
            ))}
          </div>
        </Field>
      )}
      <Field label="备注" hint="可选">
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Modal>
  )
}

// ─── Artifact 新增 ───

export function ArtifactModal({ open, onClose, project, stage, onAdded }: {
  open: boolean; onClose: () => void; project: Project; stage: ProjectStage; onAdded: () => void
}) {
  const { toast } = useApp()
  const [mode, setMode] = useState<'file' | 'text'>('file')
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [content, setContent] = useState('')
  const [pickedPath, setPickedPath] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (open) { setMode('file'); setTitle(''); setNotes(''); setContent(''); setPickedPath('') } }, [open])

  const pick = async () => {
    const r = await window.api.pickFile({
      filters: [
        { name: '支持的文件', extensions: ['txt', 'md', 'pdf', 'docx', 'xlsx', 'csv', 'png', 'jpg', 'jpeg', 'gif', 'webp'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    if (!r.canceled && r.path) {
      setPickedPath(r.path)
      if (!title) setTitle(r.path.split(/[\\/]/).pop() || '')
    }
  }

  const submit = async () => {
    setBusy(true)
    try {
      if (mode === 'file') {
        if (!pickedPath) { toast('请先选择文件', 'bad'); return }
        const r = await window.api.artifactAddFromFile({ projectId: project.id, stageId: stage.id, title: title.trim(), notes: notes.trim() || undefined, path: pickedPath })
        if (r.error) { toast(r.error, 'bad'); return }
        if (r.artifact) { toast('资料（Artifacts）已保存并解析', 'ok'); onAdded(); onClose() }
      } else {
        if (!title.trim() || !content.trim()) { toast('请填写标题和正文', 'bad'); return }
        await window.api.artifactAddFromText({ projectId: project.id, stageId: stage.id, title: title.trim(), content, notes: notes.trim() || undefined })
        toast('资料（Artifacts）已保存', 'ok')
        onAdded(); onClose()
      }
    } catch (err) { toast((err as Error).message, 'bad') } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="添加资料（Artifacts）" width={620}
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" loading={busy} onClick={submit}>保存资料</Button></>}>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setMode('file')} className={`h-8.5 px-4 rounded-[9px] text-[13px] font-medium border transition-all flex items-center gap-1.5 ${mode === 'file' ? 'bg-primary-soft text-primary border-primary-line' : 'bg-white border-line-2 text-ink-2'}`}>
          <Upload size={14} /> 本地文件
        </button>
        <button onClick={() => setMode('text')} className={`h-8.5 px-4 rounded-[9px] text-[13px] font-medium border transition-all flex items-center gap-1.5 ${mode === 'text' ? 'bg-primary-soft text-primary border-primary-line' : 'bg-white border-line-2 text-ink-2'}`}>
          <FileText size={14} /> 录入文本
        </button>
      </div>
      {mode === 'file' ? (
        <div className="border-2 border-dashed border-line-2 rounded-xl p-5 text-center mb-1 hover:border-primary/50 transition-colors">
          <input type="text" readOnly value={pickedPath} placeholder="支持 TXT / MD / PDF / DOCX / XLSX / CSV / 图片"
            onClick={pick} className="cursor-pointer bg-transparent text-center mb-3" />
          <Button onClick={pick} variant="soft"><Upload size={14} /> 选择文件</Button>
          <div className="text-[12px] text-ink-3 mt-3">文件会复制进本地数据目录，并自动解析出正文参与 AI 审查与报告</div>
        </div>
      ) : (
        <Field label="正文内容" required>
          <textarea rows={7} value={content} onChange={(e) => setContent(e.target.value)} placeholder="粘贴访谈记录、竞品分析、评论摘录……" />
        </Field>
      )}
      <Field label="资料标题" required>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：竞品分析报告" />
      </Field>
      <Field label="备注" hint="可选">
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="这份资料（Artifacts）说明了什么？" />
      </Field>
    </Modal>
  )
}

// ─── Deliverable 提交 ───

export function DeliverableModal({ open, onClose, project, stage, deliverableId, artifacts, onSaved }: {
  open: boolean; onClose: () => void; project: Project; stage: ProjectStage
  deliverableId: string | null; artifacts: ArtifactMeta[]; onSaved: () => void
}) {
  const { toast } = useApp()
  const d = stage.deliverables.find((x) => x.id === deliverableId)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [artifactIds, setArtifactIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open && d) { setTitle(d.title || d.name); setContent(d.content || ''); setArtifactIds(d.artifactIds || []) }
  }, [open, deliverableId])

  const submit = async () => {
    if (!d) return
    if (!content.trim()) { toast('请填写成果内容', 'bad'); return }
    setBusy(true)
    try {
      await window.api.deliverableSubmit({ projectId: project.id, stageId: stage.id, deliverableId: d.id, title: title.trim(), content, artifactIds })
      toast('成果已提交', 'ok')
      onSaved(); onClose()
    } catch (err) { toast((err as Error).message, 'bad') } finally { setBusy(false) }
  }

  if (!d) return null
  const stageArtifacts = artifacts.filter((a) => a.projectId === project.id && a.stageId === stage.id)

  return (
    <Modal open={open} onClose={onClose} title={`提交成果：${d.name}`} width={680}
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" loading={busy} onClick={submit}>提交成果</Button></>}>
      <div className="bg-[#faf9f6] border border-line rounded-[10px] px-4 py-3 mb-4 text-[12.5px] text-ink-2 leading-relaxed">
        <b className="text-ink">要求：</b>{d.description}
      </div>
      <Field label="标题">
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="成果内容" required hint="可从各执行步骤（Steps）的回答整合而来">
        <textarea rows={9} value={content} onChange={(e) => setContent(e.target.value)} placeholder="直接把成果写在这里（支持换行分段）……" />
      </Field>
      <Field label="关联资料（Artifacts）" hint="把已有资料（Artifacts）作为成果附件">
        {stageArtifacts.length === 0 ? (
          <div className="text-[12.5px] text-ink-3">本阶段还没有资料（Artifacts），可先在「资料（Artifacts）」区添加</div>
        ) : (
          <div className="space-y-1.5">
            {stageArtifacts.map((a) => (
              <label key={a.id} className="flex items-center gap-2.5 text-[13px] bg-[#faf9f6] border border-line rounded-[9px] px-3 py-2 cursor-pointer hover:border-line-2">
                <input type="checkbox" checked={artifactIds.includes(a.id)} className="mt-0.5"
                  onChange={(e) => setArtifactIds((r) => e.target.checked ? [...r, a.id] : r.filter((x) => x !== a.id))} />
                <FileText size={14} className="text-ink-3 flex-shrink-0" />
                <span className="min-w-0 truncate">{a.title}</span>
                {a.ext && <Badge className="ml-auto">{a.ext}</Badge>}
              </label>
            ))}
          </div>
        )}
      </Field>
    </Modal>
  )
}

// ─── Stage 决策（用户拥有最终决策权，PRD §4.4 / §13） ───

export function DecisionModal({ open, onClose, project, stage, gate, onDecided }: {
  open: boolean; onClose: () => void; project: Project; stage: ProjectStage; gate: StageGate; onDecided: () => void
}) {
  const { toast } = useApp()
  const navigate = useNavigate()
  const [type, setType] = useState<DecisionType>('advance')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (open) { setType('advance'); setReason('') } }, [open])

  const isFinal = stage.order === project.workflowSnapshot.stages.length
  const options: { type: DecisionType; label: string; desc: string }[] = isFinal
    ? [
        { type: 'advance', label: '完成项目 · 生命周期闭环', desc: '市场验证通过，本轮产品周期结束' },
        { type: 'pivot', label: '调整定位 / 重新设计 MVP', desc: '数据不支持当前假设，带着教训重新开始' },
        { type: 'rollback', label: '回退 · 继续当前阶段', desc: '数据不足，补充验证后再决策' },
        { type: 'pause', label: '暂停项目', desc: '保留全部记录，择机重启' },
        { type: 'abandon', label: '放弃项目', desc: '诚实地承认这条路走不通' }
      ]
    : [
        { type: 'advance', label: '继续 · 进入下一阶段', desc: '阶段目标已达成，进入下一步' },
        { type: 'rollback', label: '回退 · 本阶段补充验证', desc: '证据不够扎实，继续留在本阶段' },
        { type: 'pause', label: '暂停项目', desc: '保留全部记录，择机重启' },
        { type: 'abandon', label: '放弃项目', desc: '诚实地承认这条路走不通' }
      ]

  const submit = async () => {
    if (!reason.trim()) { toast('决策必须填写原因——这是方法论闭环的关键', 'bad'); return }
    setBusy(true)
    try {
      await window.api.applyDecision({ projectId: project.id, stageId: stage.id, type, reason: reason.trim() })
      toast('决策已记录', 'ok')
      onDone()
    } catch (err) { toast((err as Error).message, 'bad') } finally { setBusy(false) }
  }

  const onDone = () => {
    onDecided()
    onClose()
    if (type === 'advance' && !isFinal) navigate(`/project/${project.id}`)
    if (type === 'abandon' || (type === 'advance' && isFinal)) navigate('/')
  }

  return (
    <Modal open={open} onClose={onClose} title={`阶段决策：${stage.name}`} width={600}
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" loading={busy} onClick={submit}>
        <Sparkles size={14} /> 确认决策
      </Button></>}>
      {!gate.ready && (
        <div className="bg-warn-soft/80 text-warn rounded-[10px] px-4 py-3 mb-4 text-[12.5px] leading-relaxed">
          <ShieldAlert size={13} className="inline mr-1 -mt-0.5" />
          <b>Stage Gate 未完全满足：</b>{gate.missing.join('；')}。你有权在任何状态下做出决策（决策权在你），但建议先补齐再推进。
        </div>
      )}
      {stage.decisionHint && (
        <div className="bg-primary-soft/70 text-primary-deep rounded-[10px] px-4 py-3 mb-4 text-[12.5px] leading-relaxed">{stage.decisionHint}</div>
      )}
      <div className="text-[12.5px] font-semibold text-ink-2 mb-2">决策选项</div>
      <div className="grid grid-cols-1 gap-2 mb-4">
        {options.map((opt) => (
          <button key={opt.type} onClick={() => setType(opt.type)}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-[10px] border text-left transition-all ${
              type === opt.type ? 'border-primary bg-primary-soft' : 'border-line-2 bg-white hover:border-ink-3'
            }`}>
            <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${type === opt.type ? 'border-primary' : 'border-line-2'}`}>
              {type === opt.type && <span className="w-2 h-2 rounded-full bg-primary" />}
            </span>
            <span className="min-w-0">
              <span className={`block text-[13.5px] font-medium ${type === opt.type ? 'text-primary-deep' : 'text-ink'}`}>{opt.label}</span>
              <span className="block text-[12px] text-ink-3">{opt.desc}</span>
            </span>
          </button>
        ))}
      </div>
      <Field label="决策原因" required hint="写清楚为什么，未来的你会感谢现在的记录">
        <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder={isFinal ? '例如：转化率 2.1% 高于失败标准，付费验证通过，决定完成本轮周期……' : '例如：找到 3 个真实付费证据，验证通过，进入竞品研究……'} />
      </Field>
    </Modal>
  )
}

// ─── Claim 内联新增（Stage 页） ───

export function ClaimInlineAdd({ projectId, stageId, onAdded }: { projectId: string; stageId: string; onAdded: () => void }) {
  const { toast } = useApp()
  const [statement, setStatement] = useState('')
  const [busy, setBusy] = useState(false)

  const add = async () => {
    if (!statement.trim()) { toast('请填写假设内容', 'bad'); return }
    setBusy(true)
    try {
      await window.api.claimAdd({ projectId, stageId, statement: statement.trim() })
      setStatement('')
      onAdded()
      toast('假设（Claims）已添加', 'ok')
    } catch (err) { toast((err as Error).message, 'bad') } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <input type="text" value={statement} onChange={(e) => setStatement(e.target.value)}
        className="min-w-0" placeholder="提出一个可被证据（Evidence）支持或证伪的假设（Claims），例如：小时工愿意持续记录每天工时"
        onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
      <Button className="self-start sm:self-auto" variant="soft" loading={busy} onClick={add}>添加</Button>
    </div>
  )
}

// ─── Artifact 内容查看 ───

export function ArtifactViewer({ open, onClose, artifactId }: { open: boolean; onClose: () => void; artifactId: string | null }) {
  const [artifact, setArtifact] = useState<(ArtifactMeta & { extractedContent?: string; extractedHtml?: string }) | null>(null)
  const [loading, setLoading] = useState(false)
  const { toast } = useApp()

  useEffect(() => {
    if (open && artifactId) {
      setLoading(true)
      window.api.artifactGetContent({ id: artifactId }).then((a) => setArtifact(a)).finally(() => setLoading(false))
    } else setArtifact(null)
  }, [open, artifactId])

  const ext = artifact?.ext || ''
  const isImg = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)

  return (
    <Modal open={open} onClose={onClose} title={artifact?.title || '资料（Artifacts）详情'} width={760} footer={
      artifact?.sourceType === 'file' && artifact?.filePath ? (
        <Button onClick={() => window.api.openPath({ path: artifact.filePath! }).catch((e) => toast((e as Error).message, 'bad'))}>
          <ExternalLink size={14} /> 打开原文件
        </Button>
      ) : undefined
    }>
      {loading ? <div className="py-10 text-center text-ink-3 text-[13px]">加载中…</div> : !artifact ? (
        <div className="py-10 text-center text-ink-3 text-[13px]">未找到资料（Artifacts）</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {artifact.sourceType === 'file' && <Badge>{artifact.ext ? `.${artifact.ext}` : '文件'}</Badge>}
            {artifact.sizeBytes != null && <Badge>{(artifact.sizeBytes / 1024).toFixed(1)} KB</Badge>}
            <Badge>添加于 {fmtDate(artifact.createdAt)}</Badge>
            <span className="ml-auto" />
            <Button size="sm" variant="ghost" onClick={async () => {
              await window.api.artifactDelete({ id: artifact.id })
              toast('资料已删除', 'ok')
              onClose()
            }}><Trash2 size={13} /> 删除资料</Button>
          </div>
          {artifact.notes && <div className="bg-[#faf9f6] border border-line rounded-[9px] px-3.5 py-2.5 text-[13px] mb-4">{artifact.notes}</div>}
          {isImg && artifact.filePath && <img src={`file://${artifact.filePath.replace(/\\/g, '/')}`} className="max-w-full rounded-[10px] border border-line mb-4" />}
          {artifact.extractedHtml ? (
            <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: artifact.extractedHtml }} />
          ) : artifact.extractedContent ? (
            <pre className="bg-[#faf9f6] border border-line rounded-[10px] p-4 text-[12.5px] whitespace-pre-wrap break-words max-h-[420px] overflow-auto font-mono leading-relaxed">{artifact.extractedContent}</pre>
          ) : !isImg ? (
            <div className="text-ink-3 text-[13px] py-6 text-center">无解析正文</div>
          ) : null}
        </>
      )}
    </Modal>
  )
}
