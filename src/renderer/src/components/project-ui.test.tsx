import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import { ToastHost } from '../App'
import { ArtifactModal, CreateProjectModal, ClaimInlineAdd, DeliverableModal, EvidenceModal } from './modals'
import { Sidebar } from './Sidebar'
import { Button, Modal } from './ui'
import { getMenuPosition, PortfolioPage, projectMatchesSearch } from '../pages/Portfolio'
import { PipelinePage } from '../pages/Pipeline'
import { SettingsPage } from '../pages/Settings'
import { StagePage } from '../pages/Stage'
import { StepPage } from '../pages/Step'
import { useApp } from '../store/app'
import { useSidebarWorkspace } from '../store/sidebarWorkspace'
import { reconcileChecklistItems } from '../pages/Playbook'
import type { AppData, Project } from '@shared/types'

const project = {
  id: 'prj-new', name: '测试项目', description: '', priority: 'P1', status: 'active',
  playbookId: 'pb', playbookVersion: 1,
  workflowSnapshot: { playbookId: 'pb', playbookVersion: 1, stages: [] },
  currentStageId: '', createdAt: '2026-09-08T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z', lastActiveAt: '2026-09-08T00:00:00.000Z'
} as Project

const emptyData = {
  meta: { version: 1, createdAt: '2026-09-08T00:00:00.000Z' },
  settings: { ai: { baseUrl: '', apiKey: '', model: '' } },
  playbooks: [{ id: 'pb', name: '默认方法', description: '', version: 1, stages: [], history: [], createdAt: '', updatedAt: '' }],
  projects: [], claims: [], evidences: [], artifacts: [], decisions: [], aiReviews: []
} as AppData

beforeEach(() => {
  localStorage.clear()
  useApp.setState({ data: emptyData, loading: false, toasts: [], portfolioView: 'list' })
  useSidebarWorkspace.setState({ version: 2, projectIds: [], expandedProjectIds: [], recentProjectIds: [] })
})

test('侧边栏工作区安全迁移 v1 本地状态到 v2', async () => {
  localStorage.setItem('lifecycle.sidebar-workspace.v1', JSON.stringify({ version: 1, projectIds: ['one', 'one', 'two'], expandedProjectIds: ['two', 'two'] }))
  vi.resetModules()
  const { useSidebarWorkspace: migratedWorkspace } = await import('../store/sidebarWorkspace')
  expect(migratedWorkspace.getState()).toMatchObject({ version: 2, projectIds: ['one', 'two'], expandedProjectIds: ['two'], recentProjectIds: [] })
})

test('本地存储写入失败时，工作区仍可在内存中启动和更新', async () => {
  const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage disabled') })
  try {
    vi.resetModules()
    const { useSidebarWorkspace: memoryWorkspace } = await import('../store/sidebarWorkspace')
    expect(() => memoryWorkspace.getState().openProject('one')).not.toThrow()
    expect(memoryWorkspace.getState()).toMatchObject({ projectIds: ['one'], recentProjectIds: ['one'] })
  } finally {
    setItem.mockRestore()
  }
})

test('最近项目去重、限五个并在 hydrate 时过滤失效 ID', () => {
  useSidebarWorkspace.setState({ version: 2, projectIds: ['one', 'two', 'three', 'four', 'five', 'six'], expandedProjectIds: [], recentProjectIds: [] })
  ;['one', 'two', 'three', 'four', 'five', 'six', 'two'].forEach((id) => useSidebarWorkspace.getState().markRecent(id))
  expect(useSidebarWorkspace.getState().recentProjectIds).toEqual(['two', 'six', 'five', 'four', 'three'])
  useSidebarWorkspace.getState().hydrate(['two', 'four'])
  expect(useSidebarWorkspace.getState().recentProjectIds).toEqual(['two', 'four'])
})

