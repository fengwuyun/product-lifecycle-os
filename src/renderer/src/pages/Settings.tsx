import { useState, useEffect } from 'react'
import { Settings as SettingsIcon, Bot, HardDrive, PlugZap, FolderOpen, Trash2, Info, ShieldCheck } from 'lucide-react'
import { useApp } from '../store/app'
import { Button, Card, Badge, Field } from '../components/ui'
import type { Settings as SettingsType } from '@shared/types'

export function SettingsPage() {
  const { data, load, toast } = useApp()
  const [ai, setAi] = useState<SettingsType['ai']>({ baseUrl: '', apiKey: '', model: '' })
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [dataPath, setDataPath] = useState('')
  const [versions, setVersions] = useState({ app: '', electron: '', node: '' })
  const [resetOpen, setResetOpen] = useState(false)

  useEffect(() => {
    if (data) setAi({ ...data.settings.ai })
    window.api.getDataPath().then(setDataPath)
    window.api.getVersions().then(setVersions)
  }, [data])

  if (!data) return null

  const save = async () => {
    try {
      await window.api.settingsSave({ settings: { ai } })
      await load()
      toast('设置已保存', 'ok')
    } catch (err) { toast((err as Error).message, 'bad') }
  }

  const test = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      await window.api.settingsSave({ settings: { ai } })
      await load()
      const r = await window.api.aiTestConnection()
      setTestResult(r)
    } catch (err) {
      setTestResult({ ok: false, message: (err as Error).message })
    } finally { setTesting(false) }
  }

  return (
    <div className="p-7 max-w-[760px] mx-auto pb-16">
      <div className="flex items-center gap-2.5 mb-1.5">
        <SettingsIcon size={20} className="text-primary" />
        <h1 className="text-[21px] font-bold tracking-tight">Settings</h1>
      </div>
      <p className="text-[13px] text-ink-3 mb-6">AI 服务与本地存储配置。所有数据仅保存在你自己的电脑上。</p>

      {/* AI 服务 */}
      <Card className="p-5 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <Bot size={16} className="text-primary" />
          <div className="font-bold text-[15px]">AI 服务</div>
          <Badge tone="gray">OpenAI 兼容接口</Badge>
        </div>
        <div className="text-[12.5px] text-ink-3 mb-4 leading-relaxed">
          配置任意 OpenAI 兼容的 API（OpenAI / DeepSeek / Moonshot / GLM / 本地 Ollama 等）。AI 用于阶段审查、Step 辅助与项目总结；
          AI 不会替你做阶段决策，也不会编造证据（PRD 第 12 节约束已内置在提示词中）。
        </div>
        <Field label="API Base URL" hint="以 /v1 结尾，例如 https://api.deepseek.com/v1">
          <input type="text" value={ai.baseUrl} onChange={(e) => setAi({ ...ai, baseUrl: e.target.value })} placeholder="https://api.openai.com/v1" />
        </Field>
        <Field label="API Key">
          <input type="password" value={ai.apiKey} onChange={(e) => setAi({ ...ai, apiKey: e.target.value })} placeholder="sk-…" />
        </Field>
        <Field label="模型名称" hint="例如 gpt-4o-mini / deepseek-chat / glm-4-flash">
          <input type="text" value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value })} placeholder="gpt-4o-mini" />
        </Field>
        <div className="flex items-center gap-2.5">
          <Button variant="primary" onClick={save}>保存设置</Button>
          <Button onClick={test} loading={testing}><PlugZap size={14} /> 测试连接</Button>
          {testResult && (
            <span className={`text-[12.5px] ${testResult.ok ? 'text-ok' : 'text-bad'} leading-snug`}>
              {testResult.ok ? '✓ ' : '✗ '}{testResult.message}
            </span>
          )}
        </div>
      </Card>

      {/* 本地存储 */}
      <Card className="p-5 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <HardDrive size={16} className="text-primary" />
          <div className="font-bold text-[15px]">本地存储</div>
        </div>
        <div className="text-[12.5px] text-ink-3 mb-4 leading-relaxed">
          全部数据（项目、证据、资料正文、决策）以 JSON 形式保存在本机，不上传任何服务器。资料文件已复制进数据目录，移动原文件不影响使用。
        </div>
        <div className="bg-[#faf9f6] border border-line rounded-[10px] px-4 py-3 text-[12.5px] font-mono text-ink-2 break-all mb-3.5">{dataPath}</div>
        <div className="flex items-center gap-2.5">
          <Button onClick={() => window.api.revealDataFolder()}><FolderOpen size={14} /> 打开数据文件夹</Button>
          <Button variant="ghost" className="text-bad hover:bg-bad-soft" onClick={() => setResetOpen(true)}>
            <Trash2 size={14} /> 清空全部数据
          </Button>
        </div>
      </Card>

      {/* 隐私与边界 */}
      <Card className="p-5 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck size={16} className="text-primary" />
          <div className="font-bold text-[15px]">AI 审查的边界（内置约束）</div>
        </div>
        <ul className="text-[13px] text-ink-2 space-y-1.5 leading-relaxed list-none">
          <li>· AI 禁止自行创造用户数据、禁止制造 Evidence</li>
          <li>· 禁止把行业常识当成项目证据；没有依据时必须标记「未验证」</li>
          <li>· 禁止替你决定「继续 / 暂停 / 放弃」——最终决策权永远在你手里</li>
        </ul>
      </Card>

      {/* 关于 */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Info size={16} className="text-ink-3" />
          <div className="font-bold text-[15px]">关于</div>
        </div>
        <div className="text-[13px] text-ink-2 space-y-1.5">
          <div className="flex gap-3"><span className="text-ink-3 w-20">版本</span>v{versions.app}</div>
          <div className="flex gap-3"><span className="text-ink-3 w-20">Electron</span>{versions.electron}</div>
          <div className="flex gap-3"><span className="text-ink-3 w-20">定位</span>面向独立开发者与小微团队的产品生命周期执行与决策工具</div>
        </div>
      </Card>

      {/* 清空确认 */}
      {resetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/35" onClick={() => setResetOpen(false)} />
          <Card className="relative p-6 w-[420px] anim-in">
            <div className="font-bold text-[16px] mb-2">清空全部数据？</div>
            <div className="text-[13px] text-ink-2 leading-relaxed mb-5">
              所有项目、证据、资料、决策记录都将被删除并恢复为初始状态。此操作不可恢复（建议先导出项目报告备份）。
            </div>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setResetOpen(false)}>取消</Button>
              <Button variant="danger" onClick={async () => {
                await window.api.resetData()
                setResetOpen(false)
                await load()
                toast('数据已清空', 'ok')
              }}>确认清空</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
