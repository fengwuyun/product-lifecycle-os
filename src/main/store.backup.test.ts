// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
const runtime = vi.hoisted(() => ({ userData: '' }))
vi.mock('electron', () => ({ app: { getPath: () => runtime.userData } }))
import { getDB, saveDB, replaceLoadedDB, flushDB } from './store'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  expect(path.dirname(runtime.userData)).toBe(path.resolve(os.tmpdir()))
  expect(path.basename(runtime.userData).startsWith('plos-store-backup-test-')).toBe(true)
  fs.rmSync(runtime.userData, { recursive: true, force: true })
})
test('replaceLoadedDB replaces the cache and cancels the old debounced save', () => {
  runtime.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'plos-store-backup-test-'))
  vi.useFakeTimers()
  const original = getDB()
  saveDB()
  const restored = structuredClone(original)
  restored.meta.createdAt = 'restored'
  const write = vi.spyOn(fs, 'writeFileSync')
  replaceLoadedDB(restored)
  vi.advanceTimersByTime(1000)
  expect(getDB()).toBe(restored)
  expect(write).not.toHaveBeenCalled()
  flushDB(true)
  expect(JSON.parse(fs.readFileSync(path.join(runtime.userData, 'data', 'data.json'), 'utf8')).meta.createdAt).toBe('restored')
})
