import fs from 'node:fs'
import path from 'node:path'
import type { AppData } from '../../shared/types'
import { DATA_VERSION, migrateData } from '../dataMigrations'

const collections = ['projects', 'playbooks', 'claims', 'evidences', 'artifacts', 'decisions', 'aiReviews'] as const
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
function check(condition: unknown): asserts condition {
  if (!condition) throw new Error('备份内容无效或不完整')
}
function objectArray(value: unknown): asserts value is Record<string, unknown>[] {
  check(Array.isArray(value) && value.every(record))
}
function strings(value: Record<string, unknown>, fields: string): void {
  for (const field of fields.split(' ')) check(typeof value[field] === 'string')
}
function stringArray(value: unknown): void {
  check(Array.isArray(value) && value.every((item) => typeof item === 'string'))
}

/** Validate before migration as migration assumes these nested collections exist. */
export function validateBackupData(value: unknown): asserts value is AppData {
  check(record(value) && record(value.meta))
  check(Number.isInteger(value.meta.version) && Number(value.meta.version) >= 1 && Number(value.meta.version) <= DATA_VERSION && typeof value.meta.createdAt === 'string')
  for (const key of collections) objectArray(value[key])
  check(record(value.settings) && record(value.settings.ai))
  for (const key of ['baseUrl', 'apiKey', 'model']) check(typeof value.settings.ai[key] === 'string')
  const validateStages = (stages: unknown, project: boolean) => {
    objectArray(stages)
    for (const stage of stages) {
      strings(stage, 'id name short introduction objective keyQuestion')
      check(typeof stage.order === 'number' && typeof stage.minEvidence === 'number')
      for (const key of ['todos', 'steps', 'deliverables', 'exitCriteria']) objectArray(stage[key])
      stringArray(stage.methodology)
      for (const key of ['todos', 'exitCriteria']) for (const item of stage[key] as Record<string, unknown>[]) {
        strings(item, 'id text')
        if (project) check(typeof item[key === 'todos' ? 'done' : 'met'] === 'boolean')
      }
      for (const step of stage.steps as Record<string, unknown>[]) {
        strings(step, 'id name goal description')
        objectArray(step.checklist)
        objectArray(step.questions)
        for (const question of step.questions) {
          strings(question, 'id q')
          if (question.hint !== undefined) check(typeof question.hint === 'string')
        }
        for (const item of step.checklist) {
          check(typeof item.id === 'string' && typeof item.text === 'string')
          if (project) check(typeof item.done === 'boolean')
          if (item.response !== undefined) check(typeof item.response === 'string')
        }
        if (project) {
          check(record(step.answers) && Object.values(step.answers).every((answer) => typeof answer === 'string'))
          check(step.status === 'todo' || step.status === 'done')
        }
      }
      for (const item of stage.deliverables as Record<string, unknown>[]) {
        strings(item, 'id name description')
        check(typeof item.required === 'boolean')
        if (item.content !== undefined) check(typeof item.content === 'string')
        if (project) stringArray(item.artifactIds)
      }
      if (project) check(['locked', 'active', 'passed', 'abandoned'].includes(String(stage.status)))
    }
  }
  for (const playbook of value.playbooks as Record<string, unknown>[]) {
    strings(playbook, 'id name description createdAt updatedAt')
    check(typeof playbook.version === 'number')
    objectArray(playbook.history)
    validateStages(playbook.stages, false)
  }
  for (const project of value.projects as Record<string, unknown>[]) {
    strings(project, 'id name description playbookId currentStageId createdAt updatedAt lastActiveAt')
    check(['P1', 'P2', 'P3'].includes(String(project.priority)))
    check(['active', 'waiting', 'paused', 'completed', 'abandoned'].includes(String(project.status)))
    check(record(project.workflowSnapshot))
    validateStages(project.workflowSnapshot.stages, true)
  }
  for (const claim of value.claims as Record<string, unknown>[]) strings(claim, 'id projectId stageId statement createdAt')
  for (const decision of value.decisions as Record<string, unknown>[]) strings(decision, 'id projectId type reason createdAt')
  for (const evidence of value.evidences as Record<string, unknown>[]) {
    strings(evidence, 'id projectId stageId title type content strength createdAt')
    stringArray(evidence.relatedClaimIds)
  }
  for (const review of value.aiReviews as Record<string, unknown>[]) {
    strings(review, 'id projectId stageId status nextStep createdAt')
    for (const key of ['verified', 'unverified', 'gaps']) objectArray(review[key])
    stringArray(review.logicIssues)
  }
  for (const artifact of value.artifacts as Record<string, unknown>[]) {
    strings(artifact, 'id projectId stageId title sourceType extractedContent createdAt')
    check(typeof artifact.hasContent === 'boolean')
    if (artifact.filePath !== undefined) check(typeof artifact.filePath === 'string' && artifact.filePath.length > 0)
  }
}

