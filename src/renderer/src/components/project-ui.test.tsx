import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import { CreateProjectModal } from './modals'
import { Sidebar } from './Sidebar'
import { PortfolioPage } from '../pages/Portfolio'
import { useApp } from '../store/app'
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
  useApp.setState({ data: emptyData, loading: false, toasts: [], portfolioView: 'list' })
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
  await userEvent.click(screen.getByLabelText('打开项目操作菜单'))
  const menu = screen.getByRole('menu', { name: '项目操作' })
  expect(menu.parentElement).toBe(document.body)
})

test('侧边栏主要导航使用中文', () => {
  window.api = { getData: vi.fn() } as unknown as typeof window.api
  render(<MemoryRouter><Sidebar /></MemoryRouter>)
  expect(screen.getByText('项目组合')).toBeTruthy()
  expect(screen.getByText('生命周期方法')).toBeTruthy()
  expect(screen.getByText('设置')).toBeTruthy()
  expect(screen.getByText('证据胜于观点')).toBeTruthy()
})
