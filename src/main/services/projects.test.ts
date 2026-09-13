import { beforeEach, expect, test, vi } from 'vitest'
import type { AppData } from '../../shared/types'

const mocked = vi.hoisted(() => ({ deleteManagedArtifactFiles: vi.fn() }))

vi.mock('../store', () => ({
  getDB: vi.fn(),
  saveDB: vi.fn(),
  id: vi.fn((prefix: string) => `${prefix}_id`),
  nowISO: vi.fn(() => '2026-09-12T00:00:00.000Z'),
  flushDB: vi.fn()
}))
vi.mock('./artifacts', () => ({ deleteManagedArtifactFiles: mocked.deleteManagedArtifactFiles }))

import { getDB } from '../store'
import { createProject, deleteProject } from './projects'

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
  mocked.deleteManagedArtifactFiles.mockReset()
})

test('createProject copies only pure checklist fields from a persisted playbook', () => {
  const db = vi.mocked(getDB)()
  createProject({ name: '项目', description: '', priority: 'P1' })

  expect(db.projects[0].workflowSnapshot.stages[0].steps[0].checklist).toEqual([
    { id: 'c121', text: '机会描述', done: false }
  ])
})

test('deleteProject removes its copied artifact files before dropping metadata', () => {
  const db = vi.mocked(getDB)()
  db.projects = [{ id: 'project', name: '', description: '', priority: 'P1', status: 'active' }] as AppData['projects']
  db.artifacts = [{ id: 'artifact', projectId: 'project', stageId: 'stage', title: '', sourceType: 'file', filePath: 'managed-file', hasContent: false, extractedContent: '', createdAt: '' }]

  deleteProject({ id: 'project' })

  expect(mocked.deleteManagedArtifactFiles).toHaveBeenCalledWith([expect.objectContaining({ id: 'artifact' })])
  expect(db.artifacts).toEqual([])
})
