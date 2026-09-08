import type { AppData } from '../shared/types'
import { enrichChecklistDefinition, enrichProjectChecklistItem } from '../shared/checklistResponses'

export const DATA_VERSION = 2

export function migrateData(input: AppData): { data: AppData; changed: boolean } {
  let changed = input.meta.version < DATA_VERSION

  for (const playbook of input.playbooks) {
    for (const stage of playbook.stages) {
      for (const step of stage.steps) {
        step.checklist = step.checklist.map((item) => {
          const next = enrichChecklistDefinition(item)
          if (next !== item) changed = true
          return next
        })
      }
    }
  }

  for (const project of input.projects) {
    for (const stage of project.workflowSnapshot.stages) {
      for (const step of stage.steps) {
        step.checklist = step.checklist.map((item) => {
          const next = enrichProjectChecklistItem(item)
          if (
            next.responseRequired !== item.responseRequired ||
            next.responsePrompt !== item.responsePrompt ||
            next.response !== item.response
          ) changed = true
          return next
        })
      }
    }
  }

  if (input.meta.version !== DATA_VERSION) input.meta.version = DATA_VERSION
  return { data: input, changed }
}
