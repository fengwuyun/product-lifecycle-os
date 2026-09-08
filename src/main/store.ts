import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { AppData, Settings } from '../shared/types'
import { buildDefaultPlaybook } from './defaultPlaybook'

const DATA_VERSION = 1

export function dataDir(): string {
  return path.join(app.getPath('userData'), 'data')
}
export function artifactsDir(): string {
  return path.join(dataDir(), 'artifacts')
}
export function dbFile(): string {
  return path.join(dataDir(), 'data.json')
}

export function defaultSettings(): Settings {
  return { ai: { baseUrl: '', apiKey: '', model: '' } }
}

function seedDB(): AppData {
  const now = new Date().toISOString()
  return {
    meta: { version: DATA_VERSION, createdAt: now },
    settings: defaultSettings(),
    playbooks: [buildDefaultPlaybook()],
    projects: [],
    claims: [],
    evidences: [],
    artifacts: [],
    decisions: [],
    aiReviews: []
  }
}

let db: AppData | null = null
let saveTimer: NodeJS.Timeout | null = null

export function loadDB(): AppData {
  if (db) return db
  fs.mkdirSync(artifactsDir(), { recursive: true })
  const file = dbFile()
  if (fs.existsSync(file)) {
    try {
      db = JSON.parse(fs.readFileSync(file, 'utf-8')) as AppData
    } catch (err) {
      // 数据文件损坏时备份后重建，避免直接丢数据
      const backup = file + '.corrupt-' + Date.now()
      try { fs.copyFileSync(file, backup) } catch { /* ignore */ }
      console.error('[store] data.json parse failed, backed up to', backup, err)
      db = seedDB()
      persistNow()
    }
  } else {
    db = seedDB()
    persistNow()
  }
  if (!db.settings) db.settings = defaultSettings()
  return db
}

export function getDB(): AppData {
  return loadDB()
}

function persistNow(): void {
  if (!db) return
  const file = dbFile()
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf-8')
  fs.renameSync(tmp, file)
}

export function saveDB(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    try {
      persistNow()
    } catch (err) {
      console.error('[store] persist failed', err)
    }
  }, 250)
}

export function flushDB(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  try { persistNow() } catch (err) { console.error('[store] flush failed', err) }
}

export function resetDB(): void {
  db = seedDB()
  flushDB()
}

let counter = 0
export function id(prefix: string): string {
  counter = (counter + 1) % 1000
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`
}

export function nowISO(): string {
  return new Date().toISOString()
}
