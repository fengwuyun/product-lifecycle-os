import type { AppData, PlaybookStageDef, ProjectChecklistItem, ProjectStage } from '../shared/types'
import { buildDefaultPlaybook } from './defaultPlaybook'

export const DATA_VERSION = 4

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

type QuestionStage = Pick<PlaybookStageDef | ProjectStage, 'steps'>

function syncDefaultQuestions(stages: QuestionStage[], canonicalStages: PlaybookStageDef[]): boolean {
  const canonicalSteps = new Map(canonicalStages.flatMap((stage) => stage.steps).map((step) => [step.id, step]))
  let changed = false

  for (const step of stages.flatMap((stage) => stage.steps)) {
    const canonical = canonicalSteps.get(step.id)
    if (!canonical) continue

    const existingById = new Map(step.questions.map((question) => [question.id, question]))
    const canonicalIds = new Set(canonical.questions.map((question) => question.id))
    const questions = [
      ...canonical.questions.map((question) => existingById.get(question.id) ?? { ...question }),
      ...step.questions.filter((question) => !canonicalIds.has(question.id))
    ]
    if (questions.length !== step.questions.length || questions.some((question, index) => question.id !== step.questions[index]?.id)) {
      step.questions = questions
      changed = true
    }
  }

  return changed
}

export function migrateData(input: AppData): { data: AppData; changed: boolean } {
  let changed = input.meta.version < DATA_VERSION
  const canonicalStages = buildDefaultPlaybook().stages

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

    if (syncDefaultQuestions(playbook.stages, canonicalStages)) changed = true
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
    if (syncDefaultQuestions(project.workflowSnapshot.stages, canonicalStages)) changed = true
  }

  if (input.meta.version !== DATA_VERSION) input.meta.version = DATA_VERSION
  return { data: input, changed }
}
