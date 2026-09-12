import { beforeEach, expect, test, vi } from 'vitest'
import type { AppData } from '../../shared/types'

vi.mock('../store', () => ({
  getDB: vi.fn(),
  saveDB: vi.fn(),
  id: vi.fn((prefix: string) => `${prefix}_id`),
  nowISO: vi.fn(() => '2026-09-12T00:00:00.000Z'),
  flushDB: vi.fn()
}))

import { getDB } from '../store'
import { createProject } from './projects'

function legacyPlaybookDatabase(): AppData {
  return {
    meta: { version: 2, createdAt: '' }, settings: { ai: { baseUrl: '', apiKey: '', model: '' } },
    playbooks: [{
      id: 'pb', name: '测试 Playbook', version: 1, description: '', history: [], createdAt: '', updatedAt: '', stages: [{
        id: 'stage', name: '', short: '', order: 1, introduction: '', objective: '', keyQuestion: '', methodology: [], todos: [],
        steps: [{ id: 'step', name: '', goal: '', description: '', checklist: [{ id: 'c121', text: '机会描述', responseRequired: true, responsePrompt: '旧引导' }], questions: [] }],
        deliverables: [], exitCriteria: [], minEvidence: 0
      }]
    }] as unknown as AppData['playbooks'],
    projects: [], claims: [], evidences: [], artifacts: [], decisions: [], aiReviews: []
  }
}

beforeEach(() => {
  vi.mocked(getDB).mockReturnValue(legacyPlaybookDatabase())
})

test('createProject copies only pure checklist fields from a persisted playbook', () => {
  const db = vi.mocked(getDB)()
  createProject({ name: '项目', description: '', priority: 'P1' })

  expect(db.projects[0].workflowSnapshot.stages[0].steps[0].checklist).toEqual([
    { id: 'c121', text: '机会描述', done: false }
  ])
})
