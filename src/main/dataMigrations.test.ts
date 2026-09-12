import { expect, test } from 'vitest'
import type { AppData } from '../shared/types'
import { migrateData, DATA_VERSION } from './dataMigrations'

type LegacyItem = {
  id: string
  text: string
  done: boolean
  responseRequired?: boolean
  responsePrompt?: string
  response?: string
}

function legacyData(version: number, checklist: LegacyItem[], answers: Record<string, string> = {}, questions: { id: string; q: string }[] = []): AppData {
  const step = { id: 'step', name: '', goal: '', description: '', checklist, questions, answers, status: 'done' as const }
  const stage = { id: 'stage', name: '', short: '', order: 1, introduction: '', objective: '', keyQuestion: '', methodology: [], todos: [], steps: [step], deliverables: [], exitCriteria: [], minEvidence: 0, status: 'active' as const }
  return {
    meta: { version, createdAt: '' }, settings: { ai: { baseUrl: '', apiKey: '', model: '' } }, playbooks: [],
    projects: [{ id: 'project', name: '', description: '', priority: 'P1', status: 'active', playbookId: 'pb', playbookVersion: 1, workflowSnapshot: { playbookId: 'pb', playbookVersion: 1, stages: [stage] }, currentStageId: 'stage', createdAt: '', updatedAt: '', lastActiveAt: '' }],
    claims: [], evidences: [], artifacts: [], decisions: [], aiReviews: []
  } as unknown as AppData
}

function migratedStep(data: AppData) {
  return data.projects[0].workflowSnapshot.stages[0].steps[0]
}

function legacyPlaybookData(version: number): AppData {
  const data = legacyData(version, [])
  data.playbooks = [{
    id: 'pb', name: '', version: 1, description: '', history: [], createdAt: '', updatedAt: '', stages: [{
      id: 'stage', name: '', short: '', order: 1, introduction: '', objective: '', keyQuestion: '', methodology: [], todos: [],
      steps: [{ id: 'step', name: '', goal: '', description: '', checklist: [{ id: 'c121', text: '机会描述', responseRequired: true, responsePrompt: '旧引导' }], questions: [] }],
      deliverables: [], exitCriteria: [], minEvidence: 0
    }]
  }] as unknown as AppData['playbooks']
  return data
}

test.each([1, 2])('v%s data migrates directly to v3 compatibility questions', (version) => {
  const result = migrateData(legacyData(version, [{ id: 'c121', text: '完成一句话产品机会描述', done: true, responseRequired: true, responsePrompt: '一句话机会', response: '已有内容' }]))
  const step = migratedStep(result.data)

  expect(result.changed).toBe(true)
  expect(result.data.meta.version).toBe(DATA_VERSION)
  expect(step.questions).toEqual([{ id: 'legacy_question_c121', q: '一句话机会' }])
  expect(step.answers).toEqual({ legacy_question_c121: '已有内容' })
  expect(step.checklist).toEqual([{ id: 'c121', text: '完成一句话产品机会描述', done: true }])
})

test.each([1, 2])('v%s migration removes legacy checklist fields from persisted playbooks', (version) => {
  const result = migrateData(legacyPlaybookData(version))
  const checklist = result.data.playbooks[0].stages[0].steps[0].checklist

  expect(result.changed).toBe(true)
  expect(checklist).toEqual([{ id: 'c121', text: '机会描述' }])
})

test('migrates every non-empty legacy response with stable compatibility IDs', () => {
  const result = migrateData(legacyData(2, [
    { id: 'c121', text: '机会描述', done: true, response: '机会回答' },
    { id: 'c131', text: '核心问题', done: false, responsePrompt: '问题引导', response: '问题回答' },
    { id: 'c132', text: '空回答', done: true, response: '   ' }
  ]))
  const step = migratedStep(result.data)

  expect(step.questions).toEqual([
    { id: 'legacy_question_c121', q: '机会描述' },
    { id: 'legacy_question_c131', q: '问题引导' }
  ])
  expect(step.answers).toEqual({ legacy_question_c121: '机会回答', legacy_question_c131: '问题回答' })
  expect(step.checklist).toEqual([
    { id: 'c121', text: '机会描述', done: true },
    { id: 'c131', text: '核心问题', done: false },
    { id: 'c132', text: '空回答', done: true }
  ])
})

test('preserves an existing compatibility answer instead of overwriting it', () => {
  const result = migrateData(legacyData(2, [{ id: 'c121', text: '机会描述', done: true, response: '旧回答' }], {
    legacy_question_c121: '新回答'
  }))
  const step = migratedStep(result.data)

  expect(step.answers).toEqual({ legacy_question_c121: '新回答' })
  expect(step.questions).toEqual([])
})

test('removes all legacy checklist fields and is idempotent', () => {
  const first = migrateData(legacyData(1, [{ id: 'c121', text: '机会描述', done: true, responseRequired: false, responsePrompt: '引导', response: '' }]))
  const beforeSecondMigration = structuredClone(first.data)
  const second = migrateData(first.data)

  expect(first.data.projects[0].workflowSnapshot.stages[0].steps[0].checklist[0]).toEqual({ id: 'c121', text: '机会描述', done: true })
  expect(second.changed).toBe(false)
  expect(second.data).toEqual(beforeSecondMigration)
})
