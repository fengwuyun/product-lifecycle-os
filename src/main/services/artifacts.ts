import fs from 'node:fs'
import path from 'node:path'
import type { Artifact, ArtifactMeta } from '../../shared/types'
import { getDB, saveDB, id, nowISO, artifactsDir } from '../store'

const MAX_TEXT = 200_000 // 解析正文上限，防止超大文件拖垮 UI
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'])

function metaOf(a: Artifact): ArtifactMeta {
  const { extractedContent, extractedHtml, ...meta } = a
  void extractedContent
  void extractedHtml
  return meta
}

async function parsePDF(buf: Buffer): Promise<{ text: string }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true
  }).promise
  const parts: string[] = []
  const pages = Math.min(doc.numPages, 200)
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i)
    const tc = await page.getTextContent()
    let last = 0
    let line = ''
    for (const item of tc.items as { str?: string; hasEOL?: boolean }[]) {
      if (typeof item.str !== 'string') continue
      line += item.str
      if (item.hasEOL) {
        parts.push(line)
        line = ''
        last = 0
      } else {
        last = 0
        void last
      }
    }
    if (line.trim()) parts.push(line)
    parts.push('')
  }
  await doc.destroy()
  return { text: parts.join('\n').trim() }
}

async function parseDOCX(buf: Buffer): Promise<{ text: string; html: string }> {
  const mammoth = await import('mammoth')
  const result = await mammoth.convertToHtml({ buffer: buf })
  const textResult = await mammoth.extractRawText({ buffer: buf })
  return { text: textResult.value.trim(), html: result.value }
}

function parseXLSX(buf: Buffer, ext: string): { text: string; html: string } {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require('xlsx') as typeof import('xlsx')
  const wb = ext === 'csv' ? XLSX.read(buf.toString('utf-8'), { type: 'string' }) : XLSX.read(buf, { type: 'buffer' })
  const textParts: string[] = []
  const htmlParts: string[] = []
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
    textParts.push(`## ${name}\n` + rows.map((r) => r.join('\t')).join('\n'))
    const trs = rows.slice(0, 300).map((r) => '<tr>' + r.map((c) => `<td>${esc(String(c))}</td>`).join('') + '</tr>').join('')
    htmlParts.push(`<h4>${esc(name)}</h4><table class="xlsx-table"><tbody>${trs}</tbody></table>`)
  }
  return { text: textParts.join('\n\n').trim(), html: htmlParts.join('\n') }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function parseAndStoreFile(p: {
  projectId: string
  stageId: string
  title: string
  notes?: string
  filePath: string
}): Promise<{ artifact?: ArtifactMeta; error?: string }> {
  try {
    const ext = path.extname(p.filePath).replace('.', '').toLowerCase()
    const fileName = path.basename(p.filePath)
    const stat = fs.statSync(p.filePath)
    if (stat.size > 50 * 1024 * 1024) return { error: '文件超过 50MB，暂不支持' }

    const db = getDB()
    const aid = id('art')
    let extractedContent = ''
    let extractedHtml: string | undefined
    let hasContent = true

    // 文件复制进数据目录，保证与原位置解耦
    let storedPath: string | undefined
    try {
      const destDir = artifactsDir()
      fs.mkdirSync(destDir, { recursive: true })
      const dest = path.join(destDir, `${aid}${path.extname(p.filePath)}`)
      fs.copyFileSync(p.filePath, dest)
      storedPath = dest
    } catch {
      storedPath = p.filePath // 复制失败则引用原路径
    }

    if (ext === 'pdf') {
      const r = await parsePDF(fs.readFileSync(p.filePath))
      extractedContent = r.text
    } else if (ext === 'docx') {
      const r = await parseDOCX(fs.readFileSync(p.filePath))
      extractedContent = r.text
      extractedHtml = r.html
    } else if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
      const r = parseXLSX(fs.readFileSync(p.filePath), ext === 'csv' ? 'csv' : ext)
      extractedContent = r.text
      extractedHtml = r.html
    } else if (ext === 'txt' || ext === 'md' || ext === 'markdown') {
      extractedContent = fs.readFileSync(p.filePath, 'utf-8')
    } else if (IMAGE_EXTS.has(ext)) {
      extractedContent = ''
      hasContent = false // 图片以文件本体+备注参与报告
    } else {
      return { error: `暂不支持 .${ext} 格式（支持 txt/md/pdf/docx/xlsx/csv/图片）` }
    }

    if (extractedContent.length > MAX_TEXT) extractedContent = extractedContent.slice(0, MAX_TEXT) + '\n…[内容过长已截断]'
    if (!extractedContent.trim() && !IMAGE_EXTS.has(ext)) hasContent = false

    const artifact: Artifact = {
      id: aid,
      projectId: p.projectId,
      stageId: p.stageId,
      title: p.title || fileName,
      sourceType: 'file',
      fileName,
      filePath: storedPath,
      ext,
      sizeBytes: stat.size,
      notes: p.notes,
      hasContent,
      extractedContent,
      extractedHtml,
      createdAt: nowISO()
    }
    db.artifacts.push(artifact)
    saveDB()
    return { artifact: metaOf(artifact) }
  } catch (err) {
    console.error('[artifact] parse failed', err)
    return { error: '解析失败：' + (err instanceof Error ? err.message : String(err)) }
  }
}

export function addTextArtifact(p: { projectId: string; stageId: string; title: string; content: string; notes?: string }): ArtifactMeta {
  const db = getDB()
  const artifact: Artifact = {
    id: id('art'),
    projectId: p.projectId,
    stageId: p.stageId,
    title: p.title,
    sourceType: 'text',
    notes: p.notes,
    hasContent: true,
    extractedContent: p.content,
    createdAt: nowISO()
  }
  db.artifacts.push(artifact)
  saveDB()
  return metaOf(artifact)
}

export function getArtifactContent(p: { id: string }): Artifact | null {
  return getDB().artifacts.find((a) => a.id === p.id) || null
}

export function deleteArtifact(p: { id: string }): void {
  const db = getDB()
  const art = db.artifacts.find((a) => a.id === p.id)
  if (art?.filePath && art.filePath.startsWith(artifactsDir())) {
    try { fs.unlinkSync(art.filePath) } catch { /* ignore */ }
  }
  db.artifacts = db.artifacts.filter((a) => a.id !== p.id)
  // 清理成果/证据中的引用
  for (const prj of db.projects) {
    for (const st of prj.workflowSnapshot.stages) {
      for (const d of st.deliverables) d.artifactIds = d.artifactIds.filter((x) => x !== p.id)
    }
  }
  for (const e of db.evidences) if (e.artifactId === p.id) e.artifactId = undefined
  saveDB()
}

export function readImageBase64(artifactId: string): { mime: string; data: string } | null {
  const art = getDB().artifacts.find((a) => a.id === artifactId)
  if (!art?.filePath || !art.ext || !IMAGE_EXTS.has(art.ext)) return null
  try {
    const buf = fs.readFileSync(art.filePath)
    const mime = art.ext === 'jpg' ? 'image/jpeg' : `image/${art.ext}`
    return { mime, data: buf.toString('base64') }
  } catch {
    return null
  }
}
