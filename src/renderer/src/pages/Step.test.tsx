import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { AppData } from '@shared/types'
import { useApp } from '../store/app'
import { StepPage } from './Step'

const data = {
  meta: { version: 3, createdAt: '' }, settings: { ai: { baseUrl: '', apiKey: '', model: '' } }, playbooks: [],
  projects: [{
    id: 'project', name: '项目', description: '', priority: 'P1', status: 'active', playbookId: 'pb', playbookVersion: 1,
    workflowSnapshot: { playbookId: 'pb', playbookVersion: 1, stages: [{
      id: 'stage', name: '机会定义', short: '', order: 1, introduction: '', objective: '', keyQuestion: '', methodology: [], todos: [],
      steps: [
        { id: 'prev', name: '准备工作', goal: '', description: '', checklist: [], questions: [{ id: 'q110', q: '准备信息是什么？' }], answers: {}, status: 'todo' },
        { id: 'step', name: '定义问题', goal: '', description: '', checklist: [{ id: 'c131', text: '描述核心问题', done: false }], questions: [{ id: 'q120', q: '问题背景是什么？', hint: '说明发生的场景。' }, { id: 'q130', q: '当前流程是什么？' }], answers: {}, status: 'todo' },
        { id: 'next', name: '梳理方案', goal: '', description: '', checklist: [], questions: [], answers: {}, status: 'todo' }
      ],
      deliverables: [], exitCriteria: [], minEvidence: 0, status: 'active'
    }] }, currentStageId: 'stage', currentStepId: 'step', createdAt: '', updatedAt: '', lastActiveAt: ''
  }], claims: [], evidences: [], artifacts: [], decisions: [], aiReviews: []
} as AppData

beforeEach(() => {
  useApp.setState({ data, loading: false, toasts: [] })
  window.api = { stepSave: vi.fn(), stepComplete: vi.fn(), getData: vi.fn().mockResolvedValue(data) } as unknown as typeof window.api
})

afterEach(() => vi.useRealTimers())

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

test('问题位于 Checklist 卡片内，q120/q130 的回答通过 answers 保存并显示状态', async () => {
  render(<MemoryRouter initialEntries={['/project/project/stage/stage/step/step']}><Routes><Route path="/project/:projectId/stage/:stageId/step/:stepId" element={<StepPage />} /></Routes></MemoryRouter>)
  const checklistCard = await screen.findByTestId('checklist-card')
  expect(within(checklistCard).getByText('需要回答的问题')).toBeTruthy()
  expect(screen.queryByText('填写完成说明')).toBeNull()
  const answers = within(checklistCard).getAllByPlaceholderText('基于真实观察回答，不要臆测……')
  fireEvent.change(answers[0], { target: { value: '真实背景' } })
  fireEvent.change(answers[1], { target: { value: '当前流程' } })
  expect(screen.getByRole('status').textContent).toContain('保存中…')
  await waitFor(() => expect(window.api.stepSave).toHaveBeenCalled(), { timeout: 1000 })
  const payload = vi.mocked(window.api.stepSave).mock.calls.at(-1)?.[0]
  expect(payload?.patch.answers).toEqual({ q120: '真实背景', q130: '当前流程' })
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('已保存'))
})

test('切换检查项不要求回答，且上一步箭头没有旋转样式', async () => {
  render(<MemoryRouter initialEntries={['/project/project/stage/stage/step/step']}><Routes><Route path="/project/:projectId/stage/:stageId/step/:stepId" element={<StepPage />} /></Routes></MemoryRouter>)
  const check = await screen.findByRole('button', { name: '完成 描述核心问题' })
  await userEvent.click(check)
  await waitFor(() => expect(vi.mocked(window.api.stepSave).mock.calls.some(
    ([payload]) => payload.patch.checklist?.[0].done === true
  )).toBe(true), { timeout: 1000 })
  expect(useApp.getState().toasts).toHaveLength(0)
  const previousLink = screen.getByRole('link', { name: '上一步：准备工作' })
  expect(previousLink.querySelector('svg')?.classList.contains('rotate-180')).toBe(false)
  expect(screen.getByRole('link', { name: '下一步：梳理方案' })).toBeTruthy()
})

test('旧保存完成时不会覆盖同一 Step 的最新保存状态', async () => {
  const firstSave = deferred<void>()
  vi.mocked(window.api.stepSave).mockImplementationOnce(() => firstSave.promise).mockResolvedValue(undefined)
  render(<MemoryRouter initialEntries={['/project/project/stage/stage/step/step']}><Routes><Route path="/project/:projectId/stage/:stageId/step/:stepId" element={<StepPage />} /></Routes></MemoryRouter>)
  const answer = (await screen.findAllByPlaceholderText('基于真实观察回答，不要臆测……'))[0]
  vi.useFakeTimers()

  fireEvent.change(answer, { target: { value: '第一版' } })
  await vi.advanceTimersByTimeAsync(450)
  expect(window.api.stepSave).toHaveBeenCalledTimes(1)

  fireEvent.change(answer, { target: { value: '第二版' } })
  expect(screen.getByRole('status').textContent).toContain('保存中…')
  firstSave.resolve()
  await vi.advanceTimersByTimeAsync(0)
  expect(screen.getByRole('status').textContent).toContain('保存中…')

  await vi.advanceTimersByTimeAsync(450)
  expect(window.api.stepSave).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(0)
  expect(screen.getByRole('status').textContent).toContain('已保存')
})

