import { expect, test } from 'vitest'
import type { AppData } from '../shared/types'
import { migrateData, DATA_VERSION } from './dataMigrations'

test('旧数据迁移会补充必答检查项，同时保留完成状态和已有回答', () => {
  const checklist = [{ id: 'c121', text: '完成一句话产品机会描述', done: true, response: '已有内容' }]
  const stage = { id: 'stage', name: '', short: '', order: 1, introduction: '', objective: '', keyQuestion: '', methodology: [], todos: [], steps: [{ id: 'step', name: '', goal: '', description: '', checklist, questions: [], answers: {}, status: 'done' as const }], deliverables: [], exitCriteria: [], minEvidence: 0, status: 'active' as const }
  const data = {
    meta: { version: 1, createdAt: '' }, settings: { ai: { baseUrl: '', apiKey: '', model: '' } },
    playbooks: [{ id: 'pb', name: '', version: 1, description: '', stages: [{ ...stage, steps: [{ ...stage.steps[0], checklist: [{ id: 'c121', text: '完成一句话产品机会描述' }] }] }], history: [], createdAt: '', updatedAt: '' }],
    projects: [{ id: 'project', name: '', description: '', priority: 'P1', status: 'active', playbookId: 'pb', playbookVersion: 1, workflowSnapshot: { playbookId: 'pb', playbookVersion: 1, stages: [stage] }, currentStageId: 'stage', createdAt: '', updatedAt: '', lastActiveAt: '' }],
    claims: [], evidences: [], artifacts: [], decisions: [], aiReviews: []
  } as AppData

  const result = migrateData(data)
  const migrated = result.data.projects[0].workflowSnapshot.stages[0].steps[0].checklist[0]
  expect(result.changed).toBe(true)
  expect(result.data.meta.version).toBe(DATA_VERSION)
  expect(migrated).toMatchObject({ done: true, response: '已有内容', responseRequired: true })
  expect(migrated.responsePrompt).toContain('一句话')
})

test('自定义检查项默认不强制填写说明', () => {
  const custom = { id: 'custom-check', text: '自定义动作', done: false }
  const stage = { id: 'stage', name: '', short: '', order: 1, introduction: '', objective: '', keyQuestion: '', methodology: [], todos: [], steps: [{ id: 'step', name: '', goal: '', description: '', checklist: [custom], questions: [], answers: {}, status: 'todo' as const }], deliverables: [], exitCriteria: [], minEvidence: 0, status: 'active' as const }
  const data = { meta: { version: 1, createdAt: '' }, settings: { ai: { baseUrl: '', apiKey: '', model: '' } }, playbooks: [], projects: [{ id: 'project', name: '', description: '', priority: 'P1', status: 'active', playbookId: 'pb', playbookVersion: 1, workflowSnapshot: { playbookId: 'pb', playbookVersion: 1, stages: [stage] }, currentStageId: 'stage', createdAt: '', updatedAt: '', lastActiveAt: '' }], claims: [], evidences: [], artifacts: [], decisions: [], aiReviews: [] } as AppData
  expect(migrateData(data).data.projects[0].workflowSnapshot.stages[0].steps[0].checklist[0].responseRequired).toBe(false)
})
