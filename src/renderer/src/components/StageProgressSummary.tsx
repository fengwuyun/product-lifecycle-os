import type { Evidence, Project, ProjectStage } from '@shared/types'
import { stageGate } from '../store/app'

export interface StageProgressMetric {
  label: string
  done: number
  total: number
  complete: boolean
  gap: string
}

export interface StageProgressSummaryData {
  metrics: StageProgressMetric[]
  nextGap: string | null
  ready: boolean
}

/**
 * Produces the compact navigation status for a stage. The four gate metrics
 * intentionally come from `stageGate` so their counts follow decision rules.
 */
export function getStageProgressSummary(
  project: Project,
  stage: ProjectStage,
  evidences: Evidence[]
): StageProgressSummaryData {
  const gate = stageGate(project, stage, evidences)
  const stepsDone = stage.steps.filter((step) => step.status === 'done').length
  const metrics: StageProgressMetric[] = [
    {
      label: '执行步骤（Steps）',
      done: stepsDone,
      total: stage.steps.length,
      complete: stepsDone === stage.steps.length,
      gap: `执行步骤未完成（${stepsDone}/${stage.steps.length}）`
    },
    {
      label: '阶段 Todo',
      done: gate.todosDone,
      total: gate.todosTotal,
      complete: gate.todosDone === gate.todosTotal,
      gap: `Todo 未完成（${gate.todosDone}/${gate.todosTotal}）`
    },
    {
      label: '必需成果',
      done: gate.deliverablesDone,
      total: gate.deliverablesRequired,
      complete: gate.deliverablesDone === gate.deliverablesRequired,
      gap: `必要成果未提交（${gate.deliverablesDone}/${gate.deliverablesRequired}）`
    },
    {
      label: '证据（Evidence）',
      done: gate.evidenceCount,
      total: gate.evidenceRequired,
      complete: gate.evidenceCount >= gate.evidenceRequired,
      gap: `证据不足（${gate.evidenceCount}/${gate.evidenceRequired}）`
    },
    {
      label: '退出条件',
      done: gate.criteriaMet,
      total: gate.criteriaTotal,
      complete: gate.criteriaMet === gate.criteriaTotal,
      gap: `退出条件未满足（${gate.criteriaMet}/${gate.criteriaTotal}）`
    }
  ]
  const nextGap = metrics.find((metric) => !metric.complete)?.gap ?? null

  return { metrics, nextGap, ready: nextGap === null }
}

export function StageProgressSummary({ project, stage, evidences }: {
  project: Project
  stage: ProjectStage
  evidences: Evidence[]
}) {
  const { metrics, nextGap, ready } = getStageProgressSummary(project, stage, evidences)

  return (
    <section aria-labelledby="stage-progress-summary-title" className="mb-4 rounded-[12px] border border-line bg-white px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 id="stage-progress-summary-title" className="text-[13.5px] font-bold text-ink-2">阶段进度</h2>
        <p aria-live="polite" className={`text-[12px] font-medium ${ready ? 'text-ok' : 'text-ink-3'}`}>
          {ready ? '已满足阶段决策条件' : `下一项：${nextGap}`}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
        {metrics.map((metric) => {
          const percentage = metric.total === 0 ? 100 : Math.min(100, (metric.done / metric.total) * 100)
          const ariaValueMax = metric.total || 1
          const ariaValueNow = metric.total === 0 ? 0 : Math.min(metric.done, metric.total)
          const ariaValueText = metric.total === 0 ? `无需完成（${metric.done}/${metric.total}）` : `${metric.done}/${metric.total}`
          return (
            <div key={metric.label} className="min-w-0">
              <div className="flex items-center justify-between gap-2 text-[11.5px] text-ink-3">
                <span className="truncate">{metric.label}</span>
                <span className={metric.complete ? 'font-semibold text-ok tabular-nums' : 'font-medium text-ink-2 tabular-nums'}>{metric.done}/{metric.total}</span>
              </div>
              <div
                role="progressbar"
                aria-label={`${metric.label}：${metric.done}/${metric.total}`}
                aria-valuemin={0}
                aria-valuemax={ariaValueMax}
                aria-valuenow={ariaValueNow}
                aria-valuetext={ariaValueText}
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line"
              >
                <div className={`h-full rounded-full transition-[width] ${metric.complete ? 'bg-ok' : 'bg-primary'}`} style={{ width: `${percentage}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
