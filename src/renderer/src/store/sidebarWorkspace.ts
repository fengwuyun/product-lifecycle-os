import { create } from 'zustand'

const STORAGE_KEY = 'lifecycle.sidebar-workspace.v1'
interface PersistedWorkspace { version: 1; projectIds: string[]; expandedProjectIds: string[] }
interface SidebarWorkspaceState extends PersistedWorkspace {
  hydrate: (validProjectIds: string[]) => void
  openProject: (projectId: string) => void
  removeProject: (projectId: string) => void
  toggleExpanded: (projectId: string) => void
  collapseProject: (projectId: string) => void
  moveProject: (sourceId: string, targetId: string) => void
  moveProjectBy: (projectId: string, delta: -1 | 1) => void
}

const unique = (ids: string[]) => [...new Set(ids)]
function readWorkspace(): PersistedWorkspace {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<PersistedWorkspace>
    return { version: 1, projectIds: unique(Array.isArray(parsed.projectIds) ? parsed.projectIds : []), expandedProjectIds: unique(Array.isArray(parsed.expandedProjectIds) ? parsed.expandedProjectIds : []) }
  } catch { return { version: 1, projectIds: [], expandedProjectIds: [] } }
}
function persist(state: PersistedWorkspace): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, projectIds: state.projectIds, expandedProjectIds: state.expandedProjectIds }))
}
const initial = readWorkspace()

export const useSidebarWorkspace = create<SidebarWorkspaceState>((set) => ({
  ...initial,
  hydrate: (validProjectIds) => set((state) => {
    const valid = new Set(validProjectIds)
    const next = { ...state, projectIds: state.projectIds.filter((id) => valid.has(id)), expandedProjectIds: state.expandedProjectIds.filter((id) => valid.has(id)) }
    persist(next); return next
  }),
  openProject: (projectId) => set((state) => {
    if (state.projectIds.includes(projectId)) return state
    const next = { ...state, projectIds: [...state.projectIds, projectId], expandedProjectIds: [...state.expandedProjectIds, projectId] }
    persist(next); return next
  }),
  removeProject: (projectId) => set((state) => {
    const next = { ...state, projectIds: state.projectIds.filter((id) => id !== projectId), expandedProjectIds: state.expandedProjectIds.filter((id) => id !== projectId) }
    persist(next); return next
  }),
  toggleExpanded: (projectId) => set((state) => {
    const expandedProjectIds = state.expandedProjectIds.includes(projectId) ? state.expandedProjectIds.filter((id) => id !== projectId) : [...state.expandedProjectIds, projectId]
    const next = { ...state, expandedProjectIds }; persist(next); return next
  }),
  collapseProject: (projectId) => set((state) => {
    if (!state.expandedProjectIds.includes(projectId)) return state
    const next = { ...state, expandedProjectIds: state.expandedProjectIds.filter((id) => id !== projectId) }
    persist(next); return next
  }),
  moveProject: (sourceId, targetId) => set((state) => {
    if (sourceId === targetId || !state.projectIds.includes(sourceId) || !state.projectIds.includes(targetId)) return state
    const targetIndex = state.projectIds.indexOf(targetId)
    const projectIds = state.projectIds.filter((id) => id !== sourceId)
    projectIds.splice(targetIndex, 0, sourceId)
    const next = { ...state, projectIds }; persist(next); return next
  }),
  moveProjectBy: (projectId, delta) => set((state) => {
    const from = state.projectIds.indexOf(projectId), to = from + delta
    if (from < 0 || to < 0 || to >= state.projectIds.length) return state
    const projectIds = [...state.projectIds]
    ;[projectIds[from], projectIds[to]] = [projectIds[to], projectIds[from]]
    const next = { ...state, projectIds }; persist(next); return next
  })
}))
