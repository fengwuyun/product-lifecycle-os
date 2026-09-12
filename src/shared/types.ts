// ─── 共享类型定义（main / preload / renderer 共用） ───

export type Priority = 'P1' | 'P2' | 'P3'
export type ProjectStatus = 'active' | 'waiting' | 'paused' | 'completed' | 'abandoned'
export type StageStatus = 'locked' | 'active' | 'passed' | 'abandoned'
export type StepStatus = 'todo' | 'done'
export type EvidenceStrength = '极强' | '强' | '中' | '弱' | '极弱'
export const EVIDENCE_STRENGTHS: EvidenceStrength[] = ['极强', '强', '中', '弱', '极弱']
export type ClaimSupport = '已支持' | '部分支持' | '证据不足' | '存在冲突' | '未验证'
export type AIReviewStatus = 'Ready' | 'Ready with risks' | 'Insufficient Evidence' | 'Contradiction'
export type DecisionType = 'advance' | 'rollback' | 'pause' | 'abandon' | 'pivot' | 'resume' | 'complete'

export const DECISION_LABELS: Record<DecisionType, string> = {
  advance: '继续 · 进入下一阶段',
  rollback: '回退 · 补充验证',
  pause: '暂停项目',
  abandon: '放弃项目',
  pivot: '调整定位',
  resume: '恢复推进',
  complete: '完成项目'
}

export interface PlaybookStepDef {
  id: string
  name: string
  goal: string
  description: string
  checklist: { id: string; text: string }[]
  questions: { id: string; q: string; hint?: string }[]
}

export interface PlaybookStageDef {
  id: string
  name: string
  short: string
  order: number
  introduction: string
  objective: string
  keyQuestion: string
  methodology: string[]
  todos: { id: string; text: string }[]
  steps: PlaybookStepDef[]
  deliverables: { id: string; name: string; description: string; required: boolean }[]
  exitCriteria: { id: string; text: string }[]
  minEvidence: number
  decisionHint?: string
}

export interface Playbook {
  id: string
  name: string
  version: number
  description: string
  stages: PlaybookStageDef[]
  history: { version: number; savedAt: string; note: string }[]
  createdAt: string
  updatedAt: string
}

// ─── 项目侧（Playbook Snapshot + 运行时状态） ───

export interface ProjectTodo { id: string; text: string; done: boolean }
export interface ProjectChecklistItem {
  id: string
  text: string
  done: boolean
}
export interface ProjectStep {
  id: string
  name: string
  goal: string
  description: string
  checklist: ProjectChecklistItem[]
  questions: { id: string; q: string; hint?: string }[]
  answers: Record<string, string>
  status: StepStatus
  completedAt?: string
}
export interface ProjectDeliverable {
  id: string
  name: string
  description: string
  required: boolean
  title?: string
  content?: string
  artifactIds: string[]
  submittedAt?: string
}
export interface ProjectStage {
  id: string
  name: string
  short: string
  order: number
  introduction: string
  objective: string
  keyQuestion: string
  methodology: string[]
  todos: ProjectTodo[]
  steps: ProjectStep[]
  deliverables: ProjectDeliverable[]
  exitCriteria: { id: string; text: string; met: boolean }[]
  minEvidence: number
  decisionHint?: string
  status: StageStatus
  decision?: { type: DecisionType; reason: string; at: string }
}
export interface WorkflowSnapshot {
  playbookId: string
  playbookVersion: number
  stages: ProjectStage[]
}
export interface Project {
  id: string
  name: string
  description: string
  priority: Priority
  status: ProjectStatus
  playbookId: string
  playbookVersion: number
  workflowSnapshot: WorkflowSnapshot
  currentStageId: string
  currentStepId?: string
  createdAt: string
  updatedAt: string
  lastActiveAt: string
}

// ─── 证据 / Claim / 资料 / 决策 / AI ───

export interface Claim {
  id: string
  projectId: string
  stageId: string
  statement: string
  note?: string
  createdAt: string
}
export interface Evidence {
  id: string
  projectId: string
  stageId: string
  title: string
  type: string
  content: string
  sourceUrl?: string
  artifactId?: string
  relatedClaimIds: string[]
  strength: EvidenceStrength
  notes?: string
  createdAt: string
}
export interface ArtifactMeta {
  id: string
  projectId: string
  stageId: string
  title: string
  sourceType: 'text' | 'file' | 'url'
  fileName?: string
  filePath?: string
  ext?: string
  sizeBytes?: number
  notes?: string
  hasContent: boolean
  createdAt: string
}
export interface Artifact extends ArtifactMeta {
  extractedContent: string
  extractedHtml?: string
}
export interface Decision {
  id: string
  projectId: string
  stageId?: string
  stageName?: string
  type: DecisionType
  before?: string
  after?: string
  reason: string
  createdAt: string
}
export interface AIReview {
  id: string
  projectId: string
  stageId: string
  status: AIReviewStatus
  verified: { text: string; evidence: string }[]
  unverified: { text: string; suggestion: string }[]
  gaps: { claim: string; existing: string; missing: string }[]
  logicIssues: string[]
  nextStep: string
  raw?: string
  createdAt: string
}

