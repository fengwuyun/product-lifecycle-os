import { app, ipcMain, dialog, shell, BrowserWindow } from 'electron'
import type { Api, Settings, Priority, ProjectStatus, DecisionType, PlaybookStageDef } from '../shared/types'
import { getDB, saveDB, loadDB, flushDB, resetDB, dataDir } from './store'
import * as projects from './services/projects'
import * as artifacts from './services/artifacts'
import * as ai from './services/ai'
import { exportReport } from './services/report'

// 统一的 IPC 注册：channel 名与 preload 桥一一对应
export function registerIPC(getMainWindow: () => BrowserWindow | null): void {
  const wrap = <A, R>(fn: (args: A) => R | Promise<R>) =>
    async (_e: Electron.IpcMainInvokeEvent, args: A): Promise<{ ok: true; data: R } | { ok: false; error: string }> => {
      try {
        return { ok: true, data: await fn(args) }
      } catch (err) {
        console.error('[ipc] failed', err)
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  const wrap0 = <R>(fn: () => R | Promise<R>) =>
    async (): Promise<{ ok: true; data: R } | { ok: false; error: string }> => {
      try {
        return { ok: true, data: await fn() }
      } catch (err) {
        console.error('[ipc] failed', err)
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }

  ipcMain.handle('data:getAll', wrap0(() => projects.getAllData()))

  ipcMain.handle('project:create', wrap((p: { name: string; description: string; priority: Priority }) => projects.createProject(p)))
  ipcMain.handle('project:createDemo', wrap0(() => projects.createDemoProject()))
  ipcMain.handle('project:update', wrap((p: { id: string; patch: Partial<Pick<{ name: string; description: string; priority: Priority }, 'name' | 'description' | 'priority'>> }) => projects.updateProject(p)))
  ipcMain.handle('project:setStatus', wrap((p: { id: string; status: ProjectStatus; reason?: string }) => projects.setProjectStatus(p)))
  ipcMain.handle('project:delete', wrap((p: { id: string }) => projects.deleteProject(p)))

  ipcMain.handle('stage:update', wrap((p: Parameters<typeof projects.stageUpdate>[0]) => projects.stageUpdate(p)))
  ipcMain.handle('step:save', wrap((p: Parameters<typeof projects.stepSave>[0]) => projects.stepSave(p)))
  ipcMain.handle('step:complete', wrap((p: Parameters<typeof projects.stepComplete>[0]) => projects.stepComplete(p)))
  ipcMain.handle('deliverable:submit', wrap((p: Parameters<typeof projects.deliverableSubmit>[0]) => projects.deliverableSubmit(p)))
  ipcMain.handle('deliverable:delete', wrap((p: Parameters<typeof projects.deliverableDelete>[0]) => projects.deliverableDelete(p)))
  ipcMain.handle('decision:apply', wrap((p: Parameters<typeof projects.applyDecision>[0]) => projects.applyDecision(p)))

  ipcMain.handle('claim:add', wrap((p: Parameters<typeof projects.claimAdd>[0]) => projects.claimAdd(p)))
  ipcMain.handle('claim:delete', wrap((p: { id: string }) => projects.claimDelete(p)))
  ipcMain.handle('evidence:add', wrap((p: Parameters<typeof projects.evidenceAdd>[0]) => projects.evidenceAdd(p)))
  ipcMain.handle('evidence:delete', wrap((p: { id: string }) => projects.evidenceDelete(p)))

  ipcMain.handle('artifact:addFromText', wrap((p: Parameters<typeof artifacts.addTextArtifact>[0]) => artifacts.addTextArtifact(p)))
  ipcMain.handle('artifact:addFromFile', wrap((p: { projectId: string; stageId: string; title: string; notes?: string; path: string }) =>
    artifacts.parseAndStoreFile({ projectId: p.projectId, stageId: p.stageId, title: p.title, notes: p.notes, filePath: p.path })))
  ipcMain.handle('artifact:getContent', wrap((p: { id: string }) => artifacts.getArtifactContent(p)))
  ipcMain.handle('artifact:delete', wrap((p: { id: string }) => artifacts.deleteArtifact(p)))

  ipcMain.handle('ai:reviewStage', wrap((p: { projectId: string; stageId: string }) => ai.reviewStage(p)))
  ipcMain.handle('ai:projectSummary', wrap((p: { projectId: string }) => ai.projectSummary(p)))
  ipcMain.handle('ai:stepAssist', wrap((p: { projectId: string; stageId: string; stepId: string }) => ai.stepAssist(p)))
  ipcMain.handle('ai:testConnection', wrap0(() => ai.testConnection()))

  ipcMain.handle('playbook:save', wrap((p: { id: string; name: string; description: string; stages: PlaybookStageDef[]; note: string }) => {
    const db = getDB()
    const pb = db.playbooks.find((x) => x.id === p.id)
    if (!pb) throw new Error('Playbook 不存在')
    pb.version += 1
    pb.name = p.name
    pb.description = p.description
    pb.stages = p.stages.map((s, i) => ({ ...s, order: i + 1 }))
    pb.history.push({ version: pb.version, savedAt: new Date().toISOString(), note: p.note })
    pb.updatedAt = new Date().toISOString()
    saveDB()
    return { version: pb.version }
  }))

  ipcMain.handle('report:export', wrap((p: { projectId: string; withAiSummary: boolean }) => exportReport({ ...p, mainWindow: getMainWindow() })))

  ipcMain.handle('settings:save', wrap((p: { settings: Settings }) => {
    const db = getDB()
    db.settings = p.settings
    saveDB()
  }))

  ipcMain.handle('app:openPath', wrap(async (p: { path: string }) => {
    await shell.openPath(p.path)
  }))
  ipcMain.handle('app:revealDataFolder', wrap0(() => {
    shell.openPath(dataDir())
  }))
  ipcMain.handle('app:resetData', wrap0(() => {
    resetDB()
    loadDB()
  }))
  ipcMain.handle('app:pickFile', wrap(async (p: { filters: { name: string; extensions: string[] }[] }) => {
    const win = getMainWindow()
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: p.filters
    })
    if (result.canceled || !result.filePaths[0]) return { canceled: true }
    return { canceled: false, path: result.filePaths[0] }
  }))
  ipcMain.handle('app:getVersions', wrap0(() => ({
    app: app.getVersion(),
    electron: process.versions.electron || '',
    node: process.versions.node || ''
  })))
  ipcMain.handle('app:getDataPath', wrap0(() => dataDir()))

  app.on('before-quit', () => {
    flushDB()
  })
}

export type { DecisionType }
