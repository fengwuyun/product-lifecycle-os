import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import { ToastHost } from '../App'
import { CreateProjectModal, ClaimInlineAdd } from './modals'
import { Sidebar } from './Sidebar'
import { Button, Modal } from './ui'
import { getMenuPosition, PortfolioPage } from '../pages/Portfolio'
import { StagePage } from '../pages/Stage'
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
  useSidebarWorkspace.setState({ version: 1, projectIds: [], expandedProjectIds: [] })
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
  useSidebarWorkspace.setState({ version: 1, projectIds: [first.id, another.id], expandedProjectIds: [first.id, another.id] })
  window.api = { getData: vi.fn() } as unknown as typeof window.api
  render(<MemoryRouter initialEntries={[`/project/${first.id}`]}><Sidebar /></MemoryRouter>)

  expect(screen.getByText('测试项目')).toBeTruthy()
  expect(screen.getByText('第二个项目')).toBeTruthy()
  expect(screen.getAllByText('1. 阶段 1')).toHaveLength(2)
  const projectRow = screen.getByText('测试项目').closest('[draggable="true"]') as HTMLElement
  fireEvent.dragStart(projectRow, { dataTransfer: { effectAllowed: '', setData: vi.fn() } })
  await waitFor(() => expect(useSidebarWorkspace.getState().expandedProjectIds).not.toContain(first.id))
  useSidebarWorkspace.getState().moveProject(first.id, another.id)
  expect(useSidebarWorkspace.getState().projectIds).toEqual([another.id, first.id])
})

test('右键移除只改变侧边栏工作区，不删除项目数据', async () => {
  useApp.setState({ data: { ...emptyData, projects: [project] } })
  useSidebarWorkspace.setState({ version: 1, projectIds: [project.id], expandedProjectIds: [project.id] })
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
  useSidebarWorkspace.setState({ version: 1, projectIds: [project.id], expandedProjectIds: [] })
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

test('共享 Button 保持单行并且 Claims 新增行在窄屏可堆叠', () => {
  const { container } = render(<><Button>添加</Button><ClaimInlineAdd projectId="prj-new" stageId="stage-new" onAdded={vi.fn()} /></>)
  const button = screen.getAllByRole('button', { name: '添加' })[0]
  expect(button.className).toContain('whitespace-nowrap')
  expect(button.className).toContain('shrink-0')
  expect(button.className).toContain('leading-none')
  const input = screen.getByPlaceholderText(/提出一个可被证据支持或证伪的假设/)
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

test('ToastHost 使用礼貌且原子化的状态播报区', () => {
  useApp.setState({ ...useApp.getState(), toasts: [{ id: 1, msg: '已保存', kind: 'ok' }] })
  render(<ToastHost />)
  const host = screen.getByText('已保存').parentElement
  expect(host?.getAttribute('aria-live')).toBe('polite')
  expect(host?.getAttribute('aria-atomic')).toBe('true')
})

test('锁定阶段说明原因，并为 Claim 和 Evidence 删除控件提供可见标签', () => {
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
  const claimDelete = screen.getByRole('button', { name: '删除 Claim' })
  const evidenceDelete = screen.getByRole('button', { name: '删除 Evidence' })
  expect(claimDelete.className).toContain('opacity-50')
  expect(claimDelete.className).toContain('hover:text-bad')
  expect(evidenceDelete.className).toContain('opacity-50')
  expect(evidenceDelete.className).toContain('focus:text-bad')
})
