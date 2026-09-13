# 产品体验审计（2026-09-12）

## 范围与结论

本审计覆盖 `codex/step-questions-ux-audit` 相对 `master` 的 Questions/Answers 迁移、执行步骤（Steps）、导出、假设（Claims）、可访问性语义、阶段推进摘要、项目组合与侧边栏、完整备份恢复及 Windows portable 打包。本次自动化验证结果为 TypeScript 类型检查通过；Vitest 10 个测试文件、83 项测试全部通过；electron-vite 生产构建通过。portable 产物已生成，但未启动应用或访问任何真实用户数据。P0/P1/P2 的代码与组件交互证据齐全；下列人工视觉、读屏与缩放项仍是发布前风险，而不是已验证结论。

## 初始状态证据

以下四张用户本轮提供的截图保留为问题初始状态的路径证据；它们用于追溯原始 Step/Claims 信息层级、重复输入和按钮换行问题，并非本任务中重新采集的验收截图。

- `C:\Users\张征\AppData\Local\Temp\codex-clipboard-458d0f98-58aa-4a7e-920e-6c0ad28872fe.png`
- `C:\Users\张征\AppData\Local\Temp\codex-clipboard-a856d7df-1a0a-4b80-9bd1-8a581b3a3beb.png`
- `C:\Users\张征\AppData\Local\Temp\codex-clipboard-dc859c48-8a62-46ce-96bd-ad08002b6ba4.png`
- `C:\Users\张征\AppData\Local\Temp\codex-clipboard-60c0f08a-f004-437b-8222-463da69ae981.png`

## 核心流程审计

| 流程 | 健康状态 | 已修问题与代码/测试证据 | 剩余风险与证据边界 |
| --- | --- | --- | --- |
| 数据迁移与唯一 Answers 模型 | 自动化通过 | v3 将非空 legacy checklist response 迁为兼容 Questions/Answers，不覆盖已有答案并移除旧字段；`src/main/dataMigrations.test.ts` 覆盖迁移、保留与幂等，`src/main/services/ai.test.ts` 证明兼容问题经标准回答上下文进入 AI。 | 未在真实旧用户数据库副本上做升级演练；回滚、磁盘权限与异常数据组合仍需人工演练。 |
| Step Checklist、问题放置与自动保存 | 自动化通过 | Questions 已置于同一 Checklist 卡片下半区，状态使用 `role="status"`，旧保存不会覆盖新 Step 状态；`src/renderer/src/pages/Step.tsx`、`Step.test.tsx` 覆盖 q120/q130、保存状态、无回答门槛、正确的上一步箭头及竞态。 | 未在打包 Electron 窗口中连续输入、切换和断电/进程终止下观察 debounce；无像素级新截图。 |
| 报告导出：直接与 AI 总结 | 自动化通过 | `withAiSummary` 显式区分两种动作；`project-ui.test.tsx` 验证直接导出传 `false`、AI 导出传 `true`，未配置 AI 时仅禁用 AI 动作。 | 没有实际创建两份用户报告或调用外部 AI；文件选择器、权限和 AI 服务错误提示须在目标机器手测。 |
| Claims、按钮和 Modal/Toast | 组件语义已测 | Button 固定单行，Claims 窄布局可堆叠；Modal 有 dialog、标题关联、初始焦点、Tab 循环、Escape 与触发点恢复；Toast 有礼貌 live region，均由 `project-ui.test.tsx` 覆盖。 | 当前无法真实读屏；组件语义已测，未完成真实读屏/完整 WCAG。未完成真实窗口宽度、字体缩放和 200% Windows 缩放视觉操作，不能据此声称完整无障碍或视觉合规。 |
| 中文主名称、阶段推进摘要 | 自动化通过 | `StageProgressSummary.tsx` 按 Steps、Todo、必需成果、Evidence、退出条件计算最先缺口，测试覆盖计数、零要求和 ARIA 数值；`project-ui.test.tsx` 覆盖主要页面与空状态的中文优先术语。 | 未由产品人员走查所有长文本、截断及业务术语；未验证国际化或屏幕缩放下的排版。 |
| 项目搜索、最近打开与侧边栏 | 自动化通过 | workspace v1→v2 迁移、最近五项去重、拖拽顺序不变、全部折叠、多字段搜索、无结果清除及最近项目跳转均由 `project-ui.test.tsx` 覆盖；实现位于 `sidebarWorkspace.ts`、`Portfolio.tsx`、`Sidebar.tsx`。 | 未执行原生拖放、长项目列表滚动或跨显示器窗口缩放；无法确认真实鼠标手势与 200% 缩放视觉效果。 |
| 完整备份、恢复、确认与取消 | 自动化通过 | main-process 服务在校验/暂存后创建安全备份并以成对目录替换；测试覆盖完整复制、无效 JSON、缺字段、迁移、junction 拒绝、回滚、flush 失败与重叠树拒绝。Settings 测试覆盖确认、取消、失败不误报和成功后的 reload。 | 未选择真实备份目录或替换真实用户数据；不对实际恢复后的用户数据、杀毒软件锁文件或网络盘作保证。备份可含 API Key 的风险已在 UI 提示。 |
| portable 打包 | 产物已生成 | 本机 electron-builder 25.1.8 针对 Windows x64 portable 完成打包，产物路径与 SHA-256 见下节。 | 未启动 smoke，避免创建/修改任何真实用户数据；未验证签名（日志显示未配置签名信息而跳过）及其他 Windows 机器兼容性。 |

## 验证证据

执行环境使用 bundled Node 直接调用本地 CLI，因为全局 pnpm 不可用且 pnpm 在依赖状态预检中受 `onlyBuiltDependencies` 阻断；未修改 lockfile、依赖策略或生产代码。直接 CLI 的新鲜结果如下：`node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` 退出 0；`node node_modules/vitest/vitest.mjs run` 退出 0（10 files / 83 tests）；`node node_modules/electron-vite/bin/electron-vite.js build` 退出 0。构建非阻断提示为 Vite CJS Node API 弃用，以及 `ai.ts` 同时静态/动态导入因而不会单独拆 chunk。

portable 命令为 `node node_modules/electron-builder/out/cli/cli.js --win portable --publish never`。产物：`D:\Development\ZCode\workplace\product-lifecycle-os\.worktrees\step-questions-ux-audit\dist\Product-Lifecycle-OS-0.1.0-portable.exe`；大小 `88,675,299` bytes（84.57 MiB）；SHA-256 `CC8A17400F9DD12DC996F60BB4D2B3D358267C3A05238CA4827E24D40AD7C580`。electron-builder 日志显示未配置签名信息，故跳过签名。

## 发布前人工清单

在不操作真实数据的干净 Windows 用户配置中，启动 portable 包并确认：搜索/最近项目、侧边栏原生拖动与全部折叠、Step 输入和可见自动保存、Claims 窄窗口、直接/AI 两种导出、备份创建、恢复确认与取消、Modal 键盘循环与焦点返回。再以 Windows 200% 缩放检查所有上述界面；使用 NVDA 或同等读屏器复核 dialog、status 与 live region。上述项目尚未完成，因此本报告不声明完整 WCAG 或像素级验收。