test('打开项目会记录最近访问，但不会改变拖动后的项目顺序', () => {
  useSidebarWorkspace.setState({ version: 2, projectIds: ['one', 'two', 'three'], expandedProjectIds: [], recentProjectIds: ['three'] })
  useSidebarWorkspace.getState().moveProject('three', 'one')
  useSidebarWorkspace.getState().openProject('two')
  expect(useSidebarWorkspace.getState().projectIds).toEqual(['three', 'one', 'two'])
  expect(useSidebarWorkspace.getState().recentProjectIds).toEqual(['two', 'three'])
})

test('全部折叠会清除所有展开项目', () => {
  useSidebarWorkspace.setState({ version: 2, projectIds: ['one', 'two'], expandedProjectIds: ['one', 'two'], recentProjectIds: [] })
  useSidebarWorkspace.getState().collapseAll()
  expect(useSidebarWorkspace.getState().expandedProjectIds).toEqual([])
})

test('项目搜索覆盖名称、描述、当前阶段及本地化状态', () => {
  const searchable = {
    ...project,
    name: '增长实验',
    description: '为订阅转化建立假设',
    status: 'waiting',
    currentStageId: 'stage-discovery',
    workflowSnapshot: {
      ...project.workflowSnapshot,
      stages: [{ id: 'stage-discovery', name: '机会发现', short: '发现', order: 1, introduction: '', objective: '', keyQuestion: '', methodology: [], todos: [], steps: [], deliverables: [], exitCriteria: [], minEvidence: 0, status: 'active' }]
    }
  } as Project
  expect(['增长', '订阅', '机会发现', '发现', '等待中'].every((query) => projectMatchesSearch(searchable, query))).toBe(true)
  expect(projectMatchesSearch(searchable, '不存在')).toBe(false)
})

test('搜索只过滤项目列表，不改变当前焦点', async () => {
  const focusProject = { ...project, name: '持续焦点' }
  const matchedProject = { ...project, id: 'prj-match', name: '搜索命中', priority: 'P2' as const }
  useApp.setState({ data: { ...emptyData, projects: [focusProject, matchedProject] } })
  render(<MemoryRouter><PortfolioPage /></MemoryRouter>)

  await userEvent.type(screen.getByLabelText('搜索项目'), '命中')
  expect(screen.getByText('持续焦点')).toBeTruthy()
  expect(screen.getByText('搜索命中')).toBeTruthy()
})

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="current-location">{location.pathname}</output>
}

test('无结果可清除搜索，最近项目快捷入口可导航', async () => {
  const recent = { ...project, id: 'prj-recent', name: '最近项目' }
  useApp.setState({ data: { ...emptyData, projects: [project, recent] } })
  useSidebarWorkspace.setState({ version: 2, projectIds: [project.id, recent.id], expandedProjectIds: [], recentProjectIds: [recent.id] })
  render(<MemoryRouter initialEntries={['/']}><Routes><Route path="*" element={<><PortfolioPage /><LocationProbe /></>} /></Routes></MemoryRouter>)

  await userEvent.type(screen.getByLabelText('搜索项目'), '没有结果')
  expect(screen.getByText('未找到匹配项目')).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: '清除搜索' }))
  expect((screen.getByLabelText('搜索项目') as HTMLInputElement).value).toBe('')
  await userEvent.click(screen.getByRole('button', { name: '最近项目' }))
  expect(screen.getByTestId('current-location').textContent).toBe('/project/prj-recent')
})

test('创建成功后先刷新全局数据，再进入新项目', async () => {
  const createProject = vi.fn().mockResolvedValue({ projectId: project.id })
  const getData = vi.fn().mockResolvedValue({ ...emptyData, projects: [project] })
  window.api = { createProject, getData } as unknown as typeof window.api
  const onCreated = vi.fn()
  render(<CreateProjectModal open onClose={vi.fn()} onCreated={onCreated} />)

  await userEvent.type(screen.getByPlaceholderText('例如：小时工记账'), '测试项目')
  await userEvent.click(screen.getByRole('button', { name: '创建项目' }))

  expect(getData).toHaveBeenCalledOnce()
  expect(useApp.getState().data?.projects[0]?.id).toBe(project.id)
  expect(getData.mock.invocationCallOrder[0]).toBeLessThan(onCreated.mock.invocationCallOrder[0])
})

