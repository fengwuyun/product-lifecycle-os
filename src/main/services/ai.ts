import type { AIReview, AIReviewStatus, AISummarySection, Evidence, Artifact } from '../../shared/types'
import { getDB, saveDB, id, nowISO } from '../store'
import { findProject, findStage } from './projects'
import { readImageBase64 } from './artifacts'

// ─── LLM 调用（OpenAI 兼容接口） ───

interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
interface ChatResult { content: string; reasoningContent: string; choiceCount: number }

async function requestChat(messages: ChatMessage[], opts?: { maxTokens?: number; temperature?: number }): Promise<ChatResult> {
  const { settings } = getDB()
  const { baseUrl, apiKey, model } = settings.ai
  if (!baseUrl || !apiKey || !model) {
    throw new Error('尚未配置 AI 服务：请在「设置」中填写 API 地址、Key 和模型名')
  }
  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 90_000)
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts?.temperature ?? 0.3,
        max_tokens: opts?.maxTokens ?? 3000,
        stream: false
      }),
      signal: controller.signal
    })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new Error(`AI 服务返回 ${resp.status}：${text.slice(0, 300)}`)
    }
    let json: { choices?: { message?: { content?: string; reasoning_content?: string } }[] }
    try {
      json = (await resp.json()) as typeof json
    } catch {
      throw new Error('AI 服务返回的不是有效 JSON')
    }
    if (!Array.isArray(json.choices) || json.choices.length === 0) throw new Error('AI 服务响应缺少 choices')
    return {
      content: json.choices[0]?.message?.content || '',
      reasoningContent: json.choices[0]?.message?.reasoning_content || '',
      choiceCount: json.choices.length
    }
  } finally {
    clearTimeout(timer)
  }
}

async function chat(messages: ChatMessage[], opts?: { maxTokens?: number; temperature?: number }): Promise<string> {
  const result = await requestChat(messages, opts)
  if (!result.content.trim()) throw new Error('AI 返回内容为空')
  return result.content
}

export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const r = await requestChat([{ role: 'user', content: '请只回复：OK' }], { maxTokens: 1024, temperature: 0 })
    const text = r.content.trim()
    return { ok: true, message: text ? `连接成功，模型返回：${text.slice(0, 50)}` : '连接成功，服务已响应但未返回文本' }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

