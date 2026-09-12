// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { AppData } from '../../shared/types'
import { buildDefaultPlaybook } from '../defaultPlaybook'
import { DATA_VERSION } from '../dataMigrations'
import { createFullBackup, restoreFullBackup } from './backup'

let root: string
let live: string
let candidate: string

function dataFor(directory: string, marker: string): AppData {
  return {
    meta: { version: DATA_VERSION, createdAt: marker },
    settings: { ai: { baseUrl: '', apiKey: 'sk-private-' + marker, model: '' } },
    playbooks: [buildDefaultPlaybook()], projects: [], claims: [], evidences: [], decisions: [], aiReviews: [],
    artifacts: [{ id: 'asset', projectId: 'project', stageId: 'stage', title: marker, sourceType: 'file', filePath: path.join(directory, 'artifacts', 'asset.bin'), hasContent: false, extractedContent: '', createdAt: marker }]
  }
}
function writeFixture(directory: string, marker: string): void {
  fs.mkdirSync(path.join(directory, 'artifacts', 'nested'), { recursive: true })
  fs.writeFileSync(path.join(directory, 'data.json'), JSON.stringify(dataFor(directory, marker), null, 2))
  fs.writeFileSync(path.join(directory, 'artifacts', 'asset.bin'), Buffer.from([0, 255, marker.length, 42]))
  fs.writeFileSync(path.join(directory, 'artifacts', 'nested', 'note.txt'), marker)
}
function readData(directory: string): AppData {
  return JSON.parse(fs.readFileSync(path.join(directory, 'data.json'), 'utf8')) as AppData
}
function hashes(directory: string): string[] {
  return ['data.json', 'artifacts/asset.bin', 'artifacts/nested/note.txt'].map((file) => createHash('sha256').update(fs.readFileSync(path.join(directory, file))).digest('hex'))
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'plos-backup-test-'))
  live = path.join(root, 'data')
  candidate = path.join(root, 'candidate')
  writeFixture(live, 'original')
  writeFixture(candidate, 'replacement-data')
})
afterEach(() => {
  vi.restoreAllMocks()
  // The sole recursive cleanup target is the unique directory created by this test.
  expect(path.dirname(root)).toBe(path.resolve(os.tmpdir()))
  expect(path.basename(root).startsWith('plos-backup-test-')).toBe(true)
  fs.rmSync(root, { recursive: true, force: true })
})

test('creates distinct timestamped full copies including binary and nested artifacts', () => {
  const original = hashes(live)
  const first = createFullBackup(live, root)
  const second = createFullBackup(live, root)
  expect(first).not.toBe(second)
  expect(path.basename(first)).toMatch(/^product-lifecycle-backup-\d{4}-\d{2}-\d{2}T/)
  expect(hashes(first)).toEqual(original)
  expect(hashes(second)).toEqual(original)
  expect(hashes(live)).toEqual(original)
})

test('invalid JSON does not flush, replace, create a safety backup, or expose its API key', () => {
  const original = hashes(live)
  fs.writeFileSync(path.join(candidate, 'data.json'), '{"apiKey":"sk-secret-parser-text",INVALID}')
  const flushCurrent = vi.fn()
  const replaceLoaded = vi.fn()
  const result = restoreFullBackup(live, candidate, { flushCurrent, replaceLoaded })
  expect(result.error).toBeTruthy()
  expect(JSON.stringify(result)).not.toContain('sk-secret')
  expect(result.safetyBackupPath).toBeUndefined()
  expect(flushCurrent).not.toHaveBeenCalled()
  expect(replaceLoaded).not.toHaveBeenCalled()
  expect(hashes(live)).toEqual(original)
  expect(fs.existsSync(path.join(root, 'backups'))).toBe(false)
})

test.each(['projects', 'playbooks', 'claims', 'evidences', 'artifacts', 'decisions', 'aiReviews'])('rejects missing required %s array before touching live files', (key) => {
  const original = hashes(live)
  const invalid = readData(candidate) as unknown as Record<string, unknown>
  delete invalid[key]
  fs.writeFileSync(path.join(candidate, 'data.json'), JSON.stringify(invalid))
  expect(restoreFullBackup(live, candidate).error).toBeTruthy()
  expect(hashes(live)).toEqual(original)
})