test('项目操作菜单渲染到页面顶层，不受列表容器裁剪', async () => {
  useApp.setState({ data: { ...emptyData, projects: [project] } })
  render(<MemoryRouter><PortfolioPage /></MemoryRouter>)
  const trigger = screen.getByLabelText('打开项目操作菜单')
  let triggerTop = 100
  vi.spyOn(trigger, 'getBoundingClientRect').mockImplementation(() => ({
    top: triggerTop, bottom: triggerTop + 30, right: 1000, left: 970, width: 30, height: 30, x: 970, y: triggerTop, toJSON: () => ({})
  }))
  await userEvent.click(trigger)
  const menu = screen.getByRole('menu', { name: '项目操作' })
  expect(menu.parentElement).toBe(document.body)
  triggerTop = 200
  window.dispatchEvent(new Event('scroll'))
  await waitFor(() => expect(menu.style.top).toBe('234px'))
})

test('底部空间不足时项目操作菜单向上展开', () => {
  expect(getMenuPosition(
    { top: 700, bottom: 730, right: 1000 },
    { width: 176, height: 260 },
    { width: 1200, height: 800 }
  )).toEqual({ top: 436, right: 200 })
})

test('侧边栏主要导航使用中文', () => {
  window.api = { getData: vi.fn() } as unknown as typeof window.api
  render(<MemoryRouter><Sidebar /></MemoryRouter>)
  expect(screen.getByText('项目组合')).toBeTruthy()
  expect(screen.getByText('生命周期方法')).toBeTruthy()
  expect(screen.getByText('设置')).toBeTruthy()
  expect(screen.getByText('证据胜于观点')).toBeTruthy()
})

test('侧边栏可同时展示多个项目，拖动时自动折叠当前项目', async () => {
  const stages = Array.from({ length: 8 }, (_, index) => ({
    id: `stage-${index + 1}`, name: `阶段 ${index + 1}`, short: '', order: index + 1,
    introduction: '', objective: '', keyQuestion: '', methodology: [], todos: [], steps: [],
    deliverables: [], exitCriteria: [], minEvidence: 0, status: index === 0 ? 'active' : 'locked'
  })) as Project['workflowSnapshot']['stages']
  const another = { ...project, id: 'prj-two', name: '第二个项目', workflowSnapshot: { ...project.workflowSnapshot, stages } }
  const first = { ...project, workflowSnapshot: { ...project.workflowSnapshot, stages } }
  useApp.setState({ data: { ...emptyData, projects: [first, another] } })
  useSidebarWorkspace.setState({ version: 2, projectIds: [first.id, another.id], expandedProjectIds: [first.id, another.id], recentProjectIds: [] })
  window.api = { getData: vi.fn() } as unknown as typeof window.api
  render(<MemoryRouter initialEntries={[`/project/${first.id}`]}><Sidebar /></MemoryRouter>)

  expect(screen.getByText('测试项目')).toBeTruthy()
  expect(screen.getByText('第二个项目')).toBeTruthy()
  expect(screen.getByText('已打开项目 · 2')).toBeTruthy()
  expect(screen.getAllByText('1. 阶段 1')).toHaveLength(2)
  await userEvent.click(screen.getByRole('button', { name: '全部折叠' }))
  expect(useSidebarWorkspace.getState().expandedProjectIds).toEqual([])
  useSidebarWorkspace.getState().toggleExpanded(first.id)
  expect(useSidebarWorkspace.getState().expandedProjectIds).toContain(first.id)
  const projectRow = screen.getByText('测试项目').closest('[draggable="true"]') as HTMLElement
  fireEvent.dragStart(projectRow, { dataTransfer: { effectAllowed: '', setData: vi.fn() } })
  await waitFor(() => expect(useSidebarWorkspace.getState().expandedProjectIds).not.toContain(first.id))
  useSidebarWorkspace.getState().moveProject(first.id, another.id)
  expect(useSidebarWorkspace.getState().projectIds).toEqual([another.id, first.id])
})

