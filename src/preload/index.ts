import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '../shared/types'

// 统一调用约定：invoke(channel, args) → { ok, data } | { ok, error }
function call<T>(channel: string, args?: unknown): Promise<T> {
  return ipcRenderer.invoke(channel, args).then((r) => {
    if (r && typeof r === 'object' && 'ok' in r) {
      if (r.ok) return r.data as T
      throw new Error(r.error || '操作失败')
    }
    return r as T
  })
}

const api: Api = {
  getData: () => call('data:getAll'),
  createProject: (p) => call('project:create', p),
  createDemoProject: () => call('project:createDemo'),
  updateProject: (p) => call('project:update', p),
  setProjectStatus: (p) => call('project:setStatus', p),
  deleteProject: (p) => call('project:delete', p),
  stageUpdate: (p) => call('stage:update', p),
  stepSave: (p) => call('step:save', p),
  stepComplete: (p) => call('step:complete', p),
  deliverableSubmit: (p) => call('deliverable:submit', p),
  deliverableDelete: (p) => call('deliverable:delete', p),
  applyDecision: (p) => call('decision:apply', p),
  claimAdd: (p) => call('claim:add', p),
  claimDelete: (p) => call('claim:delete', p),
  evidenceAdd: (p) => call('evidence:add', p),
  evidenceDelete: (p) => call('evidence:delete', p),
  artifactAddFromText: (p) => call('artifact:addFromText', p),
  artifactAddFromFile: (p) => call('artifact:addFromFile', p),
  artifactGetContent: (p) => call('artifact:getContent', p),
  artifactDelete: (p) => call('artifact:delete', p),
  aiReviewStage: (p) => call('ai:reviewStage', p),
  aiProjectSummary: (p) => call('ai:projectSummary', p),
  aiStepAssist: (p) => call('ai:stepAssist', p),
  aiTestConnection: () => call('ai:testConnection'),
  playbookSave: (p) => call('playbook:save', p),
  reportExport: (p) => call('report:export', p),
  settingsSave: (p) => call('settings:save', p),
  backupCreate: () => call('backup:create'),
  backupRestore: () => call('backup:restore'),
  openPath: (p) => call('app:openPath', p),
  revealDataFolder: () => call('app:revealDataFolder'),
  resetData: () => call('app:resetData'),
  pickFile: (p) => call('app:pickFile', p),
  getVersions: () => call('app:getVersions'),
  getDataPath: () => call('app:getDataPath')
}

contextBridge.exposeInMainWorld('api', api)
