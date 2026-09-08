import { beforeEach, expect, test, vi } from 'vitest'

vi.mock('../store', () => ({
  getDB: () => ({ settings: { ai: { baseUrl: 'https://example.test/v1', apiKey: 'key', model: 'reasoning-model' } } }),
  saveDB: vi.fn(), id: vi.fn(), nowISO: vi.fn()
}))

import { testConnection } from './ai'

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
