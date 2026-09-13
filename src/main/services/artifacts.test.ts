// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import type { Artifact } from '../../shared/types'

const runtime = vi.hoisted(() => ({ artifactRoot: '' }))
vi.mock('../store', () => ({
  artifactsDir: () => runtime.artifactRoot,
  getDB: vi.fn(), saveDB: vi.fn(), id: vi.fn(), nowISO: vi.fn()
}))

import { deleteManagedArtifactFiles } from './artifacts'

afterEach(() => {
  if (runtime.artifactRoot) fs.rmSync(path.dirname(runtime.artifactRoot), { recursive: true, force: true })
  runtime.artifactRoot = ''
})

test('only deletes copied files inside the artifacts root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plos-artifact-delete-'))
  runtime.artifactRoot = path.join(root, 'artifacts')
  fs.mkdirSync(runtime.artifactRoot)
  const copied = path.join(runtime.artifactRoot, 'copied.txt')
  const external = path.join(root, 'original.txt')
  fs.writeFileSync(copied, 'copied')
  fs.writeFileSync(external, 'original')

  deleteManagedArtifactFiles([
    { id: 'copied', filePath: copied },
    { id: 'external', filePath: external }
  ] as Artifact[])

  expect(fs.existsSync(copied)).toBe(false)
  expect(fs.readFileSync(external, 'utf8')).toBe('original')
})

test('refuses an in-root directory instead of recursively deleting it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plos-artifact-delete-'))
  runtime.artifactRoot = path.join(root, 'artifacts')
  const directory = path.join(runtime.artifactRoot, 'not-a-file')
  fs.mkdirSync(directory, { recursive: true })

  expect(() => deleteManagedArtifactFiles([{ id: 'bad', filePath: directory }] as Artifact[])).toThrow('资料文件路径异常')
  expect(fs.existsSync(directory)).toBe(true)
})
