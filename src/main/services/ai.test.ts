import { beforeEach, expect, test, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  db: {
    settings: { ai: { baseUrl: 'https://example.test/v1', apiKey: 'key', model: 'reasoning-model' } },
    projects: [] as unknown[], claims: [], evidences: [], artifacts: [], aiReviews: []
  }
}))

vi.mock('../store', () => ({
  getDB: () => mocked.db,
  saveDB: vi.fn(), id: vi.fn(), nowISO: vi.fn()
}))

import { reviewStage, testConnection } from './ai'

beforeEach(() => { vi.restoreAllMocks() })

test('HTTP 成功且 choices 有效时，空 content 仍判定为已连接', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '', reasoning_content: 'OK' } }] }) }))
  await expect(testConnection()).resolves.toEqual({ ok: true, message: '连接成功，服务已响应但未返回文本' })
})

test('响应缺少 choices 时连接测试失败', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [] }) }))
  const result = await testConnection()
  expect(result.ok).toBe(false)
  expect(result.message).toContain('缺少 choices')
})

test('迁移兼容问题的答案通过标准问题回答上下文提供给 AI', async () => {
  mocked.db.projects = [{
    id: 'project-1', name: '测试项目', description: '描述', priority: 'P1', status: 'active', playbookId: 'pb', playbookVersion: 1,
    currentStageId: 'stage-1', createdAt: '', updatedAt: '', lastActiveAt: '',
    workflowSnapshot: {
      playbookId: 'pb', playbookVersion: 1, stages: [{
        id: 'stage-1', name: '验证', short: '', order: 1, introduction: '', objective: '', keyQuestion: '', methodology: [], todos: [],
        steps: [{
          id: 'step-1', name: '用户访谈', goal: '', description: '', checklist: [{ id: 'check-1', text: '完成访谈', done: true }],
          questions: [{ id: 'legacy_question_check-1', q: '访谈结论' }], answers: { 'legacy_question_check-1': '用户愿意付费' }, status: 'active'
        }], deliverables: [], exitCriteria: [], minEvidence: 0, status: 'active'
      }]
    }
  }]
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '{"status":"Ready","verified":[],"unverified":[],"gaps":[],"logicIssues":[],"nextStep":"继续"}' } }] }) }))

  await expect(reviewStage({ projectId: 'project-1', stageId: 'stage-1' })).resolves.toMatchObject({ review: { status: 'Ready' } })

  const request = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)
  const context = request.messages[1].content
  expect(context).toContain('"问题": "访谈结论"')
  expect(context).toContain('"回答": "用户愿意付费"')
  expect(context).not.toContain('完成说明')
})