test('右键移除只改变侧边栏工作区，不删除项目数据', async () => {
  useApp.setState({ data: { ...emptyData, projects: [project] } })
  useSidebarWorkspace.setState({ version: 2, projectIds: [project.id], expandedProjectIds: [project.id], recentProjectIds: [] })
  window.api = { getData: vi.fn() } as unknown as typeof window.api
  render(<MemoryRouter initialEntries={[`/project/${project.id}`]}><Sidebar /></MemoryRouter>)
  await userEvent.pointer({ target: screen.getByText('测试项目'), keys: '[MouseRight]' })
  await userEvent.click(screen.getByRole('menuitem', { name: '从侧边栏移除' }))
  expect(useSidebarWorkspace.getState().projectIds).not.toContain(project.id)
  expect(useApp.getState().data?.projects).toContainEqual(project)
  useApp.setState({ data: { ...emptyData, projects: [{ ...project }] } })
  await waitFor(() => expect(useSidebarWorkspace.getState().projectIds).not.toContain(project.id))
})

test('项目菜单支持键盘打开、自动聚焦，并在滚动时关闭', async () => {
  useApp.setState({ data: { ...emptyData, projects: [project] } })
  useSidebarWorkspace.setState({ version: 2, projectIds: [project.id], expandedProjectIds: [], recentProjectIds: [] })
  window.api = { getData: vi.fn() } as unknown as typeof window.api
  render(<MemoryRouter initialEntries={[`/project/${project.id}`]}><Sidebar /></MemoryRouter>)
  const row = screen.getByLabelText('测试项目 项目菜单')
  row.focus()
  fireEvent.keyDown(row, { key: 'F10', shiftKey: true })
  const menu = await screen.findByRole('menu', { name: '项目侧边栏操作' })
  await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true))
  fireEvent.scroll(window)
  await waitFor(() => expect(screen.queryByRole('menu', { name: '项目侧边栏操作' })).toBeNull())
})

test('Playbook 检查项删除和重排时保留稳定 ID', () => {
  const previous = [
    { id: 'a', text: '第一项' },
    { id: 'b', text: '第二项' },
    { id: 'c', text: '第三项' }
  ]
  const next = reconcileChecklistItems(previous, ['第三项', '第二项'])
  expect(next.map((item) => item.id)).toEqual(['c', 'b'])
  expect(next.map((item) => item.text)).toEqual(['第三项', '第二项'])
})

test('主要页面标题使用中文优先术语', () => {
  const portfolio = render(<MemoryRouter><PortfolioPage /></MemoryRouter>)
  expect(screen.getByRole('heading', { name: '项目组合' })).toBeTruthy()
  portfolio.unmount()

  window.api = { getDataPath: vi.fn().mockResolvedValue(''), getVersions: vi.fn().mockResolvedValue({ app: '', electron: '', node: '' }) } as unknown as typeof window.api
  render(<MemoryRouter><SettingsPage /></MemoryRouter>)
  expect(screen.getByRole('heading', { name: '设置' })).toBeTruthy()
  expect(screen.getByText(/不会编造证据（Evidence）；这一约束已写入提示词/)).toBeTruthy()
})

