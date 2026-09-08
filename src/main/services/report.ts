import { dialog, shell, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { Project, ProjectStage, Evidence, Claim, AIReview, Decision, Artifact } from '../../shared/types'
import { getDB, artifactsDir } from '../store'
import { projectProgress, computeGate } from './projects'
import { readImageBase64 } from './artifacts'

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function nl2br(s: string): string {
  return esc(s).replace(/\n/g, '<br/>')
}

function fmtDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const STAGE_ORDER = ['机会', '验证', '竞品', '定义', 'MVP', '开发', '软启动', '市场验证']

const CSS = `
:root{--ink:#1d1c18;--ink2:#5c5a52;--ink3:#8f8d84;--line:#e7e4dc;--paper:#f7f6f2;--card:#ffffff;--primary:#4f46e5;--primary-soft:#eef0fe;--ok:#0f8a5f;--ok-soft:#e6f5ee;--warn:#b45309;--warn-soft:#fdf1e3;--bad:#c93b3b;--bad-soft:#fdeaea}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Segoe UI","Microsoft YaHei","PingFang SC",system-ui,sans-serif;background:var(--paper);color:var(--ink);font-size:14.5px;line-height:1.75;padding:40px 20px}
.wrap{max-width:960px;margin:0 auto}
.cover{background:linear-gradient(135deg,#1c1b2e 0%,#312e81 100%);border-radius:18px;padding:44px 48px;color:#fff;margin-bottom:28px}
.cover h1{font-size:27px;font-weight:700;letter-spacing:.5px}
.cover .sub{opacity:.75;margin-top:8px;font-size:13.5px}
.cover .meta{display:flex;gap:26px;margin-top:22px;flex-wrap:wrap;font-size:13px;opacity:.9}
.cover .meta b{display:block;font-size:17px;font-weight:650;margin-top:2px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:24px 28px;margin-bottom:18px}
h2{font-size:17px;font-weight:700;margin-bottom:14px;display:flex;align-items:center;gap:9px}
h2 .idx{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:7px;background:var(--primary-soft);color:var(--primary);font-size:12.5px;font-weight:700}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th{font-weight:600;color:var(--ink2);text-align:left;border-bottom:1.5px solid var(--line);padding:8px 10px;background:#faf9f6}
td{border-bottom:1px solid var(--line);padding:8px 10px;vertical-align:top}
.xlsx-table td,.xlsx-table th{border:1px solid #d8d5cc;padding:4px 8px;font-size:12.5px}
.badge{display:inline-block;font-size:11.5px;font-weight:600;border-radius:99px;padding:2px 10px;margin-right:6px}
.b-ok{background:var(--ok-soft);color:var(--ok)}
.b-warn{background:var(--warn-soft);color:var(--warn)}
.b-bad{background:var(--bad-soft);color:var(--bad)}
.b-gray{background:#efede8;color:var(--ink2)}
.b-primary{background:var(--primary-soft);color:var(--primary)}
details{background:var(--card);border:1px solid var(--line);border-radius:14px;margin-bottom:14px;overflow:hidden}
details summary{cursor:pointer;list-style:none;padding:18px 24px;display:flex;align-items:center;gap:12px;font-weight:650;font-size:15px;user-select:none}
details summary::-webkit-details-marker{display:none}
details summary .arrow{margin-left:auto;color:var(--ink3);transition:transform .15s;font-size:12px}
details[open] summary .arrow{transform:rotate(90deg)}
details summary .st{margin-left:2px}
.stage-body{padding:4px 24px 22px;border-top:1px dashed var(--line)}
.sec{margin-top:16px}
.sec .lab{font-size:12px;font-weight:700;color:var(--ink3);letter-spacing:1px;margin-bottom:6px;text-transform:uppercase}
.kq{background:var(--primary-soft);border-radius:10px;padding:12px 16px;color:#3730a3;font-weight:600;font-size:14px}
.muted{color:var(--ink2)}
.small{font-size:12.5px}
.todo-done{color:var(--ok)}
.pill-row{display:flex;flex-wrap:wrap;gap:8px}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:2px}
.d-done{background:#10b981}.d-cur{background:#6366f1;box-shadow:0 0 0 3px #c7d2fe}.d-todo{background:#d9d6cd}
.timeline{border-left:2px solid var(--line);margin-left:6px;padding-left:20px}
.tl-item{position:relative;padding-bottom:16px}
.tl-item::before{content:"";position:absolute;left:-26px;top:5px;width:10px;height:10px;border-radius:50%;background:var(--primary);border:2px solid #fff;box-shadow:0 0 0 1.5px var(--primary)}
.tl-date{font-size:12px;color:var(--ink3);font-weight:600}
pre.art{background:#faf9f6;border:1px solid var(--line);border-radius:10px;padding:16px;font-family:Consolas,"Microsoft YaHei",monospace;font-size:12.5px;white-space:pre-wrap;word-break:break-word;max-height:420px;overflow:auto}
.img-embed{max-width:100%;border:1px solid var(--line);border-radius:10px;margin:8px 0}
.risk li{margin:6px 0}
.foot{text-align:center;color:var(--ink3);font-size:12px;margin-top:26px}
`

function stageDot(st: ProjectStage): string {
  if (st.status === 'passed') return '<span class="dot d-done"></span>'
  if (st.status === 'active') return '<span class="dot d-cur"></span>'
  return '<span class="dot d-todo"></span>'
}

function stageStatusBadge(st: ProjectStage): string {
  if (st.status === 'passed') return '<span class="badge b-ok">已通过</span>'
  if (st.status === 'active') return '<span class="badge b-primary">进行中</span>'
  if (st.status === 'abandoned') return '<span class="badge b-bad">已放弃</span>'
  return '<span class="badge b-gray">未开始</span>'
}

function evidenceStrengthBadge(s: string): string {
  const map: Record<string, string> = {
    极强: 'b-ok', 强: 'b-ok', 中: 'b-warn', 弱: 'b-warn', 极弱: 'b-gray'
  }
  return `<span class="badge ${map[s] || 'b-gray'}">${esc(s)}</span>`
}

function renderArtifactBody(a: Artifact): string {
  const parts: string[] = []
  parts.push(`<div class="sec"><div class="lab">来源</div><div class="muted small">${esc(a.sourceType === 'text' ? '手动录入文本' : a.fileName || '')}${a.ext ? ` · .${esc(a.ext)}` : ''}${a.sizeBytes ? ` · ${(a.sizeBytes / 1024).toFixed(1)} KB` : ''}</div></div>`)
  if (a.notes) parts.push(`<div class="sec"><div class="lab">备注</div><div>${nl2br(a.notes)}</div></div>`)
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(a.ext || '')) {
    const img = readImageBase64FromArtifact(a)
    if (img) {
      parts.push(`<div class="sec"><div class="lab">图片</div><img class="img-embed" src="data:${img.mime};base64,${img.data}"/></div>`)
    } else {
      parts.push('<div class="sec muted small">（图片无法读取）</div>')
    }
  } else if (a.extractedHtml) {
    parts.push(`<div class="sec"><div class="lab">正文（表格）</div>${a.extractedHtml}</div>`)
  } else if (a.extractedContent) {
    parts.push(`<div class="sec"><div class="lab">正文</div><pre class="art">${esc(a.extractedContent)}</pre></div>`)
  } else {
    parts.push('<div class="sec muted small">（无解析正文）</div>')
  }
  return parts.join('')
}