test.each(['meta', 'futureVersion', 'nestedArray', 'missingArtifact', 'missingArtifactsDirectory'])('rejects malformed/incomplete candidate: %s', (kind) => {
  const original = hashes(live)
  const invalid = readData(candidate)
  if (kind === 'meta') delete (invalid as Partial<AppData>).meta
  if (kind === 'futureVersion') invalid.meta.version = DATA_VERSION + 1
  if (kind === 'nestedArray') (invalid.playbooks[0].stages[0] as unknown as Record<string, unknown>).steps = null
  if (kind === 'missingArtifact') fs.unlinkSync(path.join(candidate, 'artifacts', 'asset.bin'))
  if (kind === 'missingArtifactsDirectory') fs.renameSync(path.join(candidate, 'artifacts'), path.join(candidate, 'missing-artifacts'))
  fs.writeFileSync(path.join(candidate, 'data.json'), JSON.stringify(invalid))
  expect(restoreFullBackup(live, candidate).error).toBeTruthy()
  expect(hashes(live)).toEqual(original)
})

test('restores migrated data, rebases old-machine file paths and preserves safety backup and ancillary files', () => {
  const original = hashes(live)
  const value = readData(candidate)
  value.meta.version = 1
  value.artifacts[0].filePath = 'C:\\old-machine\\data\\artifacts\\asset.bin'
  Object.assign(value.playbooks[0].stages[0].steps[0].checklist[0], { responseRequired: true, responsePrompt: '旧问题' })
  fs.writeFileSync(path.join(candidate, 'data.json'), JSON.stringify(value))
  const candidateBefore = hashes(candidate)
  fs.writeFileSync(path.join(live, 'data.json.corrupt-old'), 'preserve me')
  const replaceLoaded = vi.fn((data: AppData) => {
    expect(readData(live)).toEqual(data)
    expect(fs.readFileSync(data.artifacts[0].filePath!)).toEqual(fs.readFileSync(path.join(candidate, 'artifacts', 'asset.bin')))
  })
  const result = restoreFullBackup(live, candidate, { replaceLoaded })
  expect(result.restored).toBe(true)
  expect(result.error).toBeUndefined()
  expect(hashes(result.safetyBackupPath!)).toEqual(original)
  expect(readData(live).meta.version).toBe(DATA_VERSION)
  expect(readData(live).playbooks[0].stages[0].steps[0].checklist[0]).not.toHaveProperty('responseRequired')
  expect(readData(live).artifacts[0].filePath).toBe(path.join(live, 'artifacts', 'asset.bin'))
  expect(fs.readFileSync(path.join(live, 'data.json.corrupt-old'), 'utf8')).toBe('preserve me')
  expect(replaceLoaded).toHaveBeenCalledOnce()
  expect(hashes(candidate)).toEqual(candidateBefore)
  expect(fs.readdirSync(root).some((name) => name.startsWith('.restore-'))).toBe(false)
})

test('uses the flushed latest data for the mandatory safety backup', () => {
  const result = restoreFullBackup(live, candidate, { flushCurrent: () => writeFixture(live, 'latest-pending-edit') })
  expect(result.restored).toBe(true)
  expect(readData(result.safetyBackupPath!).meta.createdAt).toBe('latest-pending-edit')
})

test('legacy project answers migrate entirely in staging before loading the restored database', () => {
  const value = readData(candidate)
  value.meta.version = 2
  const stages = value.playbooks[0].stages.map((stage) => ({
    ...stage, status: 'active' as const,
    todos: stage.todos.map((item) => ({ ...item, done: false })),
    exitCriteria: stage.exitCriteria.map((item) => ({ ...item, met: false })),
    deliverables: stage.deliverables.map((item) => ({ ...item, artifactIds: [] })),
    steps: stage.steps.map((step) => ({ ...step, status: 'todo' as const, answers: {}, checklist: step.checklist.map((item) => ({ ...item, done: true })) }))
  }))
  const item = stages[0].steps[0].checklist[0]
  Object.assign(item, { responseRequired: true, responsePrompt: '旧问题', response: '原有回答' })
  value.projects = [{ id: 'project', name: '项目', description: '', priority: 'P1', status: 'active', playbookId: value.playbooks[0].id, playbookVersion: 1, workflowSnapshot: { playbookId: value.playbooks[0].id, playbookVersion: 1, stages }, currentStageId: stages[0].id, createdAt: '', updatedAt: '', lastActiveAt: '' }]
  fs.writeFileSync(path.join(candidate, 'data.json'), JSON.stringify(value))
  expect(restoreFullBackup(live, candidate).restored).toBe(true)
  const step = readData(live).projects[0].workflowSnapshot.stages[0].steps[0]
  expect(step.answers[`legacy_question_${item.id}`]).toBe('原有回答')
  expect(step.questions).toContainEqual({ id: `legacy_question_${item.id}`, q: '旧问题' })
  expect(step.checklist[0]).not.toHaveProperty('response')
})