test('执行步骤页标题使用中文优先术语', async () => {
  const stage = {
    id: 'stage-active', name: '验证阶段', short: '', order: 1, introduction: '', objective: '', keyQuestion: '', methodology: [],
    todos: [], steps: [{ id: 'step-one', name: '定义问题', goal: '', description: '', checklist: [], questions: [], answers: {}, status: 'todo' }],
    deliverables: [], exitCriteria: [], minEvidence: 0, status: 'active'
  } as Project['workflowSnapshot']['stages'][number]
  const stepProject = { ...project, currentStageId: stage.id, workflowSnapshot: { ...project.workflowSnapshot, stages: [stage] } }
  useApp.setState({ data: { ...emptyData, projects: [stepProject] } })
  render(<MemoryRouter initialEntries={[`/project/${project.id}/stage/${stage.id}/step/step-one`]}>
    <Routes><Route path="/project/:projectId/stage/:stageId/step/:stepId" element={<StepPage />} /></Routes>
  </MemoryRouter>)

  expect(await screen.findByRole('heading', { name: '执行步骤（Steps）1 定义问题' })).toBeTruthy()
  expect(screen.getByText('暂无本阶段证据（Evidence）。这一步发现的任何真实事实，都值得记录下来。')).toBeTruthy()
  expect(screen.getByText('暂无本阶段资料（Artifacts）。访谈记录、竞品截图、数据表格都可保存并自动解析。')).toBeTruthy()
})

test('证据与资料弹窗说明、成果弹窗空状态使用中文优先术语', () => {
  const stage = {
    id: 'stage-copy', name: '验证阶段', short: '', order: 1, introduction: '', objective: '', keyQuestion: '', methodology: [],
    todos: [], steps: [], deliverables: [{ id: 'deliverable-copy', name: '阶段成果', description: '', required: true, artifactIds: [] }],
    exitCriteria: [], minEvidence: 0, status: 'active'
  } as Project['workflowSnapshot']['stages'][number]
  const claim = { id: 'claim-copy', projectId: project.id, stageId: stage.id, statement: '用户愿意付费', createdAt: '' }

  const evidenceModal = render(<MemoryRouter><EvidenceModal open onClose={vi.fn()} project={project} stage={stage} claims={[claim]} onAdded={vi.fn()} /></MemoryRouter>)
  expect(screen.getByText('此证据（Evidence）支持哪些假设（Claims）')).toBeTruthy()
  evidenceModal.unmount()

  const artifactModal = render(<MemoryRouter><ArtifactModal open onClose={vi.fn()} project={project} stage={stage} onAdded={vi.fn()} /></MemoryRouter>)
  expect(screen.getByRole('dialog', { name: '添加资料（Artifacts）' })).toBeTruthy()
  expect(screen.getByPlaceholderText('这份资料（Artifacts）说明了什么？')).toBeTruthy()
  artifactModal.unmount()

  render(<MemoryRouter><DeliverableModal open onClose={vi.fn()} project={project} stage={stage} deliverableId="deliverable-copy" artifacts={[]} onSaved={vi.fn()} /></MemoryRouter>)
  expect(screen.getByText('本阶段还没有资料（Artifacts），可先在「资料（Artifacts）」区添加')).toBeTruthy()
})

test('导出弹窗分别传递直接导出和 AI 总结导出选项', async () => {
  const user = userEvent.setup()
  const reportExport = vi.fn().mockResolvedValue({ canceled: false, path: 'C:/reports/test.html' })
  useApp.setState({ data: {
    ...emptyData,
    settings: { ai: { baseUrl: 'https://api.example.com/v1', apiKey: 'key', model: 'model' } },
    projects: [project]
  } })
  window.api = { reportExport } as unknown as typeof window.api
  render(<MemoryRouter initialEntries={[`/project/${project.id}`]}>
    <Routes><Route path="/project/:projectId" element={<PipelinePage />} /></Routes>
  </MemoryRouter>)

  await user.click(screen.getByRole('button', { name: '导出报告' }))
  await user.click(screen.getByRole('button', { name: '直接导出' }))
  await waitFor(() => expect(reportExport).toHaveBeenLastCalledWith({ projectId: project.id, withAiSummary: false }))

  await user.click(screen.getByRole('button', { name: '导出报告' }))
  await user.click(screen.getByRole('button', { name: 'AI 总结并导出' }))
  await waitFor(() => expect(reportExport).toHaveBeenLastCalledWith({ projectId: project.id, withAiSummary: true }))
})

