import type {
  AppData, Project, ProjectStage, ProjectStep, ProjectTodo, StageGate, StageStatus,
  DecisionType, Priority, ProjectStatus, Claim, Evidence
} from '../../shared/types'
import { getDB, saveDB, id, nowISO, flushDB } from '../store'
import { DEMO_PROJECT } from '../defaultPlaybook'

// ─── 查询工具 ───

export function findProject(projectId: string): Project {
  const p = getDB().projects.find((x) => x.id === projectId)
  if (!p) throw new Error('项目不存在: ' + projectId)
  return p
}

export function findStage(project: Project, stageId: string): ProjectStage {
  const s = project.workflowSnapshot.stages.find((x) => x.id === stageId)
  if (!s) throw new Error('阶段不存在: ' + stageId)
  return s
}

export function projectProgress(project: Project): { done: number; total: number } {
  let done = 0
  let total = 0
  for (const st of project.workflowSnapshot.stages) {
    for (const sp of st.steps) {
      total++
      if (sp.status === 'done') done++
    }
  }
  return { done, total }
}

export function computeGate(project: Project, stage: ProjectStage): StageGate {
  const db = getDB()
  const evidences = db.evidences.filter((e) => e.projectId === project.id && e.stageId === stage.id)
  const todosDone = stage.todos.filter((t) => t.done).length
  const deliverablesRequired = stage.deliverables.filter((d) => d.required).length
  const deliverablesDone = stage.deliverables.filter((d) => d.required && d.content != null && d.content.trim() !== '').length
  const criteriaMet = stage.exitCriteria.filter((c) => c.met).length
  const missing: string[] = []
  if (todosDone < stage.todos.length) missing.push(`Todo 未完成（${todosDone}/${stage.todos.length}）`)
  if (deliverablesDone < deliverablesRequired) missing.push(`必要成果未提交（${deliverablesDone}/${deliverablesRequired}）`)
  if (evidences.length < stage.minEvidence) missing.push(`证据不足（${evidences.length}/${stage.minEvidence}）`)
  if (criteriaMet < stage.exitCriteria.length) missing.push(`退出条件未满足（${criteriaMet}/${stage.exitCriteria.length}）`)
  return {
    todosDone,
    todosTotal: stage.todos.length,
    deliverablesDone,
    deliverablesRequired,
    evidenceCount: evidences.length,
    evidenceRequired: stage.minEvidence,
    criteriaMet,
    criteriaTotal: stage.exitCriteria.length,
    ready: missing.length === 0,
    missing
  }
}

export function firstIncompleteStepId(stage: ProjectStage): string | undefined {
  const step = stage.steps.find((s) => s.status !== 'done')
  return step?.id
}

function touch(project: Project): void {
  project.updatedAt = nowISO()
  project.lastActiveAt = nowISO()
}

// ─── 项目 CRUD ───

export function createProject(input: { name: string; description: string; priority: Priority }): { projectId: string } {
  const db = getDB()
  const playbook = db.playbooks[0]
  if (!playbook) throw new Error('没有可用的 Playbook')
  const now = nowISO()
  const stages: ProjectStage[] = playbook.stages.map((def, idx) => ({
    id: def.id,
    name: def.name,
    short: def.short,
    order: def.order,
    introduction: def.introduction,
    objective: def.objective,
    keyQuestion: def.keyQuestion,
    methodology: [...def.methodology],
    todos: def.todos.map((t) => ({ ...t, done: false })),
    steps: def.steps.map((s) => ({
      id: s.id,
      name: s.name,
      goal: s.goal,
      description: s.description,
      checklist: s.checklist.map((c) => ({ ...c, done: false })),
      questions: s.questions.map((q) => ({ ...q })),
      answers: {},
      status: 'todo' as const
    })),
    deliverables: def.deliverables.map((d) => ({ ...d, artifactIds: [] })),
    exitCriteria: def.exitCriteria.map((c) => ({ ...c, met: false })),
    minEvidence: def.minEvidence,
    status: 'locked' as StageStatus,
    decisionHint: def.decisionHint
  }))
  stages[0].status = 'active'
  const project: Project = {
    id: id('prj'),
    name: input.name.trim() || '未命名项目',
    description: input.description || '',
    priority: input.priority || 'P2',
    status: 'active',
    playbookId: playbook.id,
    playbookVersion: playbook.version,
    workflowSnapshot: { playbookId: playbook.id, playbookVersion: playbook.version, stages },
    currentStageId: stages[0].id,
    currentStepId: firstIncompleteStepId(stages[0]),
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now
  }
  db.projects.unshift(project)
  db.decisions.unshift({
    id: id('dec'),
    projectId: project.id,
    type: 'advance',
    after: '创建项目',
    reason: `基于 ${playbook.name} v${playbook.version} 创建项目`,
    createdAt: now
  })
  saveDB()
  return { projectId: project.id }
}