test('rejects a directory junction in the candidate instead of copying files outside its tree', () => {
  const original = hashes(live)
  fs.symlinkSync(path.join(live, 'artifacts'), path.join(candidate, 'artifacts', 'linked'), 'junction')
  expect(restoreFullBackup(live, candidate).error).toBeTruthy()
  expect(hashes(live)).toEqual(original)
})

test('cleanup failure does not misreport an already committed restore', () => {
  const remove = fs.rmSync.bind(fs)
  vi.spyOn(fs, 'rmSync').mockImplementation((target, options) => {
    if (path.basename(String(target)).startsWith('.restore-rollback')) throw new Error('cleanup locked')
    remove(target, options)
  })
  const result = restoreFullBackup(live, candidate)
  expect(result.restored).toBe(true)
  expect(result.error).toBeUndefined()
  expect(readData(live).meta.createdAt).toBe('replacement-data')
  expect(fs.existsSync(result.safetyBackupPath!)).toBe(true)
})

test.each(['staging', 'safety'])('%s copy failure leaves the original file hashes intact', (phase) => {
  const original = hashes(live)
  const copy = fs.copyFileSync.bind(fs)
  vi.spyOn(fs, 'copyFileSync').mockImplementation((source, target, mode) => {
    if ((phase === 'staging' && String(source).startsWith(candidate)) || (phase === 'safety' && String(target).includes(path.join(root, 'backups')))) throw new Error('sk-private-failure')
    copy(source, target, mode)
  })
  const result = restoreFullBackup(live, candidate)
  expect(result.error).toBeTruthy()
  expect(JSON.stringify(result)).not.toContain('sk-private')
  expect(hashes(live)).toEqual(original)
})

test('failed directory installation rolls back data and artifacts as one unit', () => {
  const original = hashes(live)
  const rename = fs.renameSync.bind(fs)
  vi.spyOn(fs, 'renameSync').mockImplementation((source, target) => {
    if (path.basename(String(source)).startsWith('.restore-stage') && String(target) === live) throw new Error('simulated locked target')
    rename(source, target)
  })
  const replaceLoaded = vi.fn()
  const result = restoreFullBackup(live, candidate, { replaceLoaded })
  expect(result.error).toBeTruthy()
  expect(hashes(live)).toEqual(original)
  expect(hashes(result.safetyBackupPath!)).toEqual(original)
  expect(replaceLoaded).not.toHaveBeenCalled()
})

test('a failure after installation rolls the installed pair back to the original', () => {
  const original = hashes(live)
  const result = restoreFullBackup(live, candidate, { replaceLoaded: () => { throw new Error('sk-private-callback') } })
  expect(result.error).toBeTruthy()
  expect(JSON.stringify(result)).not.toContain('sk-private')
  expect(hashes(live)).toEqual(original)
  expect(hashes(result.safetyBackupPath!)).toEqual(original)
})

test('flush failure aborts before renames and does not replace the loaded database', () => {
  const original = hashes(live)
  const replaceLoaded = vi.fn()
  expect(restoreFullBackup(live, candidate, { flushCurrent: () => { throw new Error('full disk') }, replaceLoaded }).error).toBeTruthy()
  expect(hashes(live)).toEqual(original)
  expect(replaceLoaded).not.toHaveBeenCalled()
})

test('refuses overlapping source/destination trees', () => {
  const original = hashes(live)
  expect(() => createFullBackup(live, path.join(live, 'artifacts'))).toThrow()
  expect(restoreFullBackup(live, live).error).toBeTruthy()
  expect(restoreFullBackup(live, root).error).toBeTruthy()
  expect(hashes(live)).toEqual(original)
})