test('未完成设置时仅禁用 AI 总结导出', async () => {
  const user = userEvent.setup()
  useApp.setState({ data: { ...emptyData, projects: [project] } })
  const reportExport = vi.fn().mockResolvedValue({ canceled: false, path: 'C:/reports/test.html' })
  window.api = { reportExport } as unknown as typeof window.api
  render(<MemoryRouter initialEntries={[`/project/${project.id}`]}>
    <Routes><Route path="/project/:projectId" element={<PipelinePage />} /></Routes>
  </MemoryRouter>)

  await user.click(screen.getByRole('button', { name: '导出报告' }))
  expect((screen.getByRole('button', { name: '直接导出' }) as HTMLButtonElement).disabled).toBe(false)
  expect((screen.getByRole('button', { name: 'AI 总结并导出' }) as HTMLButtonElement).disabled).toBe(true)
  await user.click(screen.getByRole('button', { name: '直接导出' }))
  await waitFor(() => expect(reportExport).toHaveBeenCalledWith({ projectId: project.id, withAiSummary: false }))
})

test('共享 Button 保持单行并且 Claims 新增行在窄屏可堆叠', () => {
  const { container } = render(<><Button>添加</Button><ClaimInlineAdd projectId="prj-new" stageId="stage-new" onAdded={vi.fn()} /></>)
  const button = screen.getAllByRole('button', { name: '添加' })[0]
  expect(button.className).toContain('whitespace-nowrap')
  expect(button.className).toContain('shrink-0')
  expect(button.className).toContain('leading-none')
  const input = screen.getByPlaceholderText('提出一个可被证据（Evidence）支持或证伪的假设（Claims），例如：小时工愿意持续记录每天工时')
  expect(input.className).toContain('min-w-0')
  expect(input.parentElement?.className).toContain('flex-col')
  expect(input.parentElement?.className).toContain('sm:flex-row')
  expect(container.querySelector('button:last-child')?.className).toContain('whitespace-nowrap')
})

function ModalFocusHarness() {
  const [open, setOpen] = useState(false)
  return <>
    <button onClick={() => setOpen(true)}>打开测试对话框</button>
    <Modal open={open} onClose={() => setOpen(false)} title="测试对话框" footer={<button>保存</button>}>
      <input aria-label="对话框输入" />
    </Modal>
  </>
}

