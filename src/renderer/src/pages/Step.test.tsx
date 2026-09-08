import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import type { AppData } from '@shared/types'
import { useApp } from '../store/app'
import { StepPage } from './Step'

const data = {
  meta: { version: 2, createdAt: '' }, settings: { ai: { baseUrl: '', apiKey: '', model: '' } }, playbooks: [],
  projects: [{
    id: 'project', name: '项目', description: '', priority: 'P1', status: 'active', playbookId: 'pb', playbookVersion: 1,
    workflowSnapshot: { playbookId: 'pb', playbookVersion: 1, stages: [{
      id: 'stage', name: '机会定义', short: '', order: 1, introduction: '', objective: '', keyQuestion: '', methodology: [], todos: [],
      steps: [{ id: 'step', name: '定义问题', goal: '', description: '', checklist: [{ id: 'c131', text: '描述核心问题', done: false, responseRequired: true, responsePrompt: '写清核心问题', response: '' }], questions: [{ id: 'q1', q: '问题背景是什么？' }], answers: {}, status: 'todo' }],
      deliverables: [], exitCriteria: [], minEvidence: 0, status: 'active'
    }] }, currentStageId: 'stage', currentStepId: 'step', createdAt: '', updatedAt: '', lastActiveAt: ''
  }], claims: [], evidences: [], artifacts: [], decisions: [], aiReviews: []
} as AppData

beforeEach(() => {
  useApp.setState({ data, loading: false, toasts: [] })
  window.api = { stepSave: vi.fn(), stepComplete: vi.fn(), getData: vi.fn().mockResolvedValue(data) } as unknown as typeof window.api
})

test('快速跨字段编辑时保存最新的检查项说明和问题回答', async () => {
  render(<MemoryRouter initialEntries={['/project/project/stage/stage/step/step']}><Routes><Route path="/project/:projectId/stage/:stageId/step/:stepId" element={<StepPage />} /></Routes></MemoryRouter>)
  await userEvent.click(await screen.findByText('填写完成说明'))
  fireEvent.change(screen.getByPlaceholderText('填写实际完成结果、判断依据或可追溯的记录……'), { target: { value: '核心问题说明' } })
  fireEvent.change(screen.getByPlaceholderText('基于真实观察回答，不要臆测……'), { target: { value: '真实背景' } })
  await waitFor(() => expect(window.api.stepSave).toHaveBeenCalled(), { timeout: 1000 })
  const payload = vi.mocked(window.api.stepSave).mock.calls.at(-1)?.[0]
  expect(payload?.patch.checklist?.[0].response).toBe('核心问题说明')
  expect(payload?.patch.answers?.q1).toBe('真实背景')
})

test('必答检查项先展开完成说明，空内容不能直接勾选', async () => {
  render(<MemoryRouter initialEntries={['/project/project/stage/stage/step/step']}><Routes><Route path="/project/:projectId/stage/:stageId/step/:stepId" element={<StepPage />} /></Routes></MemoryRouter>)
  const check = await screen.findByRole('button', { name: '完成 描述核心问题' })
  await userEvent.click(check)
  expect(screen.getByText('写清核心问题')).toBeTruthy()
  expect(screen.getByPlaceholderText('填写实际完成结果、判断依据或可追溯的记录……')).toBeTruthy()
  expect(window.api.stepSave).not.toHaveBeenCalled()
  expect(useApp.getState().toasts.at(-1)?.msg).toContain('先填写完成说明')
})
