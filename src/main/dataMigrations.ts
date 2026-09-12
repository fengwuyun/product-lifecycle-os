import type { AppData, ProjectChecklistItem } from '../shared/types'

export const DATA_VERSION = 3

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