export function updateProject(p: { id: string; patch: Partial<Pick<Project, 'name' | 'description' | 'priority'>> }): void {
  const project = findProject(p.id)
  if (p.patch.name !== undefined) project.name = p.patch.name
  if (p.patch.description !== undefined) project.description = p.patch.description
  if (p.patch.priority !== undefined) project.priority = p.patch.priority
  touch(project)
  saveDB()
}

export function setProjectStatus(p: { id: string; status: ProjectStatus; reason?: string }): void {
  const project = findProject(p.id)
  const before = project.status
  project.status = p.status
  touch(project)
  const typeMap: Partial<Record<ProjectStatus, DecisionType>> = {
    paused: 'pause',
    abandoned: 'abandon',
    active: 'resume',
    completed: 'complete'
  }
  const t = typeMap[p.status]
  if (t) {
    getDB().decisions.unshift({
      id: id('dec'),
      projectId: project.id,
      type: t,
      before,
      after: p.status,
      reason: p.reason || '',
      createdAt: nowISO()
    })
  }
  saveDB()
}

export function deleteProject(p: { id: string }): void {
  const db = getDB()
  db.projects = db.projects.filter((x) => x.id !== p.id)
  db.claims = db.claims.filter((x) => x.projectId !== p.id)
  db.evidences = db.evidences.filter((x) => x.projectId !== p.id)
  db.artifacts = db.artifacts.filter((x) => x.projectId !== p.id)
  db.decisions = db.decisions.filter((x) => x.projectId !== p.id)
  db.aiReviews = db.aiReviews.filter((x) => x.projectId !== p.id)
  saveDB()
}

// ─── 阶段 / Step 状态 ───

export function stageUpdate(p: { projectId: string; stageId: string; patch: { todos?: ProjectTodo[]; exitCriteria?: { id: string; text: string; met: boolean }[] } }): void {
  const project = findProject(p.projectId)
  const stage = findStage(project, p.stageId)
  if (p.patch.todos) stage.todos = p.patch.todos
  if (p.patch.exitCriteria) stage.exitCriteria = p.patch.exitCriteria
  touch(project)
  saveDB()
}

export function stepSave(p: { projectId: string; stageId: string; stepId: string; patch: { checklist?: { id: string; text: string; done: boolean }[]; answers?: Record<string, string> } }): void {
  const project = findProject(p.projectId)
  const stage = findStage(project, p.stageId)
  const step = stage.steps.find((s) => s.id === p.stepId)
  if (!step) throw new Error('Step 不存在')
  if (p.patch.checklist) step.checklist = p.patch.checklist
  if (p.patch.answers) step.answers = p.patch.answers
  touch(project)
  saveDB()
}

export function stepComplete(p: { projectId: string; stageId: string; stepId: string; completed: boolean }): void {
  const project = findProject(p.projectId)
  const stage = findStage(project, p.stageId)
  const step = stage.steps.find((s) => s.id === p.stepId)
  if (!step) throw new Error('Step 不存在')
  step.status = p.completed ? 'done' : 'todo'
  step.completedAt = p.completed ? nowISO() : undefined
  if (p.completed && stage.status === 'active') {
    const nextStep = stage.steps.find((s) => s.status !== 'done')
    project.currentStepId = nextStep?.id
  }
  touch(project)
  saveDB()
}

// ─── Deliverable ───

export function deliverableSubmit(p: { projectId: string; stageId: string; deliverableId: string; title: string; content: string; artifactIds: string[] }): void {
  const project = findProject(p.projectId)
  const stage = findStage(project, p.stageId)
  const d = stage.deliverables.find((x) => x.id === p.deliverableId)
  if (!d) throw new Error('成果不存在')
  d.title = p.title || d.name
  d.content = p.content
  d.artifactIds = p.artifactIds
  d.submittedAt = nowISO()
  touch(project)
  saveDB()
}

export function deliverableDelete(p: { projectId: string; stageId: string; deliverableId: string }): void {
  const project = findProject(p.projectId)
  const stage = findStage(project, p.stageId)
  const d = stage.deliverables.find((x) => x.id === p.deliverableId)
  if (!d) throw new Error('成果不存在')
  d.title = undefined
  d.content = undefined
  d.artifactIds = []
  d.submittedAt = undefined
  touch(project)
  saveDB()
}

