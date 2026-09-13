import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import type { Api } from '@shared/types'
import { SettingsPage } from './Settings'

const state = vi.hoisted(() => ({
  data: { settings: { ai: { baseUrl: '', apiKey: '', model: '' } } },
  load: vi.fn(), toast: vi.fn()
}))
vi.mock('../store/app', () => ({ useApp: () => state }))

beforeEach(() => {
  vi.clearAllMocks()
  state.load.mockResolvedValue(undefined)
  window.api = {
    getDataPath: vi.fn().mockResolvedValue('C:\\test\\data'),
    getVersions: vi.fn().mockResolvedValue({ app: '1', electron: '1', node: '1' }),
    backupCreate: vi.fn().mockResolvedValue({ canceled: true }),
    backupRestore: vi.fn().mockResolvedValue({ canceled: true })
  } as unknown as Api
})

test('explains sensitive backup contents and disables conflicting controls while creating a backup', async () => {
  let finish!: (value: object) => void
  vi.mocked(window.api.backupCreate).mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
  render(<SettingsPage />)
  expect(screen.getByText(/可能包含 API Key/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '创建完整备份' }))
  await waitFor(() => expect((screen.getByRole('button', { name: '从备份恢复' }) as HTMLButtonElement).disabled).toBe(true))
  expect((screen.getByRole('button', { name: '清空全部数据' }) as HTMLButtonElement).disabled).toBe(true)
  await act(async () => finish({ path: 'C:\\backup\\timestamp' }))
  expect(screen.getByText('完整备份位置：C:\\backup\\timestamp')).toBeTruthy()
  expect(state.toast).toHaveBeenCalledWith('完整备份已创建', 'ok')
})

test('requires restore confirmation, displays safety path and reloads application data after success', async () => {
  vi.mocked(window.api.backupRestore).mockResolvedValueOnce({ restored: true, safetyBackupPath: 'C:\\safe\\before-restore' })
  render(<SettingsPage />)
  fireEvent.click(screen.getByRole('button', { name: '从备份恢复' }))
  expect(screen.getByRole('dialog', { name: '从备份恢复？' })).toBeTruthy()
  expect(window.api.backupRestore).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '选择备份并恢复' }))
  await waitFor(() => expect(state.load).toHaveBeenCalledOnce())
  expect(screen.getByText('恢复前的安全备份位置：C:\\safe\\before-restore')).toBeTruthy()
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(state.toast).toHaveBeenCalledWith('备份已恢复，恢复前的数据已另存为安全备份', 'ok')
})

test('canceled backup and restore do not display success or reload data', async () => {
  render(<SettingsPage />)
  fireEvent.click(screen.getByRole('button', { name: '创建完整备份' }))
  await waitFor(() => expect((screen.getByRole('button', { name: '从备份恢复' }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: '从备份恢复' }))
  fireEvent.click(screen.getByRole('button', { name: '选择备份并恢复' }))
  await waitFor(() => expect((screen.getByRole('button', { name: '选择备份并恢复' }) as HTMLButtonElement).disabled).toBe(false))
  expect(state.load).not.toHaveBeenCalled()
  expect(state.toast).not.toHaveBeenCalled()
})

test('failed restore retains the confirmation and safety path without claiming success', async () => {
  vi.mocked(window.api.backupRestore).mockResolvedValueOnce({ error: '恢复失败，当前数据未替换', safetyBackupPath: 'C:\\safe' })
  render(<SettingsPage />)
  fireEvent.click(screen.getByRole('button', { name: '从备份恢复' }))
  fireEvent.click(screen.getByRole('button', { name: '选择备份并恢复' }))
  await waitFor(() => expect(state.toast).toHaveBeenCalledWith('恢复失败，当前数据未替换', 'bad'))
  expect(state.load).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(screen.getByText('恢复前的安全备份位置：C:\\safe')).toBeTruthy()
})