function readImageBase64FromArtifact(a: Artifact): { mime: string; data: string } | null {
  if (!a.filePath || !a.ext) return null
  try {
    const fsMod = require('node:fs') as typeof fs
    const buf = fsMod.readFileSync(a.filePath)
    const mime = a.ext === 'jpg' ? 'image/jpeg' : `image/${a.ext}`
    return { mime, data: buf.toString('base64') }
  } catch {
    return null
  }
}

function renderStageSection(project: Project, stage: ProjectStage, claims: Claim[], evidences: Evidence[], reviews: AIReview[], artifacts: Artifact[]): string {
  const gate = computeGate(project, stage)
  const stageArtifacts = artifacts.filter((a) => a.stageId === stage.id)
  const stageClaims = claims.filter((c) => c.stageId === stage.id)
  const stageEvidences = evidences.filter((e) => e.stageId === stage.id)
  const stageReviews = reviews.filter((r) => r.stageId === stage.id)

  const rows: string[] = []

  rows.push(`<div class="sec"><div class="lab">关键问题</div><div class="kq">「${esc(stage.keyQuestion)}」</div></div>`)
  rows.push(`<div class="sec"><div class="lab">阶段介绍</div><div class="muted">${nl2br(stage.introduction)}</div></div>`)
  rows.push(`<div class="sec"><div class="lab">阶段目标</div><div>${esc(stage.objective)}</div></div>`)
  rows.push(`<div class="sec"><div class="lab">方法论</div><ol style="padding-left:20px" class="muted">${stage.methodology.map((m) => `<li>${esc(m)}</li>`).join('')}</ol></div>`)

  rows.push(`<div class="sec"><div class="lab">Todo 完成情况（${gate.todosDone}/${gate.todosTotal}）</div><ul style="list-style:none">` +
    stage.todos.map((t) => `<li>${t.done ? '<span class="todo-done">✓</span>' : '<span class="muted">○</span>'} <span class="${t.done ? '' : 'muted'}">${esc(t.text)}</span></li>`).join('') + '</ul></div>')

  const stepRows = stage.steps.map((s) => {
    const answers = Object.entries(s.answers).filter(([, v]) => v && v.trim())
    const checklistResponses = s.checklist.filter((c) => c.response?.trim())
    return `<tr><td style="white-space:nowrap"><b>${esc(s.name)}</b><br/><span class="small ${s.status === 'done' ? 'todo-done' : 'muted'}">${s.status === 'done' ? '已完成' : '进行中'}</span></td><td>` +
      (checklistResponses.length ? checklistResponses.map((c) => `<div class="small muted" style="margin-bottom:4px">检查项：${esc(c.text)}</div><div style="margin-bottom:10px">${nl2br(c.response || '')}</div>`).join('') : '') +
      (answers.length ? answers.map(([qid, v]) => {
        const q = s.questions.find((x) => x.id === qid)?.q || qid
        return `<div class="small muted" style="margin-bottom:4px">Q：${esc(q)}</div><div style="margin-bottom:10px">${nl2br(v)}</div>`
      }).join('') : checklistResponses.length ? '' : '<span class="muted small">未填写</span>') +
      '</td></tr>'
  }).join('')
  rows.push(`<div class="sec"><div class="lab">用户填写内容（Steps）</div><table><thead><tr><th style="width:180px">Step</th><th>回答</th></tr></thead><tbody>${stepRows}</tbody></table></div>`)

  if (stageClaims.length) {
    rows.push(`<div class="sec"><div class="lab">Claims</div><ul style="padding-left:20px">${stageClaims.map((c) => `<li>${esc(c.statement)}</li>`).join('')}</ul></div>`)
  }
  if (stageEvidences.length) {
    rows.push(`<div class="sec"><div class="lab">Evidence（${stageEvidences.length}）</div><table><thead><tr><th style="width:200px">证据</th><th style="width:80px">强度</th><th>内容</th></tr></thead><tbody>` +
      stageEvidences.map((e) => `<tr><td><b>${esc(e.title)}</b><br/><span class="small muted">${esc(e.type)}${e.notes ? ' · ' + esc(e.notes) : ''}</span></td><td>${evidenceStrengthBadge(e.strength)}</td><td class="small">${nl2br(e.content)}</td></tr>`).join('') +
      '</tbody></table></div>')
  }

  rows.push(`<div class="sec"><div class="lab">Deliverables</div><table><thead><tr><th style="width:220px">成果</th><th>提交内容</th></tr></thead><tbody>` +
    stage.deliverables.map((d) => `<tr><td><b>${esc(d.name)}</b>${d.required ? ' <span class="badge b-gray">必需</span>' : ''}<br/><span class="small muted">${esc(d.description)}</span></td><td>` +
      (d.content
        ? `<div style="white-space:pre-wrap">${nl2br(d.content)}</div>` +
          (d.artifactIds.length ? `<div class="small muted" style="margin-top:6px">关联资料：${d.artifactIds.map((id2) => esc(artifacts.find((a) => a.id === id2)?.title || id2)).join('、')}</div>` : '') +
          `<div class="small muted" style="margin-top:4px">提交于 ${fmtDate(d.submittedAt)}</div>`
        : '<span class="muted small">未提交</span>') +
      '</td></tr>').join('') + '</tbody></table></div>')

  if (stageArtifacts.length) {
    rows.push(`<div class="sec"><div class="lab">资料完整正文（${stageArtifacts.length}）</div>` +
      stageArtifacts.map((a) => `<details open style="margin:8px 0"><summary style="padding:12px 16px;font-size:13.5px"><b>${esc(a.title)}</b>${a.ext ? ` <span class="badge b-gray">.${esc(a.ext)}</span>` : ''}<span class="arrow">▶</span></summary><div class="stage-body" style="border-top:1px dashed var(--line)">${renderArtifactBody(a)}</div></details>`).join('') +
      '</div>')
  }

  if (stageReviews.length) {
    rows.push(stageReviews.map((r) => `<div class="sec"><div class="lab">AI Review · ${fmtDate(r.createdAt)}</div>` +
      `<div style="margin-bottom:8px"><span class="badge ${r.status === 'Ready' ? 'b-ok' : r.status === 'Contradiction' ? 'b-bad' : 'b-warn'}">${esc(r.status)}</span></div>` +
      (r.verified.length ? `<div class="small" style="margin:6px 0">${r.verified.map((v) => `<div>✓ ${esc(v.text)} <span class="muted">〔依据：${esc(v.evidence)}〕</span></div>`).join('')}</div>` : '') +
      (r.unverified.length ? `<div class="small" style="margin:6px 0">${r.unverified.map((v) => `<div>⚠ ${esc(v.text)}</div>`).join('')}</div>` : '') +
      (r.gaps.length ? `<div class="small" style="margin:6px 0"><b class="muted">证据不足：</b>${r.gaps.map((g) => `<div>· ${esc(g.claim)} —— 现有：${esc(g.existing)}；缺失：${esc(g.missing)}</div>`).join('')}</div>` : '') +
      (r.logicIssues.length ? `<div class="small" style="margin:6px 0"><b class="muted">逻辑漏洞：</b>${r.logicIssues.map((l) => `<div>· ${esc(l)}</div>`).join('')}</div>` : '') +
      (r.nextStep ? `<div class="small" style="margin-top:6px"><b class="muted">下一步建议：</b>${esc(r.nextStep)}</div>` : '') +
      '</div>').join(''))
  }

  rows.push(`<div class="sec"><div class="lab">Exit Criteria（${gate.criteriaMet}/${gate.criteriaTotal}）</div><ul style="list-style:none">` +
    stage.exitCriteria.map((c) => `<li>${c.met ? '<span class="todo-done">✓</span>' : '<span class="muted">○</span>'} <span class="${c.met ? '' : 'muted'}">${esc(c.text)}</span></li>`).join('') + '</ul></div>')

  rows.push(`<div class="sec"><div class="lab">阶段决策</div>` +
    (stage.decision
      ? `<div><span class="badge b-primary">${esc(stage.decision.type)}</span> <span class="small muted">${fmtDate(stage.decision.at)}</span><div class="small" style="margin-top:4px">${esc(stage.decision.reason)}</div></div>`
      : '<span class="muted small">尚未做出决策</span>') + '</div>')

  const orderIdx = STAGE_ORDER.indexOf(stage.short)
  const num = orderIdx >= 0 ? orderIdx + 1 : stage.order
  return `<details><summary>${stageDot(stage)} ${num}. ${esc(stage.name)} ${stageStatusBadge(stage)}<span class="arrow">▶</span></summary><div class="stage-body">${rows.join('')}</div></details>`
}