test('切换 Step 后旧保存完成不会回写新 Step 的保存状态', async () => {
  const oldSave = deferred<void>()
  const oldLoad = deferred<AppData>()
  const reloadedData = { ...data, meta: { ...data.meta } } as AppData
  vi.mocked(window.api.stepSave).mockImplementationOnce(() => oldSave.promise)
  vi.mocked(window.api.getData).mockImplementationOnce(() => oldLoad.promise)
  render(<MemoryRouter initialEntries={['/project/project/stage/stage/step/step']}><Routes><Route path="/project/:projectId/stage/:stageId/step/:stepId" element={<StepPage />} /></Routes></MemoryRouter>)
  const answer = (await screen.findAllByPlaceholderText('基于真实观察回答，不要臆测……'))[0]
  vi.useFakeTimers()
  fireEvent.change(answer, { target: { value: '旧 Step 回答' } })
  await vi.advanceTimersByTimeAsync(450)
  expect(screen.getByRole('status').textContent).toContain('保存中…')

  fireEvent.click(screen.getByRole('link', { name: '上一步：准备工作' }))
  vi.useRealTimers()
  await screen.findByText('准备信息是什么？')
  expect(screen.queryByRole('status')).toBeNull()

  oldSave.resolve()
  await waitFor(() => expect(window.api.getData).toHaveBeenCalledTimes(1))
  oldLoad.resolve(reloadedData)
  await waitFor(() => {
    expect(useApp.getState().data).toBe(reloadedData)
    expect(screen.queryByRole('status')).toBeNull()
  })
})

test('跨项目复用 Step ID 时，草稿和状态按项目、阶段、Step 完整定位重新载入', async () => {
  const crossProjectData = structuredClone(data)
  const secondProject = structuredClone(crossProjectData.projects[0])
  secondProject.id = 'project-b'
  secondProject.name = '另一个项目'
  const secondStep = secondProject.workflowSnapshot.stages[0].steps[1]
  secondStep.answers = { q120: 'B 项目回答' }
  secondStep.status = 'done'
  crossProjectData.projects.push(secondProject)
  useApp.setState({ data: crossProjectData, loading: false, toasts: [] })

  render(<MemoryRouter initialEntries={['/project/project/stage/stage/step/step']}>
    <Link to="/project/project-b/stage/stage/step/step">前往另一个项目</Link>
    <Routes><Route path="/project/:projectId/stage/:stageId/step/:stepId" element={<StepPage />} /></Routes>
  </MemoryRouter>)

  await screen.findByText('问题背景是什么？')
  fireEvent.click(screen.getByRole('link', { name: '前往另一个项目' }))
  expect(await screen.findByDisplayValue('B 项目回答')).toBeTruthy()
  expect(screen.getByRole('button', { name: '重新打开' })).toBeTruthy()
})

test('输入后立即导航会将原 Step 的完整定位快照落盘', async () => {
  render(<MemoryRouter initialEntries={['/project/project/stage/stage/step/step']}><Routes><Route path="/project/:projectId/stage/:stageId/step/:stepId" element={<StepPage />} /></Routes></MemoryRouter>)
  const answer = (await screen.findAllByPlaceholderText('基于真实观察回答，不要臆测……'))[0]
  fireEvent.change(answer, { target: { value: '立即保存的回答' } })
  fireEvent.click(screen.getByRole('link', { name: '下一步：梳理方案' }))

  await waitFor(() => expect(window.api.stepSave).toHaveBeenCalledWith(expect.objectContaining({
    projectId: 'project', stageId: 'stage', stepId: 'step', patch: expect.objectContaining({ answers: { q120: '立即保存的回答' } })
  })))
})

test('重新打开后用已加载的状态同步当前 Step 草稿', async () => {
  const doneData = structuredClone(data)
  doneData.projects[0].workflowSnapshot.stages[0].steps[1].status = 'done'
  const reopenedData = structuredClone(doneData)
  reopenedData.projects[0].workflowSnapshot.stages[0].steps[1].status = 'todo'
  useApp.setState({ data: doneData, loading: false, toasts: [] })
  window.api = {
    stepSave: vi.fn().mockResolvedValue(undefined),
    stepComplete: vi.fn().mockResolvedValue(undefined),
    getData: vi.fn().mockResolvedValue(reopenedData)
  } as unknown as typeof window.api

  render(<MemoryRouter initialEntries={['/project/project/stage/stage/step/step']}><Routes><Route path="/project/:projectId/stage/:stageId/step/:stepId" element={<StepPage />} /></Routes></MemoryRouter>)
  await userEvent.click(await screen.findByRole('button', { name: '重新打开' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '完成执行步骤（Steps）' })).toBeTruthy())
})