export interface Settings {
  ai: { baseUrl: string; apiKey: string; model: string }
}

export interface AppData {
  meta: { version: number; createdAt: string }
  settings: Settings
  playbooks: Playbook[]
  projects: Project[]
  claims: Claim[]
  evidences: Evidence[]
  artifacts: Artifact[]
  decisions: Decision[]
  aiReviews: AIReview[]
}

// ─── Stage Gate ───

export interface StageGate {
  todosDone: number
  todosTotal: number
  deliverablesDone: number
  deliverablesRequired: number
  evidenceCount: number
  evidenceRequired: number
  criteriaMet: number
  criteriaTotal: number
  ready: boolean
  missing: string[]
}

// ─── AI 项目总结 ───

export interface AISummarySection { title: string; content: string }

// ─── 渲染进程 API 桥 ───

export interface Api {
  getData(): Promise<AppData>
  createProject(p: { name: string; description: string; priority: Priority }): Promise<{ projectId: string }>
  createDemoProject(): Promise<{ projectId: string }>
  updateProject(p: { id: string; patch: Partial<Pick<Project, 'name' | 'description' | 'priority'>> }): Promise<void>
  setProjectStatus(p: { id: string; status: ProjectStatus; reason?: string }): Promise<void>
  deleteProject(p: { id: string }): Promise<void>
  stageUpdate(p: { projectId: string; stageId: string; patch: { todos?: ProjectTodo[]; exitCriteria?: { id: string; text: string; met: boolean }[] } }): Promise<void>
  stepSave(p: { projectId: string; stageId: string; stepId: string; patch: { checklist?: ProjectChecklistItem[]; answers?: Record<string, string> } }): Promise<void>
  stepComplete(p: { projectId: string; stageId: string; stepId: string; completed: boolean }): Promise<void>
  deliverableSubmit(p: { projectId: string; stageId: string; deliverableId: string; title: string; content: string; artifactIds: string[] }): Promise<void>
  deliverableDelete(p: { projectId: string; stageId: string; deliverableId: string }): Promise<void>
  applyDecision(p: { projectId: string; stageId: string; type: DecisionType; reason: string }): Promise<void>
  claimAdd(p: { projectId: string; stageId: string; statement: string; note?: string }): Promise<Claim>
  claimDelete(p: { id: string }): Promise<void>
  evidenceAdd(p: Omit<Evidence, 'id' | 'createdAt' | 'projectId' | 'stageId'> & { projectId: string; stageId: string }): Promise<Evidence>
  evidenceDelete(p: { id: string }): Promise<void>
  artifactAddFromText(p: { projectId: string; stageId: string; title: string; content: string; notes?: string }): Promise<ArtifactMeta>
  artifactAddFromFile(p: { projectId: string; stageId: string; title: string; notes?: string; path: string }): Promise<{ artifact?: ArtifactMeta; error?: string }>
  artifactGetContent(p: { id: string }): Promise<Artifact | null>
  artifactDelete(p: { id: string }): Promise<void>
  aiReviewStage(p: { projectId: string; stageId: string }): Promise<{ review?: AIReview; error?: string }>
  aiProjectSummary(p: { projectId: string }): Promise<{ sections?: AISummarySection[]; error?: string }>
  aiStepAssist(p: { projectId: string; stageId: string; stepId: string }): Promise<{ text?: string; error?: string }>
  aiTestConnection(): Promise<{ ok: boolean; message: string }>
  playbookSave(p: { id: string; name: string; description: string; stages: PlaybookStageDef[]; note: string }): Promise<{ version: number }>
  reportExport(p: { projectId: string; withAiSummary: boolean }): Promise<{ path?: string; canceled?: boolean; error?: string }>
  settingsSave(p: { settings: Settings }): Promise<void>
  openPath(p: { path: string }): Promise<void>
  revealDataFolder(): Promise<void>
  resetData(): Promise<void>
  pickFile(p: { filters: { name: string; extensions: string[] }[] }): Promise<{ canceled: boolean; path?: string }>
  getVersions(): Promise<{ app: string; electron: string; node: string }>
  getDataPath(): Promise<string>
}

export const ARTIFACT_EXTS = ['txt', 'md', 'pdf', 'docx', 'xlsx', 'csv', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