function extractJSON<T>(raw: string): T {
  let text = raw.trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) text = fence[1].trim()
  const start = text.search(/[[{]/)
  if (start > 0) text = text.slice(start)
  try {
    return JSON.parse(text) as T
  } catch {
    // 宽松处理：截到最后一个完整括号
    const lastBrace = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'))
    if (lastBrace > 0) return JSON.parse(text.slice(0, lastBrace + 1)) as T
    throw new Error('AI 输出无法解析为结构化数据')
  }
}

// ─── 阶段上下文构建 ───

function truncate(s: string, n: number): string {
  if (!s) return ''
  return s.length > n ? s.slice(0, n) + '…[截断]' : s
}

function buildStageContext(projectId: string, stageId: string): string {
  const db = getDB()
  const project = findProject(projectId)
  const stage = findStage(project, stageId)
  const claims = db.claims.filter((c) => c.projectId === projectId && c.stageId === stageId)
  const evidences = db.evidences.filter((e) => e.projectId === projectId && e.stageId === stageId)
  const artifactsMeta = db.artifacts.filter((a) => a.projectId === projectId && a.stageId === stageId)
  const artifacts: Artifact[] = artifactsMeta.map((m) => db.artifacts.find((a) => a.id === m.id) as Artifact)

  const ctx: Record<string, unknown> = {
    项目: { 名称: project.name, 描述: project.description, 优先级: project.priority },
    阶段: {
      名称: stage.name,
      阶段介绍: stage.introduction,
      阶段目标: stage.objective,
      关键问题: stage.keyQuestion,
      方法论: stage.methodology,
      Todo: stage.todos.map((t) => `${t.done ? '[x]' : '[ ]'} ${t.text}`),
      退出条件: stage.exitCriteria.map((c) => `${c.met ? '[已满足]' : '[未满足]'} ${c.text}`),
      最低证据数要求: stage.minEvidence,
      当前证据数: evidences.length
    },
    Steps_执行记录: stage.steps.map((step) => ({
      名称: step.name,
      状态: step.status,
      检查项: step.checklist.map((item) => ({
        内容: item.text,
        已完成: item.done
      })),
      问题回答: step.questions.map((question) => ({
        问题: question.q,
        回答: step.answers[question.id]?.trim() || ''
      }))
    })),
    Claims_假设: claims.map((c) => ({ id: c.id, 内容: c.statement, 备注: c.note })),
    Evidence_证据: evidences.map((e) => ({
      id: e.id,
      标题: e.title,
      类型: e.type,
      强度: e.strength,
      内容: truncate(e.content, 800),
      关联Claim: e.relatedClaimIds,
      备注: e.notes
    })),
    Deliverables_成果: stage.deliverables.map((d) => ({
      名称: d.name,
      要求: d.required ? '必需' : '可选',
      已提交: !!d.content,
      内容: truncate(d.content || '', 1200)
    })),
    Artifacts_资料: artifacts.map((a) => ({
      id: a.id,
      标题: a.title,
      类型: a.ext || a.sourceType,
      备注: a.notes,
      正文摘要: truncate(a.extractedContent || (a.ext ? '(图片/无正文)' : '(无正文)'), 1200)
    }))
  }
  return JSON.stringify(ctx, null, 1)
}

const REVIEW_SYSTEM_PROMPT = `你是「Product Lifecycle OS」的阶段性审查 AI。你的职责是审查用户提交的阶段成果，识别风险，绝不替用户做决定。

【铁律 —— 违反任何一条即为无效输出】
1. 禁止自行创造用户数据或市场数据
2. 禁止自行制造 Evidence（证据只能来自用户提交的 Evidence/Deliverable/Artifact）
3. 禁止把行业常识当成这个项目的证据
4. 禁止替用户决定"继续/暂停/放弃"——这是用户的最终决策权
5. 所有判断必须尽可能关联具体对象；如果没有依据，必须写 Evidence: NONE 并标记为未验证
6. 区分"用户表态"与"真实行为"：口头说愿意用是极弱证据，实际付费/实际使用才是强证据

【输出要求】只输出一个 JSON 对象，不要输出其他文字：
{
  "status": "Ready | Ready with risks | Insufficient Evidence | Contradiction",
  "verified": [{ "text": "已确认的判断（✓ 开头语气）", "evidence": "依据的 Evidence 标题或 Deliverable 名称，没有依据写 NONE" }],
  "unverified": [{ "text": "尚未验证的假设（⚠ 语气）", "suggestion": "建议的验证动作" }],
  "gaps": [{ "claim": "证据不足的 Claim", "existing": "现有 Evidence 概况（没有写'无'）", "missing": "还缺什么样的证据" }],
  "logicIssues": ["逻辑漏洞描述，例如：'存在竞品'不能直接推出'细分定位成立'"],
  "nextStep": "下一步最低成本建议：只推荐当前阶段最值得补充的一个动作"
}

status 判定：Ready=证据充分且逻辑自洽；Ready with risks=可进入决策但有已识别风险；Insufficient Evidence=关键 Claim 证据不足；Contradiction=证据之间存在冲突或明显逻辑矛盾。`

export async function reviewStage(p: { projectId: string; stageId: string }): Promise<{ review?: AIReview; error?: string }> {
  try {
    const context = buildStageContext(p.projectId, p.stageId)
    const raw = await chat([
      { role: 'system', content: REVIEW_SYSTEM_PROMPT },
      { role: 'user', content: `请审查以下阶段成果：\n\n${context}` }
    ], { maxTokens: 3500, temperature: 0.2 })
    const parsed = extractJSON<{
      status: string
      verified: { text: string; evidence: string }[]
      unverified: { text: string; suggestion: string }[]
      gaps: { claim: string; existing: string; missing: string }[]
      logicIssues: string[]
      nextStep: string
    }>(raw)

    const valid: AIReviewStatus[] = ['Ready', 'Ready with risks', 'Insufficient Evidence', 'Contradiction']
    const status = (valid as string[]).includes(parsed.status) ? (parsed.status as AIReviewStatus) : 'Insufficient Evidence'

    const review: AIReview = {
      id: id('rev'),
      projectId: p.projectId,
      stageId: p.stageId,
      status,
      verified: (parsed.verified || []).slice(0, 12),
      unverified: (parsed.unverified || []).slice(0, 12),
      gaps: (parsed.gaps || []).slice(0, 10),
      logicIssues: (parsed.logicIssues || []).slice(0, 10),
      nextStep: parsed.nextStep || '',
      raw,
      createdAt: nowISO()
    }
    const db = getDB()
    db.aiReviews.push(review)
    saveDB()
    return { review }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Step AI 辅助 ───

export async function stepAssist(p: { projectId: string; stageId: string; stepId: string }): Promise<{ text?: string; error?: string }> {
  try {
    const project = findProject(p.projectId)
    const stage = findStage(project, p.stageId)
    const step = stage.steps.find((s) => s.id === p.stepId)
    if (!step) throw new Error('Step 不存在')
    const db = getDB()
    const stageEvidences = db.evidences.filter((e) => e.projectId === p.projectId && e.stageId === p.stageId)
    const context = [
      `项目：${project.name}（${project.description}）`,
      `当前阶段：${stage.name} —— 目标：${stage.objective}`,
      `当前 Step：${step.name}\n目标：${step.goal}\n说明：${step.description}`,
      `需要回答的问题：${step.questions.map((q) => q.q).join('；') || '（无）'}`,
      `已有 Checklist：${step.checklist.map((c) => `${c.done ? '[x]' : '[ ]'} ${c.text}`).join('；')}`,
      `本阶段已有证据：${stageEvidences.map((e) => `${e.title}（${e.strength}）`).join('；') || '暂无'}`,
      `用户已填写：${JSON.stringify(step.questions.map((question) => ({ 问题: question.q, 回答: step.answers[question.id]?.trim() || '' })), null, 1)}`
    ].join('\n\n')

    const raw = await chat([
      {
        role: 'system',
        content:
          '你是产品方法论的执行教练。帮助用户完成当前 Step：解释这个问题为什么重要、给出具体的回答思路和示例框架。禁止编造该项目的用户数据或证据；如需要用户提供信息，直接列出他需要去确认的事项。回答用简体中文，控制在 300 字内，结构清晰，不要空洞套话。'
      },
      { role: 'user', content: context }
    ], { maxTokens: 1200, temperature: 0.5 })
    return { text: raw.trim() }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── AI 项目总结 ───

const SUMMARY_SECTIONS = [
  '项目最初假设', '已验证内容', '尚未验证内容', '重要定位变化', '重要功能变化',
  '主要证据', '主要失败假设', '当前最大风险', '当前项目状态', '建议下一步'
] as const

export async function projectSummary(p: { projectId: string }): Promise<{ sections?: AISummarySection[]; error?: string }> {
  try {
    const db = getDB()
    const project = findProject(p.projectId)
    const stages = project.workflowSnapshot.stages
    const claims = db.claims.filter((c) => c.projectId === p.projectId)
    const evidences = db.evidences.filter((e) => e.projectId === p.projectId)
    const reviews = db.aiReviews.filter((r) => r.projectId === p.projectId)
    const decisions = db.decisions.filter((d) => d.projectId === p.projectId)
    const deliverables = stages.flatMap((s) => s.deliverables.filter((d) => d.content).map((d) => ({ stage: s.name, name: d.name, content: d.content as string })))

    const context = [
      `项目：${project.name} —— ${project.description}`,
      `状态：${project.status}，当前阶段：${stages.find((s) => s.id === project.currentStageId)?.name}`,
      '',
      '【各阶段执行情况】',
      ...stages.map((s) => {
        const gate = {
          todos: `${s.todos.filter((t) => t.done).length}/${s.todos.length}`,
          evidence: evidences.filter((e) => e.stageId === s.id).length,
          deliverables: s.deliverables.filter((d) => d.content).map((d) => d.name),
          status: s.status,
          decision: s.decision
        }
        return `${s.name}：${JSON.stringify(gate)}`
      }),
      '',
      '【全部 Deliverable 内容】',
      ...deliverables.map((d) => `《${d.stage}·${d.name}》\n${truncate(d.content, 1500)}`),
      '',
      '【Claims】',
      ...claims.map((c) => `- ${c.statement}`),
      '',
      '【Evidence】',
      ...evidences.map((e) => `- [${e.strength}] ${e.title}：${truncate(e.content, 300)}`),
      '',
      '【AI Reviews 摘要】',
      ...reviews.map((r) => `- ${r.stageId}: ${r.status}, 未验证 ${r.unverified.length} 项, 风险: ${r.logicIssues.join('；') || '无'}`),
      '',
      '【Decision Timeline】',
      ...decisions.map((d) => `- ${d.createdAt.slice(0, 10)} ${d.type} ${d.stageName || ''}：${d.reason}`)
    ].join('\n')

    const raw = await chat([
      {
        role: 'system',
        content:
          `你是产品复盘专家。基于项目全程数据撰写项目总结。必须覆盖以下 10 个小节，每个小节用 "## 小节名" 开头：\n${SUMMARY_SECTIONS.join('、')}\n\n规则：只引用项目中真实存在的证据，禁止编造数据；如果某项内容项目里没有，写"项目中未记录"。用简体中文，每节 2-5 句，务实、直接。`
      },
      { role: 'user', content: context }
    ], { maxTokens: 4000, temperature: 0.4 })

    // 解析 ## 分节
    const sections: AISummarySection[] = []
    const lines = raw.split('\n')
    let current: AISummarySection | null = null
    for (const line of lines) {
      const m = line.match(/^#{1,3}\s*(.+)$/)
      if (m) {
        if (current) sections.push(current)
        current = { title: m[1].trim().replace(/^[\d.、\s]+/, ''), content: '' }
      } else if (current) {
        current.content += line + '\n'
      }
    }
    if (current) sections.push(current)
    const result = sections.length > 0 ? sections : [{ title: 'AI 项目总结', content: raw }]
    saveDB()
    return { sections: result }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// 导出图片读取（报告用）
export { readImageBase64 }

export type { Evidence }
