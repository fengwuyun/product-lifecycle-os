import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import type { Evidence, Project, ProjectStage } from '@shared/types'
import { getStageProgressSummary, StageProgressSummary } from './StageProgressSummary'
import { stageGate } from '../store/app'

const project = {
  id: 'project-1', name: '测试项目', description: '', priority: 'P1', status: 'active',
  playbookId: 'playbook-1', playbookVersion: 1, currentStageId: 'stage-1',
  workflowSnapshot: { playbookId: 'playbook-1', playbookVersion: 1, stages: [] },
  createdAt: '', updatedAt: '', lastActiveAt: ''
} as Project

function makeStage(overrides: Partial<ProjectStage> = {}): ProjectStage {
  return {
    id: 'stage-1', name: '机会定义', short: '', order: 1, introduction: '', objective: '', keyQuestion: '用户问题是什么？', methodology: [],
    todos: [{ id: 'todo-1', text: '完成访谈', done: false }],
    steps: [{ id: 'step-1', name: '定义问题', goal: '', description: '', checklist: [], questions: [], answers: {}, status: 'todo' }],
    deliverables: [{ id: 'deliverable-1', name: '访谈记录', description: '', required: true, artifactIds: [] }],
    exitCriteria: [{ id: 'criterion-1', text: '确认问题', met: false }],
    minEvidence: 1, status: 'active',
    ...overrides
  }
}

function evidence(): Evidence {
  return {
    id: 'evidence-1', projectId: project.id, stageId: 'stage-1', title: '访谈', type: '访谈', content: '记录',
    relatedClaimIds: [], strength: '中', createdAt: ''
  }
}

test('按 Steps、Todo、必需成果、Evidence、退出条件顺序给出第一项缺口', () => {
  const summary = getStageProgressSummary(project, makeStage(), [])

  expect(summary.metrics.map((metric) => metric.label)).toEqual([
    '执行步骤（Steps）', '阶段 Todo', '必需成果', '证据（Evidence）', '退出条件'
  ])
  expect(summary.nextGap).toBe('执行步骤未完成（0/1）')
  expect(summary.ready).toBe(false)
})

test('进度计数与 stageGate 一致，并保留 Todo 之后的缺口文案', () => {
  const stage = makeStage({
    steps: [{ id: 'step-1', name: '定义问题', goal: '', description: '', checklist: [], questions: [], answers: {}, status: 'done' }],
    todos: [{ id: 'todo-1', text: '完成访谈', done: true }, { id: 'todo-2', text: '完成分析', done: false }],
    deliverables: [{ id: 'deliverable-1', name: '访谈记录', description: '', required: true, content: '  已提交  ', artifactIds: [] }],
    exitCriteria: [{ id: 'criterion-1', text: '确认问题', met: true }, { id: 'criterion-2', text: '确认方案', met: false }],
    minEvidence: 2
  })
  const summary = getStageProgressSummary(project, stage, [evidence()])
  const gate = stageGate(project, stage, [evidence()])

  expect(summary.metrics.slice(1).map((metric) => [metric.done, metric.total])).toEqual([
    [gate.todosDone, gate.todosTotal],
    [gate.deliverablesDone, gate.deliverablesRequired],
    [gate.evidenceCount, gate.evidenceRequired],
    [gate.criteriaMet, gate.criteriaTotal]
  ])
  expect(summary.nextGap).toBe('Todo 未完成（1/2）')
})

test('零证据要求视为完成，全部完成时显示阶段决策条件已满足', () => {
  const stage = makeStage({
    steps: [], todos: [], deliverables: [], exitCriteria: [], minEvidence: 0
  })
  const summary = getStageProgressSummary(project, stage, [])
  render(<StageProgressSummary project={project} stage={stage} evidences={[]} />)

  expect(summary.metrics[3]).toMatchObject({ done: 0, total: 0, complete: true })
  expect(summary.nextGap).toBeNull()
  expect(summary.ready).toBe(true)
  expect(screen.getByText('已满足阶段决策条件')).toBeTruthy()
  expect(screen.getAllByRole('progressbar')).toHaveLength(5)
})

test('超额 Evidence 保持真实计数，同时将进度条 ARIA 数值限制在要求范围内', () => {
  const stage = makeStage({
    steps: [{ id: 'step-1', name: '定义问题', goal: '', description: '', checklist: [], questions: [], answers: {}, status: 'done' }],
    todos: [{ id: 'todo-1', text: '完成访谈', done: true }],
    deliverables: [{ id: 'deliverable-1', name: '访谈记录', description: '', required: true, content: '已提交', artifactIds: [] }],
    exitCriteria: [{ id: 'criterion-1', text: '确认问题', met: true }],
    minEvidence: 2
  })
  const evidences = [evidence(), { ...evidence(), id: 'evidence-2' }, { ...evidence(), id: 'evidence-3' }]
  render(<StageProgressSummary project={project} stage={stage} evidences={evidences} />)

  const progress = screen.getByRole('progressbar', { name: '证据（Evidence）：3/2' })
  expect(progress.getAttribute('aria-valuemax')).toBe('2')
  expect(progress.getAttribute('aria-valuenow')).toBe('2')
  expect(progress.getAttribute('aria-valuetext')).toBe('3/2')
})

test('零要求使用准确的无需完成 ARIA 文本，不伪装为 1/1', () => {
  const stage = makeStage({ steps: [], todos: [], deliverables: [], exitCriteria: [], minEvidence: 0 })
  render(<StageProgressSummary project={project} stage={stage} evidences={[]} />)

  const progress = screen.getByRole('progressbar', { name: '证据（Evidence）：0/0' })
  expect(progress.getAttribute('aria-valuemax')).toBe('1')
  expect(progress.getAttribute('aria-valuenow')).toBe('0')
  expect(progress.getAttribute('aria-valuetext')).toBe('无需完成（0/0）')
})
