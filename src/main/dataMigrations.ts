import type { AppData, ProjectChecklistItem } from '../shared/types'

export const DATA_VERSION = 3

const DEFAULT_PLAYBOOK_QUESTIONS = [
  { stepId: 'op_s2', question: { id: 'q120', q: '用一句话描述这个产品机会：为谁、在什么场景、解决什么问题？' } },
  { stepId: 'op_s3', question: { id: 'q130', q: '用户真正需要解决的核心问题是什么？' } }
] as const

type LegacyChecklistItem = ProjectChecklistItem & {
  responseRequired?: boolean
  responsePrompt?: string
  response?: string
}

type LegacyChecklistDefinition = {
  id: string
  text: string
  responseRequired?: boolean
  responsePrompt?: string
}

export function migrateData(input: AppData): { data: AppData; changed: boolean } {
  let changed = input.meta.version < DATA_VERSION

  for (const playbook of input.playbooks) {
    for (const stage of playbook.stages) {
      for (const step of stage.steps) {
        const checklist = step.checklist as LegacyChecklistDefinition[]
        step.checklist = checklist.map((item) => {
          if ('responseRequired' in item || 'responsePrompt' in item) changed = true
          return { id: item.id, text: item.text }
        })
      }
    }

    // 已持久化的默认 Playbook 不会在启动时重新 seed；只补其缺失的默认问题，
    // 不触碰用户编辑过的问题、更不修改既有项目的 workflowSnapshot。
    if (playbook.id === 'pb_default') {
      for (const { stepId, question } of DEFAULT_PLAYBOOK_QUESTIONS) {
        const step = playbook.stages.flatMap((stage) => stage.steps).find((candidate) => candidate.id === stepId)
        if (step && !step.questions.some((candidate) => candidate.id === question.id)) {
          step.questions.push({ ...question })
          changed = true
        }
      }
    }
  }

  for (const project of input.projects) {
    for (const stage of project.workflowSnapshot.stages) {
      for (const step of stage.steps) {
        const checklist = step.checklist as LegacyChecklistItem[]
        step.checklist = checklist.map((item) => {
          const answerId = `legacy_question_${item.id}`
          if (item.response?.trim() && !Object.hasOwn(step.answers, answerId)) {
            step.questions.push({ id: answerId, q: item.responsePrompt || item.text })
            step.answers[answerId] = item.response
            changed = true
          }
          if ('responseRequired' in item || 'responsePrompt' in item || 'response' in item) changed = true
          return { id: item.id, text: item.text, done: item.done }
        })
      }
    }
  }

  if (input.meta.version !== DATA_VERSION) input.meta.version = DATA_VERSION
  return { data: input, changed }
}