/** Do not follow symlinks/junctions or copy devices outside the chosen tree. */
function copyTree(source: string, destination: string): void {
  const stat = fs.lstatSync(source)
  check(!stat.isSymbolicLink())
  if (stat.isDirectory()) {
    fs.mkdirSync(destination)
    for (const name of fs.readdirSync(source)) copyTree(path.join(source, name), path.join(destination, name))
  } else {
    check(stat.isFile())
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL)
  }
}

function contains(parent: string, child: string): boolean {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
}
function uniqueDirectory(parent: string, prefix: string): string {
  fs.mkdirSync(parent, { recursive: true })
  return fs.mkdtempSync(path.join(parent, `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}-`))
}
function copyPayload(source: string, destination: string): void {
  copyTree(path.join(source, 'data.json'), path.join(destination, 'data.json'))
  copyTree(path.join(source, 'artifacts'), path.join(destination, 'artifacts'))
}
function readCandidate(directory: string, liveDirectory: string): AppData {
  const value: unknown = JSON.parse(fs.readFileSync(path.join(directory, 'data.json'), 'utf8'))
  validateBackupData(value)
  const { data } = migrateData(value)
  validateBackupData(data)
  for (const artifact of data.artifacts) {
    if (!artifact.filePath) continue
    // Imported files are stored flat under artifacts. Rebase old-machine paths.
    const name = path.win32.basename(artifact.filePath.replace(/\//g, '\\'))
    check(name !== '.' && name !== '..' && name.length > 0)
    check(fs.statSync(path.join(directory, 'artifacts', name)).isFile())
    artifact.filePath = path.join(liveDirectory, 'artifacts', name)
  }
  return data
}

export function createFullBackup(liveDirectory: string, destinationParent: string): string {
  const source = fs.realpathSync(liveDirectory)
  const parent = fs.realpathSync(destinationParent)
  check(!contains(source, parent))
  const target = uniqueDirectory(parent, 'product-lifecycle-backup')
  try {
    copyPayload(source, target)
    readCandidate(target, source)
    return target
  } catch {
    // A failed partial copy must never be presented as a complete backup.
    fs.rmSync(target, { recursive: true, force: true })
    throw new Error('完整备份失败，请检查目录权限、磁盘空间及资料文件是否完整')
  }
}

export function restoreFullBackup(liveDirectory: string, candidateDirectory: string, hooks: {
  flushCurrent?: () => void
  replaceLoaded?: (data: AppData) => void
} = {}): { restored?: boolean; safetyBackupPath?: string; error?: string } {
  let staging: string | undefined
  let rollback: string | undefined
  let safetyBackupPath: string | undefined
  let oldMoved = false
  let installed = false
  const live = path.resolve(liveDirectory)
  try {
    const candidate = fs.realpathSync(candidateDirectory)
    const current = fs.realpathSync(live)
    check(!contains(current, candidate) && !contains(candidate, current))
    staging = uniqueDirectory(path.dirname(live), '.restore-stage')
    copyPayload(candidate, staging)
    const restored = readCandidate(staging, live)
    fs.writeFileSync(path.join(staging, 'data.json'), JSON.stringify(restored, null, 2), 'utf8')
    // No current data or timer is touched until staged validation has succeeded.
    hooks.flushCurrent?.()
    const backupParent = path.join(path.dirname(live), 'backups')
    fs.mkdirSync(backupParent, { recursive: true })
    safetyBackupPath = createFullBackup(live, backupParent)
    // Preserve other local files (including existing corrupt-file recovery copies).
    for (const name of fs.readdirSync(live)) {
      if (name !== 'data.json' && name !== 'artifacts') copyTree(path.join(live, name), path.join(staging, name))
    }
    rollback = uniqueDirectory(path.dirname(live), '.restore-rollback')
    fs.rmdirSync(rollback)
    // Synchronous same-volume renames prevent other IPC handlers observing half a pair.
    fs.renameSync(live, rollback)
    oldMoved = true
    fs.renameSync(staging, live)
    installed = true
    hooks.replaceLoaded?.(restored)
    oldMoved = false
    return { restored: true, safetyBackupPath }
  } catch {
    if (oldMoved && rollback) {
      try {
        if (installed && staging) fs.renameSync(live, staging)
        fs.renameSync(rollback, live)
        oldMoved = false
      } catch {
        // Retain rollback and safety backup if the filesystem itself prevents recovery.
        return { safetyBackupPath, error: '恢复失败，原数据已保留在安全备份中。请检查磁盘或目录占用后重试，暂勿关闭应用' }
      }
    }
    // Never return parser messages or arbitrary filesystem errors containing secrets.
    return { safetyBackupPath, error: '恢复失败，当前数据未替换。请检查备份格式、版本、资料文件及目录权限' }
  } finally {
    // Cleanup cannot turn a committed restore into a reported failure.
    for (const directory of [staging, oldMoved ? undefined : rollback]) {
      if (directory) try { fs.rmSync(directory, { recursive: true, force: true }) } catch { /* retain harmless temporary files */ }
    }
  }
}