// ─── Claim / Evidence ───

export function claimAdd(p: { projectId: string; stageId: string; statement: string; note?: string }): Claim {
  const project = findProject(p.projectId)
  findStage(project, p.stageId)
  const db = getDB()
  const claim: Claim = {
    id: id('clm'),
    projectId: p.projectId,
    stageId: p.stageId,
    statement: p.statement,
    note: p.note,
    createdAt: nowISO()
  }
  db.claims.push(claim)
  touch(project)
  saveDB()
  return claim
}

export function claimDelete(p: { id: string }): void {
  const db = getDB()
  db.claims = db.claims.filter((x) => x.id !== p.id)
  for (const e of db.evidences) {
    e.relatedClaimIds = e.relatedClaimIds.filter((c) => c !== p.id)
  }
  saveDB()
}

export function evidenceAdd(p: Omit<Evidence, 'id' | 'createdAt'> ): Evidence {
  const db = getDB()
  const evidence: Evidence = { ...p, id: id('evd'), createdAt: nowISO() }
  db.evidences.push(evidence)
  const project = db.projects.find((x) => x.id === p.projectId)
  if (project) touch(project)
  saveDB()
  return evidence
}

export function evidenceDelete(p: { id: string }): void {
  const db = getDB()
  db.evidences = db.evidences.filter((x) => x.id !== p.id)
  saveDB()
}

// ─── 决策 ───

export function applyDecision(p: { projectId: string; stageId: string; type: DecisionType; reason: string }): void {
  const db = getDB()
  const project = findProject(p.projectId)
  const stage = findStage(project, p.stageId)
  const now = nowISO()
  const before = stage.status

  stage.decision = { type: p.type, reason: p.reason, at: now }

  if (p.type === 'advance') {
    stage.status = 'passed'
    const idx = project.workflowSnapshot.stages.findIndex((s) => s.id === stage.id)
    const next = project.workflowSnapshot.stages[idx + 1]
    if (next) {
      next.status = 'active'
      project.currentStageId = next.id
      project.currentStepId = firstIncompleteStepId(next)
      db.decisions.unshift({
        id: id('dec'), projectId: project.id, stageId: stage.id, stageName: stage.name,
        type: 'advance', before, after: `进入「${next.name}」`, reason: p.reason, createdAt: now
      })
    } else {
      project.status = 'completed'
      project.currentStageId = stage.id
      db.decisions.unshift({
        id: id('dec'), projectId: project.id, stageId: stage.id, stageName: stage.name,
        type: 'complete', before, after: '项目完成', reason: p.reason, createdAt: now
      })
    }
  } else if (p.type === 'pause') {
    project.status = 'paused'
    db.decisions.unshift({
      id: id('dec'), projectId: project.id, stageId: stage.id, stageName: stage.name,
      type: 'pause', before, after: 'paused', reason: p.reason, createdAt: now
    })
  } else if (p.type === 'abandon') {
    project.status = 'abandoned'
    stage.status = 'abandoned'
    db.decisions.unshift({
      id: id('dec'), projectId: project.id, stageId: stage.id, stageName: stage.name,
      type: 'abandon', before, after: 'abandoned', reason: p.reason, createdAt: now
    })
  } else if (p.type === 'rollback' || p.type === 'pivot') {
    // 保持当前阶段 active，仅记录决策
    db.decisions.unshift({
      id: id('dec'), projectId: project.id, stageId: stage.id, stageName: stage.name,
      type: p.type, before, after: stage.name, reason: p.reason, createdAt: now
    })
  }
  touch(project)
  saveDB()
}

// ─── 示例项目 ───