export async function exportReport(p: { projectId: string; withAiSummary: boolean; mainWindow: BrowserWindow | null }): Promise<{ path?: string; canceled?: boolean; error?: string }> {
  try {
    const db = getDB()
    const project = db.projects.find((x) => x.id === p.projectId)
    if (!project) return { error: '项目不存在' }
    const stages = [...project.workflowSnapshot.stages].sort((a, b) => a.order - b.order)
    const claims = db.claims.filter((c) => c.projectId === project.id)
    const evidences = db.evidences.filter((e) => e.projectId === project.id)
    const artifacts = db.artifacts.filter((a) => a.projectId === project.id) as Artifact[]
    const reviews = db.aiReviews.filter((r) => r.projectId === project.id)
    const decisions = db.decisions.filter((d) => d.projectId === project.id)
    const progress = projectProgress(project)

    // AI 项目总结（可选）
    let summaryHTML = ''
    if (p.withAiSummary) {
      const { projectSummary } = await import('./ai')
      const r = await projectSummary({ projectId: project.id })
      if (r.sections) {
        summaryHTML = r.sections.map((s) => `<div class="sec"><div class="lab">${esc(s.title)}</div><div>${nl2br(s.content.trim())}</div></div>`).join('')
      } else if (r.error) {
        summaryHTML = `<div class="badge b-warn">AI 总结生成失败：${esc(r.error)}</div>`
      }
    }

    // 当前风险（未验证假设 + 逻辑漏洞汇总）
    const risks: string[] = []
    for (const r of reviews) {
      for (const u of r.unverified) risks.push(`⚠ ${esc(u.text)}`)
      for (const l of r.logicIssues) risks.push(`· ${esc(l)}`)
    }
    const curStage = stages.find((s) => s.id === project.currentStageId)
    if (curStage) {
      const gate = computeGate(project, curStage)
      for (const m of gate.missing) risks.push(`· 当前阶段「${esc(curStage.name)}」：${esc(m)}`)
    }

    const sections: string[] = []

    // 1 项目概览
    sections.push(`<div class="card"><h2><span class="idx">1</span>项目概览</h2><table>
      <tr><th style="width:130px">项目名称</th><td><b>${esc(project.name)}</b></td><th style="width:110px">优先级</th><td>${esc(project.priority)}</td></tr>
      <tr><th>项目描述</th><td colspan="3">${esc(project.description) || '—'}</td></tr>
      <tr><th>状态</th><td>${esc(project.status)}</td><th>Playbook</th><td>v${project.playbookVersion}</td></tr>
      <tr><th>创建时间</th><td>${fmtDate(project.createdAt)}</td><th>最近推进</th><td>${fmtDate(project.lastActiveAt)}</td></tr>
      <tr><th>整体进度</th><td colspan="3">${progress.done}/${progress.total} Steps（${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%）</td></tr>
    </table></div>`)

    // 2 生命周期总览
    sections.push(`<div class="card"><h2><span class="idx">2</span>生命周期总览</h2><div class="pill-row">` +
      stages.map((s) => `<span class="badge ${s.status === 'passed' ? 'b-ok' : s.status === 'active' ? 'b-primary' : 'b-gray'}">${stageDot(s)} ${esc(s.name)}</span>`).join('<span class="muted">→</span>') +
      `</div><div class="small muted" style="margin-top:10px">当前阶段：${esc(curStage?.name || '—')}${project.currentStepId ? ' · ' + esc(curStage?.steps.find((s) => s.id === project.currentStepId)?.name || '') : ''}</div></div>`)

    // 3 所有阶段执行情况（折叠）
    sections.push(`<h2 style="margin:22px 0 12px"><span class="idx">3</span>所有阶段执行情况（点击展开）</h2>` +
      stages.map((s) => renderStageSection(project, s, claims, evidences, reviews, artifacts)).join(''))

    // 4 Claims & Evidence
    sections.push(`<div class="card"><h2><span class="idx">4</span>Claims &amp; Evidence</h2>` +
      (claims.length ? `<table><thead><tr><th>Claim</th><th style="width:150px">阶段</th><th style="width:90px">关联证据数</th></tr></thead><tbody>` +
        claims.map((c) => `<tr><td>${esc(c.statement)}</td><td class="small muted">${esc(stages.find((s) => s.id === c.stageId)?.name || c.stageId)}</td><td>${evidences.filter((e) => e.relatedClaimIds.includes(c.id)).length}</td></tr>`).join('') +
        '</tbody></table>' : '<span class="muted">项目中未记录 Claim</span>') +
      `<div style="height:14px"></div>` +
      (evidences.length ? `<table><thead><tr><th style="width:200px">Evidence</th><th style="width:80px">强度</th><th style="width:110px">类型</th><th>内容</th></tr></thead><tbody>` +
        evidences.map((e) => `<tr><td><b>${esc(e.title)}</b></td><td>${evidenceStrengthBadge(e.strength)}</td><td class="small muted">${esc(e.type)}</td><td class="small">${nl2br(e.content)}</td></tr>`).join('') +
        '</tbody></table>' : '<span class="muted">项目中未记录 Evidence</span>') +
      '</div>')

    // 5 所有成果
    const allDeliverables = stages.flatMap((s) => s.deliverables.filter((d) => d.content).map((d) => ({ stage: s.name, d })))
    sections.push(`<div class="card"><h2><span class="idx">5</span>所有成果 Deliverables（${allDeliverables.length}）</h2>` +
      (allDeliverables.length ? allDeliverables.map(({ stage, d }) =>
        `<div class="sec"><div class="lab">${esc(stage)} · ${esc(d.name)}</div><div style="white-space:pre-wrap">${nl2br(d.content || '')}</div></div>`
      ).join('') : '<span class="muted">尚未提交任何成果</span>') + '</div>')

    // 6 所有资料完整正文
    sections.push(`<h2 style="margin:22px 0 12px"><span class="idx">6</span>所有资料完整正文（${artifacts.length}）</h2>` +
      (artifacts.length ? artifacts.map((a) =>
        `<details><summary>📄 <b>${esc(a.title)}</b>${a.ext ? ` <span class="badge b-gray">.${esc(a.ext)}</span>` : ''} <span class="small muted">${esc(stages.find((s) => s.id === a.stageId)?.name || '')}</span><span class="arrow">▶</span></summary><div class="stage-body">${renderArtifactBody(a)}</div></details>`
      ).join('') : '<div class="card muted">项目中没有资料</div>'))

    // 7 AI Review
    sections.push(`<div class="card"><h2><span class="idx">7</span>AI Review（${reviews.length}）</h2>` +
      (reviews.length ? reviews.map((r) => `<div class="sec"><div class="lab">${esc(stages.find((s) => s.id === r.stageId)?.name || r.stageId)} · ${fmtDate(r.createdAt)}</div>` +
        `<div><span class="badge ${r.status === 'Ready' ? 'b-ok' : r.status === 'Contradiction' ? 'b-bad' : 'b-warn'}">${esc(r.status)}</span></div>` +
        (r.verified.length ? `<div class="small" style="margin-top:6px">${r.verified.map((v) => `<div>✓ ${esc(v.text)} <span class="muted">〔${esc(v.evidence)}〕</span></div>`).join('')}</div>` : '') +
        (r.unverified.length ? `<div class="small" style="margin-top:4px">${r.unverified.map((v) => `<div>⚠ ${esc(v.text)}</div>`).join('')}</div>` : '') +
        (r.nextStep ? `<div class="small" style="margin-top:4px"><b class="muted">建议：</b>${esc(r.nextStep)}</div>` : '') + '</div>').join('')
        : '<span class="muted">尚未执行过 AI 审查</span>') + '</div>')

    // 8 Decision Timeline
    const decisionsSorted = [...decisions].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    sections.push(`<div class="card"><h2><span class="idx">8</span>Decision Timeline</h2>` +
      (decisionsSorted.length ? `<div class="timeline">` + decisionsSorted.map((d) =>
        `<div class="tl-item"><div class="tl-date">${fmtDate(d.createdAt)} · ${esc(d.type)}${d.stageName ? ' · ' + esc(d.stageName) : ''}</div><div class="small">${esc(d.reason) || '<span class="muted">（未填写原因）</span>'}</div></div>`
      ).join('') + '</div>' : '<span class="muted">暂无决策记录</span>') + '</div>')

    // 9 当前风险
    sections.push(`<div class="card"><h2><span class="idx">9</span>当前风险</h2>` +
      (risks.length ? `<ul class="risk" style="padding-left:20px">${risks.slice(0, 30).map((r) => `<li class="small">${r}</li>`).join('')}</ul>` : '<span class="muted">暂未识别风险（或尚未运行 AI 审查）</span>') + '</div>')

    // 10 AI 项目总结
    sections.push(`<div class="card"><h2><span class="idx">10</span>AI 项目总结</h2>${summaryHTML || '<span class="muted">未生成 AI 总结</span>'}</div>`)

    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(project.name)} · 项目报告</title><style>${CSS}</style></head><body><div class="wrap">
<div class="cover"><h1>${esc(project.name)} · 项目报告</h1><div class="sub">${esc(project.description) || 'Product Lifecycle OS 项目复盘报告'}</div>
<div class="meta"><div>生成日期<b>${fmtDate(new Date().toISOString())}</b></div><div>整体进度<b>${progress.done}/${progress.total} Steps</b></div><div>证据数量<b>${evidences.length}</b></div><div>决策记录<b>${decisions.length}</b></div></div></div>
${sections.join('\n')}
<div class="foot">由 Product Lifecycle OS 生成 · 本报告为单文件 HTML，可直接双击查看</div>
</div><script>document.querySelectorAll('details').forEach(function(d){d.addEventListener('toggle',function(){})});</script></body></html>`

    const win = p.mainWindow || BrowserWindow.getAllWindows()[0]
    const result = await dialog.showSaveDialog(win, {
      title: '导出项目报告',
      defaultPath: `${project.name}-项目报告-${fmtDate(new Date().toISOString())}.html`,
      filters: [{ name: 'HTML 报告', extensions: ['html'] }]
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    fs.writeFileSync(result.filePath, html, 'utf-8')
    shell.showItemInFolder(result.filePath)
    return { path: result.filePath }
  } catch (err) {
    console.error('[report] export failed', err)
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export { artifactsDir }