test('Modal 在页面顶层提供语义、焦点循环、Escape 关闭并恢复触发焦点', async () => {
  const user = userEvent.setup()
  render(<ModalFocusHarness />)
  const trigger = screen.getByRole('button', { name: '打开测试对话框' })
  await user.click(trigger)

  const dialog = await screen.findByRole('dialog', { name: '测试对话框' })
  expect(dialog.getAttribute('aria-modal')).toBe('true')
  expect(dialog.parentElement?.parentElement).toBe(document.body)
  const close = screen.getByRole('button', { name: '关闭对话框' })
  await waitFor(() => expect(document.activeElement).toBe(close))

  const save = screen.getByRole('button', { name: '保存' })
  fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
  expect(document.activeElement).toBe(save)
  fireEvent.keyDown(save, { key: 'Tab' })
  expect(document.activeElement).toBe(close)

  fireEvent.keyDown(close, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(document.activeElement).toBe(trigger)
})

test('ToastHost 使用礼貌且原子化的状态播报区，并且高于 Modal', () => {
  useApp.setState({ ...useApp.getState(), toasts: [{ id: 1, msg: '已保存', kind: 'ok' }] })
  render(<><ToastHost /><Modal open onClose={vi.fn()} title="层级测试"><input aria-label="层级输入" /></Modal></>)
  const host = screen.getByText('已保存').parentElement
  expect(host?.getAttribute('aria-live')).toBe('polite')
  expect(host?.getAttribute('aria-atomic')).toBe('true')
  const toastLayer = Number(host?.className.match(/z-\[(\d+)\]/)?.[1])
  const modalLayer = Number(screen.getByRole('dialog', { name: '层级测试' }).parentElement?.className.match(/z-\[(\d+)\]/)?.[1])
  expect(toastLayer).toBeGreaterThan(modalLayer)
})

test('阶段说明、空状态和删除控件使用中文优先的假设与证据术语', () => {
  const stage = {
    id: 'stage-locked', name: '锁定阶段', short: '', order: 1, introduction: '', objective: '', keyQuestion: '', methodology: [],
    todos: [], steps: [], deliverables: [], exitCriteria: [], minEvidence: 0, status: 'locked'
  } as Project['workflowSnapshot']['stages'][number]
  const lockedProject = { ...project, currentStageId: stage.id, workflowSnapshot: { ...project.workflowSnapshot, stages: [stage] } }
  useApp.setState({ data: {
    ...emptyData,
    projects: [lockedProject],
    claims: [{ id: 'claim-1', projectId: project.id, stageId: stage.id, statement: '用户会使用', createdAt: '' }],
    evidences: [{ id: 'evidence-1', projectId: project.id, stageId: stage.id, title: '访谈', type: '用户访谈', content: '用户说会使用', strength: '中', relatedClaimIds: [], createdAt: '' }]
  }, loading: false, toasts: [], portfolioView: 'list' })
  render(<MemoryRouter initialEntries={[`/project/${project.id}/stage/${stage.id}`]}>
    <Routes><Route path="/project/:projectId/stage/:stageId" element={<StagePage />} /></Routes>
  </MemoryRouter>)
  expect(screen.getByText('当前阶段尚未解锁，完成上一阶段决策后可操作')).toBeTruthy()
  expect(screen.getByText('执行步骤（Steps，0/0）')).toBeTruthy()
  expect(screen.getByText('假设（Claims，1）')).toBeTruthy()
  expect(screen.getByText('证据（Evidence，1）')).toBeTruthy()
  expect(screen.getByText('本阶段提出、等待证据（Evidence）检验的假设（Claims）')).toBeTruthy()
  expect(screen.getByText('证据（Evidence）来自真实世界。行为 > 表态；AI 会检查证据（Evidence）的成色')).toBeTruthy()
  expect(screen.getByText('尚未审查。建议在提交成果后运行，AI 会找出未验证的假设（Claims）与证据（Evidence）缺口。')).toBeTruthy()
  expect(screen.getByText('尚无证据（Evidence）关联')).toBeTruthy()
  const claimDelete = screen.getByRole('button', { name: '删除假设（Claims）' })
  const evidenceDelete = screen.getByRole('button', { name: '删除证据（Evidence）' })
  expect(claimDelete.className).toContain('opacity-50')
  expect(claimDelete.className).toContain('hover:text-bad')
  expect(evidenceDelete.className).toContain('opacity-50')
  expect(evidenceDelete.className).toContain('focus:text-bad')
})

test('阶段没有假设或证据时空状态保留中文优先术语', () => {
  const stage = {
    id: 'stage-empty', name: '待验证阶段', short: '', order: 1, introduction: '', objective: '', keyQuestion: '', methodology: [],
    todos: [], steps: [], deliverables: [], exitCriteria: [], minEvidence: 0, status: 'active'
  } as Project['workflowSnapshot']['stages'][number]
  const emptyProject = { ...project, currentStageId: stage.id, workflowSnapshot: { ...project.workflowSnapshot, stages: [stage] } }
  useApp.setState({ data: { ...emptyData, projects: [emptyProject] } })
  render(<MemoryRouter initialEntries={[`/project/${project.id}/stage/${stage.id}`]}>
    <Routes><Route path="/project/:projectId/stage/:stageId" element={<StagePage />} /></Routes>
  </MemoryRouter>)

  expect(screen.getByText('还没有假设（Claims）。写下你当前最想验证的假设（Claims），AI 审查时会逐条检查证据（Evidence）支持度。')).toBeTruthy()
  expect(screen.getByText('暂无证据（Evidence）—— 去和真实用户聊聊，把发生的事实记下来')).toBeTruthy()
})