export function createDemoProject(): { projectId: string } {
  const { projectId } = createProject({
    name: DEMO_PROJECT.name,
    description: DEMO_PROJECT.description,
    priority: DEMO_PROJECT.priority
  })
  const db = getDB()
  const project = findProject(projectId)
  const st1 = project.workflowSnapshot.stages[0]
  const st2 = project.workflowSnapshot.stages[1]

  // Stage 1: 完成
  for (const t of st1.todos) t.done = true
  for (const c of st1.exitCriteria) c.met = true
  for (const s of st1.steps) {
    s.status = 'done'
    s.completedAt = nowISO()
    for (const c of s.checklist) c.done = true
  }
  const q = (sid: string, qid: string) => st1.steps.find((s) => s.id === sid)?.questions.find((x) => x.id === qid)?.q || ''
  const setA = (sid: string, qid: string, v: string) => {
    const s = st1.steps.find((x) => x.id === sid)
    if (s) s.answers[qid] = v
  }
  setA('op_s1', 'q111', '我自己周末做兼职时，工资都是口头结算，我用手机备忘录记工时，月底经常和雇主对不上账。也看到几个小时工群里反复出现"怎么记工时才不会被骗"的求助。')
  setA('op_s2', 'q121', '按天结算的小时工（餐饮/仓储/展会），不善理财，主要用智能手机。')
  setA('op_s2', 'q122', '周六做完整理货架，晚上想确认今天该拿多少钱，发现备忘录里漏记了两天，和雇主各执一词。')
  setA('op_s3', 'q131', '现在用手机备忘录或微信聊天记录记工时，工资靠口头约定。')
  setA('op_s3', 'q132', '备忘录容易漏记，微信记录分散，月底对账靠记忆，有争议时没有凭据。')
  setA('op_s4', 'q141', '灵活用工规模持续增长，短工时岗位越来越多，但结算工具还停留在 Excel 和口头约定。')
  deliverableSubmit({
    projectId, stageId: st1.id, deliverableId: 'op_d1',
    title: '小时工记账 Opportunity Brief',
    content: [
      '【产品名称】小时工记账',
      '【一句话描述】为按天结算的小时工提供最轻量的工时记录与工资核对工具，让每一班都有据可查。',
      '【目标用户】按天/按周结算的小时工（餐饮、仓储、展会、家政），一人多职，收入依赖手工记录。',
      '【核心场景】下班后 5 分钟内记录当天工时与约定时薪，月底一键汇总与雇主核对。',
      '【核心问题】工时记录零散易漏，工资靠口头约定，结算争议无凭据。',
      '【当前解决方式】手机备忘录、微信聊天记录、纸质笔记本，甚至不记。',
      '【产品假设】小时工愿意用 30 秒/天的方式记录工时，以换取月底清晰、可对账的工资单。',
      '【机会来源】自己长期遇到的问题 + 小时工社群反复出现的求助（介于第一与第二优先级）。'
    ].join('\n'),
    artifactIds: []
  })
  const claim1 = claimAdd({ projectId, stageId: st1.id, statement: '小时工有记录每天工时的习惯或意愿（现状是靠备忘录，经常漏）', note: '来自自身经历与社群观察' })
  const ev1 = evidenceAdd({
    projectId, stageId: st1.id,
    title: '小时工群里一个月内出现 7 次"工时对不上"求助',
    type: '社区讨论', content: '在"XX兼职交流群"观察：9月内 7 条消息询问如何记录工时/工资被少算怎么办，其中 3 条有 10+ 回复共鸣。', strength: '中', relatedClaimIds: [claim1.id], notes: '截图已存档'
  })
  void ev1
  applyDecision({ projectId, stageId: st1.id, type: 'advance', reason: '机会来源真实（亲历+社群观察），一页简述已完备，进入用户验证。' })

  // Stage 2: 进行中
  st2.todos = st2.todos.map((t, i) => ({ ...t, done: i < 3 }))
  const s1 = st2.steps[0]
  for (const c of s1.checklist) c.done = true
  s1.answers['q211'] = '访谈了 4 位小时工：2 位餐饮、1 位仓储、1 位展会。全部用备忘录/微信记录，3 位表示曾被少算工资但没凭据只能认了。'
  s1.answers['q212'] = '"多一天是一天，谁为了几十块钱去吵啊。"——仓储阿姨，但她说如果有个东西自动对账她天天用。'
  s1.status = 'done'
  s1.completedAt = nowISO()
  const claim2 = claimAdd({ projectId, stageId: st2.id, statement: '按天结算的小时工愿意每天花 30 秒记录工时，以换取月底可对账的工资单' })
  evidenceAdd({
    projectId, stageId: st2.id,
    title: '4 位受访者中 3 位有被少算工资的经历',
    type: '用户访谈', content: '访谈记录：4/4 使用备忘录或微信记录工时，3/4 表示曾被少算，均因无凭据放弃追讨。', strength: '强', relatedClaimIds: [claim2.id]
  })
  evidenceAdd({
    projectId, stageId: st2.id,
    title: '仓储阿姨主动询问"有没有自动对账的工具"',
    type: '用户行为', content: '访谈结束时主动追问是否存在能自动汇总工资的工具，并留下了联系方式要求上线后通知她。', strength: '中', relatedClaimIds: [claim2.id]
  })
  project.currentStageId = st2.id
  project.currentStepId = st2.steps.find((s) => s.status !== 'done')?.id
  touch(project)
  flushDB()
  return { projectId }
}

export function getAllData(): AppData {
  return getDB()
}
