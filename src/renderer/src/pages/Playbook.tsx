import { useState, useMemo } from 'react'
import {
  BookOpen, Plus, Trash2, ArrowUp, ArrowDown, Save, History,
  ChevronDown, ChevronRight, GripVertical, Layers, ShieldAlert
} from 'lucide-react'
import { useApp, fmtDate } from '../store/app'
import { Button, Card, Badge, Field, Modal } from '../components/ui'
import type { PlaybookStageDef, PlaybookStepDef } from '@shared/types'

let tmpSeq = 1
const tmpId = (p: string) => `${p}_tmp${tmpSeq++}_${Math.random().toString(36).slice(2, 6)}`

export function reconcileChecklistItems(previous: PlaybookStepDef['checklist'], lines: string[]): PlaybookStepDef['checklist'] {
  const remaining = [...previous]
  return lines.map((text, index) => {
    const exactIndex = remaining.findIndex((item) => item.text === text)
    if (exactIndex >= 0) return { ...remaining.splice(exactIndex, 1)[0], text }
    const renamedIndex = remaining.findIndex((item) => !lines.includes(item.text))
    if (renamedIndex >= 0) return { ...remaining.splice(renamedIndex, 1)[0], text }
    return { id: tmpId(`c${index}`), text }
  })
}

export function PlaybookPage() {
  const { data, load, toast } = useApp()
  const [draft, setDraft] = useState<PlaybookStageDef[] | null>(null)
  const [selected, setSelected] = useState(0)
  const [expandedStep, setExpandedStep] = useState<string | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)

  if (!data) return null
  const playbook = data.playbooks[0]
  if (!playbook) return <div className="p-10 text-center text-ink-3">Playbook 加载失败</div>

  const stages = draft ?? playbook.stages
  const stage = stages[selected]

  const editStage = (patch: Partial<PlaybookStageDef>) => {
    if (!stage) return
    setDraft(stages.map((s, i) => (i === selected ? { ...s, ...patch } : s)))
    setDirty(true)
  }

  const moveStage = (idx: number, dir: -1 | 1) => {
    const next = [...stages]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setDraft(next.map((s, i) => ({ ...s, order: i + 1 })))
    setSelected(target)
    setDirty(true)
  }

  const addStage = () => {
    const s: PlaybookStageDef = {
      id: tmpId('stg'),
      name: '新阶段',
      short: '新',
      order: stages.length + 1,
      introduction: '',
      objective: '',
      keyQuestion: '这一阶段要回答的关键问题？',
      methodology: [],
      todos: [{ id: tmpId('t'), text: '第一个 Todo' }],
      steps: [],
      deliverables: [],
      exitCriteria: [{ id: tmpId('ec'), text: '第一个退出条件' }],
      minEvidence: 0
    }
    setDraft([...stages, s])
    setSelected(stages.length)
    setDirty(true)
  }

  const removeStage = (idx: number) => {
    if (stages.length <= 1) { toast('至少保留一个阶段', 'bad'); return }
    setDraft(stages.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 })))
    setSelected(Math.max(0, idx - 1))
    setDirty(true)
  }

  const save = async () => {
    setBusy(true)
    try {
      const r = await window.api.playbookSave({ id: playbook.id, name: playbook.name, description: playbook.description, stages, note: note.trim() || '方法论调整' })
      await load()
      setDraft(null)
      setDirty(false)
      setSaveOpen(false)
      setNote('')
      toast(`已保存为新版本 v${r.version}，现有项目不受影响`, 'ok')
    } catch (err) { toast((err as Error).message, 'bad') } finally { setBusy(false) }
  }

  return (
    <div className="p-7 max-w-[1180px] mx-auto pb-16">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-[21px] font-bold tracking-tight flex items-center gap-2.5">
            <BookOpen size={20} className="text-primary" /> Playbook
            <Badge tone="primary">v{playbook.version}</Badge>
          </h1>
          <p className="text-[13px] text-ink-3 mt-0.5">你的产品方法论模板。保存修改会生成新版本，已有项目继续使用创建时的快照（PRD 第 20 节）。</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <Badge tone="warn">有未保存修改</Badge>}
          <Button variant="primary" onClick={() => setSaveOpen(true)} disabled={!dirty}><Save size={15} /> 保存为新版本</Button>
        </div>
      </div>

      <div className="grid md:grid-cols-[280px_1fr] gap-5">
        {/* 阶段列表 */}
        <div>
          <Card className="p-2.5">
            <div className="text-[11.5px] font-bold text-ink-3 tracking-widest px-2 py-1.5">生命周期阶段（{stages.length}）</div>
            <div className="space-y-1">
              {stages.map((s, i) => (
                <div key={s.id} className={`flex items-center gap-1 rounded-[9px] px-2 py-2 cursor-pointer text-[13.5px] transition-colors ${i === selected ? 'bg-primary-soft text-primary-deep font-semibold' : 'hover:bg-[#faf9f6]'}`}
                  onClick={() => setSelected(i)}>
                  <span className={`w-5 h-5 rounded-md text-[11px] font-bold flex items-center justify-center flex-shrink-0 ${i === selected ? 'bg-primary text-white' : 'bg-[#efede8] text-ink-2'}`}>{i + 1}</span>
                  <span className="flex-1 truncate">{s.name}</span>
                  <button className="opacity-0 group-hover:opacity-100 hover:opacity-100 p-0.5 text-ink-3 hover:text-ink" onClick={(e) => { e.stopPropagation(); moveStage(i, -1) }}><ArrowUp size={13} /></button>
                  <button className="p-0.5 text-ink-3 hover:text-ink" onClick={(e) => { e.stopPropagation(); moveStage(i, 1) }}><ArrowDown size={13} /></button>
                </div>
              ))}
            </div>
            <button onClick={addStage} className="w-full mt-2 flex items-center justify-center gap-1.5 h-8.5 rounded-[9px] border border-dashed border-line-2 text-[12.5px] text-ink-3 hover:border-primary hover:text-primary transition-colors">
              <Plus size={14} /> 新增阶段
            </button>
          </Card>

          {/* 版本历史 */}
          <Card className="p-4 mt-4">
            <div className="text-[11.5px] font-bold text-ink-3 tracking-widest mb-2.5 flex items-center gap-1.5"><History size={12} /> 版本历史</div>
            <div className="space-y-2">
              {[...playbook.history].reverse().map((h) => (
                <div key={h.version} className="text-[12.5px] flex gap-2">
                  <Badge tone={h.version === playbook.version ? 'primary' : 'gray'}>v{h.version}</Badge>
                  <div className="min-w-0">
                    <div className="truncate text-ink-2">{h.note}</div>
                    <div className="text-ink-3 text-[11px]">{fmtDate(h.savedAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* 阶段编辑器 */}
        {stage && (
          <div className="min-w-0">
            <Card className="p-5 mb-4">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2 text-[11.5px] font-bold text-ink-3 tracking-widest">
                  <GripVertical size={13} /> 阶段定义 · 编辑后保存为新版本
                </div>
                <Button size="sm" variant="ghost" className="text-bad hover:bg-bad-soft" onClick={() => removeStage(selected)}>
                  <Trash2 size={13.5} /> 删除阶段
                </Button>
              </div>
              <div className="grid md:grid-cols-[1fr_120px] gap-3 mb-3">
                <Field label="阶段名称"><input type="text" value={stage.name} onChange={(e) => editStage({ name: e.target.value })} /></Field>
                <Field label="短名" hint="用于阶段视图"><input type="text" value={stage.short} onChange={(e) => editStage({ short: e.target.value })} /></Field>
              </div>
              <Field label="阶段介绍"><textarea rows={2} value={stage.introduction} onChange={(e) => editStage({ introduction: e.target.value })} /></Field>
              <Field label="阶段目标"><textarea rows={2} value={stage.objective} onChange={(e) => editStage({ objective: e.target.value })} /></Field>
              <Field label="关键问题"><input type="text" value={stage.keyQuestion} onChange={(e) => editStage({ keyQuestion: e.target.value })} /></Field>
              <Field label="方法论" hint="每行一条，按优先级排序">
                <textarea rows={4} value={stage.methodology.join('\n')} onChange={(e) => editStage({ methodology: e.target.value.split('\n').filter((x) => x.trim() || stage.methodology.length <= 1) })} />
              </Field>
              <div className="grid md:grid-cols-[160px_1fr] gap-3">
                <Field label="最低证据数" hint="Stage Gate 要求">
                  <input type="number" min={0} max={9} value={stage.minEvidence}
                    onChange={(e) => editStage({ minEvidence: Math.max(0, parseInt(e.target.value) || 0) })} />
                </Field>
                <div />
              </div>
            </Card>

            {/* Todo 编辑 */}
            <ListEditor
              title="必做 Todo" icon={<Layers size={14} />} items={stage.todos.map((t) => t.text)}
              onChange={(texts) => editStage({ todos: texts.map((t, i) => ({ id: stage.todos[i]?.id || tmpId('t'), text: t })) })}
              desc="本阶段必须完成的 Todo 清单"
            />

            {/* Deliverables 编辑 */}
            <Card className="p-5 mb-4">
              <div className="text-[13.5px] font-bold mb-1">阶段成果 Deliverables</div>
              <div className="text-[12px] text-ink-3 mb-3">提交这些成果是 Stage Gate 的第二道门槛</div>
              <div className="space-y-2.5">
                {stage.deliverables.map((d, i) => (
                  <div key={d.id} className="bg-[#faf9f6] border border-line rounded-[10px] p-3">
                    <div className="flex gap-2 mb-2">
                      <input type="text" className="flex-1" value={d.name} placeholder="成果名称"
                        onChange={(e) => editStage({ deliverables: stage.deliverables.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                      <button className="text-ink-3 hover:text-bad p-1.5" onClick={() => editStage({ deliverables: stage.deliverables.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
                    </div>
                    <textarea rows={2} value={d.description} placeholder="成果要求说明"
                      onChange={(e) => editStage({ deliverables: stage.deliverables.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} />
                  </div>
                ))}
                <button className="w-full h-9 rounded-[9px] border border-dashed border-line-2 text-[12.5px] text-ink-3 hover:border-primary hover:text-primary flex items-center justify-center gap-1.5"
                  onClick={() => editStage({ deliverables: [...stage.deliverables, { id: tmpId('d'), name: '新成果', description: '', required: true }] })}>
                  <Plus size={14} /> 添加成果
                </button>
              </div>
            </Card>

            {/* Exit Criteria 编辑 */}
            <ListEditor
              title="退出条件 Exit Criteria" icon={<ShieldAlert size={14} />} items={stage.exitCriteria.map((c) => c.text)}
              onChange={(texts) => editStage({ exitCriteria: texts.map((t, i) => ({ id: stage.exitCriteria[i]?.id || tmpId('ec'), text: t })) })}
              desc="全部满足才能进入阶段决策"
            />

            {/* Steps 编辑 */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-1">
                <div className="text-[13.5px] font-bold">执行 Steps（{stage.steps.length}）</div>
                <Button size="sm" variant="soft" onClick={() => {
                  const s: PlaybookStepDef = { id: tmpId('s'), name: '新 Step', goal: '', description: '', checklist: [{ id: tmpId('c'), text: '第一个检查项' }], questions: [{ id: tmpId('q'), q: '需要回答的问题？' }] }
                  editStage({ steps: [...stage.steps, s] })
                  setExpandedStep(s.id)
                }}><Plus size={13} /> 添加 Step</Button>
              </div>
              <div className="text-[12px] text-ink-3 mb-3">每个 Step 的检查项与问题会渲染到执行页面</div>
              <div className="space-y-2">
                {stage.steps.map((step, si) => {
                  const open = expandedStep === step.id
                  return (
                    <div key={step.id} className="border border-line rounded-[10px] overflow-hidden">
                      <div className={`flex items-center gap-2.5 px-3.5 py-2.5 cursor-pointer text-[13.5px] ${open ? 'bg-primary-soft/50' : 'hover:bg-[#faf9f6]'}`}
                        onClick={() => setExpandedStep(open ? null : step.id)}>
                        {open ? <ChevronDown size={14} className="text-ink-3" /> : <ChevronRight size={14} className="text-ink-3" />}
                        <span className="font-semibold flex-1 truncate">{si + 1}. {step.name}</span>
                        <span className="text-[11.5px] text-ink-3">{step.checklist.length} 检查 · {step.questions.length} 问题</span>
                        <button className="text-ink-3 hover:text-bad p-1" onClick={(e) => { e.stopPropagation(); editStage({ steps: stage.steps.filter((_, j) => j !== si) }) }}><Trash2 size={13.5} /></button>
                      </div>
                      {open && (
                        <div className="px-4 py-3.5 border-t border-line bg-white">
                          <div className="grid md:grid-cols-2 gap-3 mb-2.5">
                            <Field label="Step 名称"><input type="text" value={step.name} onChange={(e) => editStage({ steps: stage.steps.map((x, j) => (j === si ? { ...x, name: e.target.value } : x)) })} /></Field>
                            <Field label="目标"><input type="text" value={step.goal} onChange={(e) => editStage({ steps: stage.steps.map((x, j) => (j === si ? { ...x, goal: e.target.value } : x)) })} /></Field>
                          </div>
                          <Field label="说明"><textarea rows={2} value={step.description} onChange={(e) => editStage({ steps: stage.steps.map((x, j) => (j === si ? { ...x, description: e.target.value } : x)) })} /></Field>
                          <div className="grid md:grid-cols-2 gap-3">
                            <Field label="Checklist" hint="每行一项">
                              <textarea rows={3} value={step.checklist.map((c) => c.text).join('\n')}
                                onChange={(e) => editStage({ steps: stage.steps.map((x, j) => (j === si ? { ...x, checklist: reconcileChecklistItems(step.checklist, e.target.value.split('\n').map((t) => t.trim()).filter(Boolean)) } : x)) })} />
                            </Field>
                            <Field label="问题列表" hint="每行一个问题">
                              <textarea rows={3} value={step.questions.map((q) => q.q).join('\n')}
                                onChange={(e) => editStage({ steps: stage.steps.map((x, j) => (j === si ? { ...x, questions: e.target.value.split('\n').filter((t) => t.trim()).map((t, k) => ({ id: step.questions[k]?.id || tmpId('q'), q: t })) } : x)) })} />
                            </Field>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* 保存确认 */}
      <Modal open={saveOpen} onClose={() => setSaveOpen(false)} title="保存为新版本" width={480}
        footer={<><Button onClick={() => setSaveOpen(false)}>取消</Button><Button variant="primary" loading={busy} onClick={save}>确认保存</Button></>}>
        <div className="bg-warn-soft/70 text-warn rounded-[10px] px-4 py-3 text-[12.5px] leading-relaxed mb-4 flex gap-2">
          <ShieldAlert size={15} className="flex-shrink-0 mt-0.5" />
          <span>保存后 Playbook 将升到 <b>v{playbook.version + 1}</b>。已有项目继续使用创建时的快照，<b>不会</b>受任何影响；只有之后新建的项目会使用新版本。</span>
        </div>
        <Field label="版本说明" hint="这次为什么调整方法论？">
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：增加付费验证检查项" />
        </Field>
      </Modal>
    </div>
  )
}

function ListEditor({ title, icon, items, onChange, desc }: {
  title: string; icon: React.ReactNode; items: string[]; onChange: (items: string[]) => void; desc?: string
}) {
  const [editing, setEditing] = useState(false)
  const lines = useMemo(() => items.join('\n'), [items])
  void lines
  return (
    <Card className="p-5 mb-4">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[13.5px] font-bold flex items-center gap-1.5">{icon} {title}</div>
        <button className="text-[12px] text-primary hover:underline" onClick={() => setEditing((v) => !v)}>{editing ? '完成' : '编辑'}</button>
      </div>
      {desc && <div className="text-[12px] text-ink-3 mb-3">{desc}</div>}
      {editing ? (
        <textarea rows={Math.max(4, items.length + 1)} value={items.join('\n')}
          onChange={(e) => onChange(e.target.value.split('\n').filter((t) => t.trim()))} />
      ) : (
        <ul className="space-y-1.5 text-[13px] text-ink-2">
          {items.map((t, i) => (
            <li key={i} className="flex gap-2"><span className="text-ink-3">{i + 1}.</span>{t}</li>
          ))}
          {items.length === 0 && <li className="text-ink-3 text-[12.5px]">暂无内容</li>}
        </ul>
      )}
    </Card>
  )
}
