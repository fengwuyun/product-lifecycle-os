// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
  pick: vi.fn(), review: vi.fn(), importFile: vi.fn(),
  userData: ''
}))
vi.mock('electron', () => ({
  app: { getPath: () => mocks.userData, on: vi.fn() },
  ipcMain: { handle: (channel: string, handler: (...args: unknown[]) => Promise<unknown>) => mocks.handlers.set(channel, handler) },
  dialog: { showOpenDialog: mocks.pick }, shell: {}, BrowserWindow: class {}
}))
vi.mock('./ai', () => ({ reviewStage: mocks.review }))
vi.mock('./artifacts', () => ({ parseAndStoreFile: mocks.importFile }))
vi.mock('./report', () => ({ exportReport: vi.fn() }))
import { registerIPC } from '../ipc'

let root: string
function snapshot(): string {
  return createHash('sha256').update(fs.readFileSync(path.join(root, 'data', 'data.json'))).update(fs.readFileSync(path.join(root, 'data', 'artifacts', 'original.txt'))).digest('hex')
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.handlers.clear()
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'plos-backup-ipc-test-'))
  mocks.userData = root
  fs.mkdirSync(path.join(root, 'data', 'artifacts'), { recursive: true })
  fs.writeFileSync(path.join(root, 'data', 'data.json'), '{"unchanged":"original"}')
  fs.writeFileSync(path.join(root, 'data', 'artifacts', 'original.txt'), 'original artifact')
  registerIPC(() => null)
})
afterEach(() => {
  expect(path.dirname(root)).toBe(path.resolve(os.tmpdir()))
  expect(path.basename(root).startsWith('plos-backup-ipc-test-')).toBe(true)
  fs.rmSync(root, { recursive: true, force: true })
})

test.each(['ai:reviewStage', 'artifact:addFromFile'])('restore refuses an in-flight %s write without touching files or opening the picker', async (channel) => {
  let finish!: (value: object) => void
  const pending = new Promise<object>((resolve) => { finish = resolve })
  ;(channel.startsWith('ai:') ? mocks.review : mocks.importFile).mockReturnValueOnce(pending)
  const original = snapshot()
  const request = mocks.handlers.get(channel)!(null, { projectId: 'project', stageId: 'stage', path: 'unused' })
  const result = await mocks.handlers.get('backup:restore')!()
  expect(result).toEqual({ ok: true, data: { error: '资料导入或 AI 审查正在进行，请等待完成后再恢复备份' } })
  expect(mocks.pick).not.toHaveBeenCalled()
  expect(snapshot()).toBe(original)
  expect(fs.readdirSync(root)).toEqual(['data'])
  finish({})
  await request
  mocks.pick.mockResolvedValueOnce({ canceled: true, filePaths: [] })
  expect(await mocks.handlers.get('backup:restore')!()).toEqual({ ok: true, data: { canceled: true } })
})

test('restore rechecks in-flight writes after the native directory picker closes', async () => {
  let choose!: (value: object) => void
  let finish!: (value: object) => void
  mocks.pick.mockReturnValueOnce(new Promise((resolve) => { choose = resolve }))
  mocks.review.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
  const original = snapshot()
  const restore = mocks.handlers.get('backup:restore')!()
  const review = mocks.handlers.get('ai:reviewStage')!(null, { projectId: 'project', stageId: 'stage' })
  choose({ canceled: false, filePaths: [path.join(root, 'candidate')] })
  expect(await restore).toEqual({ ok: true, data: { error: '资料导入或 AI 审查正在进行，请等待完成后再恢复备份' } })
  expect(snapshot()).toBe(original)
  expect(fs.readdirSync(root)).toEqual(['data'])
  finish({})
  await review
})

test('dialog errors are safe result objects and do not leak arbitrary secret text', async () => {
  mocks.pick.mockRejectedValueOnce(new Error('sk-SECRET dialog details'))
  const original = snapshot()
  const result = await mocks.handlers.get('backup:restore')!()
  expect(result).toEqual({ ok: true, data: { error: '恢复失败，请检查备份与目录权限' } })
  expect(snapshot()).toBe(original)
  expect(JSON.stringify(result)).not.toContain('sk-SECRET')
})
