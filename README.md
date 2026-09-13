# Product Lifecycle OS

> 产品生命周期执行与决策工具 —— 面向独立开发者、产品经理与小微团队
> 依据《Product-Lifecycle-OS-PRD-v0.1》实现，版本 v0.1.1

## 桌面可运行文件（交付物）

| 文件 | 说明 |
|---|---|
| `dist/Product-Lifecycle-OS-0.1.1-portable.exe` | **单文件便携版（约 85MB），双击即可运行，无需安装** |

- 数据全部保存在本机：`C:\Users\<你>\AppData\Roaming\Product Lifecycle OS\data`
- 卸载即删：便携版不写注册表、不留服务，删除 exe 与上述数据目录即完全移除
- 首次启动可在 Portfolio 空状态点击「创建示例项目」快速体验完整闭环

## 功能清单（对照 PRD 验收标准 §38）

- **多项目 Portfolio**：当前焦点卡（P1 · 项目 · 当前/下一步 · 继续）、列表/阶段双视图、P1/P2/P3 优先级、暂停/恢复/放弃/删除
- **项目 Pipeline**：8 阶段生命周期（机会定义 → 需求验证 → 竞品研究 → 产品定义 → MVP 实验 → 开发 → 软启动 → 市场验证），每阶段实时 Stage Gate 摘要（Todo/成果/证据 计数）
- **Stage 页**：阶段介绍 / 目标 / 关键问题 / 方法论 / Todo / Claims / Evidence / Deliverables / AI Review / Exit Criteria / Decision 全量呈现
- **Step 页**：统一 Schema 渲染——说明、Checklist、需要回答的问题（自动保存）、Evidence/Artifact 快捷入口、AI 执行辅助、完成 Step
- **Evidence 系统**：五级证据强度（极强/强/中/弱/极弱）、类型、来源链接、关联 Claim
- **Artifact 资料**：TXT / MD / PDF / DOCX / XLSX / CSV / 图片，文件复制进数据目录并**解析正文**（pdfjs-dist / mammoth / SheetJS），供 AI 审查与报告引用
- **AI 阶段审查**：输出 Ready / Ready with risks / Insufficient Evidence / Contradiction + 已验证判断 / 未验证假设 / 证据缺口 / 逻辑漏洞 / 下一步最低成本建议；内置 PRD 第 12 节铁律（不造证据、不替用户决策）
- **Stage Gate + Decision**：Todo + 必要成果 + 最低证据 + 退出条件全满足才放行；决策（继续/回退/暂停/放弃/调整定位）必须填写原因，记录进 Decision Timeline
- **Playbook**：全部阶段字段可视化编辑（含 Step 增删改、Todo/成果/退出条件、最低证据数），保存即生成新版本；**老项目继续使用创建时的快照，永不受影响**（PRD 第 20 节）
- **项目报告**：单文件 HTML（双击可看），含 10 章：项目概览 / 生命周期总览 / 各阶段执行情况（折叠）/ Claims & Evidence / 全部成果 / **资料完整正文**（Excel 转 HTML 表格、图片 Base64 内嵌）/ AI Review / Decision Timeline / 当前风险 / 可选 AI 项目总结
- **本地优先**：JSON 原子化存储 + 自动备份恢复，无服务器、无注册

## 技术栈

Electron 33 · React 18 · TypeScript · electron-vite · Zustand · Tailwind CSS 4 · pdfjs-dist · mammoth · SheetJS · electron-builder

> 说明：PRD 第 32 节建议 SQLite；为保证零原生依赖、免编译风险，本版采用本地 JSON 原子写入存储（单机工具数据量级下等效可靠），数据结构完整对应 PRD 第 34 节全部对象。

## AI 服务配置

Settings → AI 服务，填入任意 OpenAI 兼容接口（OpenAI / DeepSeek / Moonshot / GLM / 本地 Ollama）：
Base URL（如 `https://api.deepseek.com/v1`）+ API Key + 模型名，点「测试连接」验证。未配置时其余功能全部可用。

## 开发

```bash
pnpm install          # 安装依赖（需允许 electron/esbuild 构建脚本，仓库已配置 onlyBuiltDependencies）
pnpm dev              # 开发模式
pnpm build            # 构建
pnpm dist:portable    # 打包便携 exe
pnpm icon             # 重新生成应用图标
```

## UI 设计语言

- 深墨侧边栏 `#17161C` × 暖纸内容区 `#F6F6F3`，主色靛蓝 `#4F46E5`
- 证据强度五级色标（极强→极弱：翡翠绿→灰），阶段状态 ● 已完成 / ◉ 进行中 / ○ 未开始
- 中文优先排版（Segoe UI / Microsoft YaHei），14px 基准、卡片化信息层级
