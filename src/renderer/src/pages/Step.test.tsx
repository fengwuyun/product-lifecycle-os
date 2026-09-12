import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
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

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
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
  const firstSave = deferred()
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
  const oldSave = deferred()
  vi.mocked(window.api.stepSave).mockImplementationOnce(() => oldSave.promise)
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
  await Promise.resolve()
  expect(screen.queryByRole('status')).toBeNull()
})
