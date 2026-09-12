# Task 5 报告：导出选项与产品术语

## 接管的已有差异

接管时，前一代理已修改 brief 中的 7 个生产/测试文件：导出弹窗双路径、页面术语本地化和相应测试均已有部分实现。我先完整审查了差异，再补全生产文案与缺省配置处理；确认生产实现完整后才继续运行和补强测试。没有改动 persisted 字段名或 IPC 名。

## 需求映射

- 导出弹窗提供“直接导出”和“AI 总结并导出”，分别调用 `onConfirm(false)` / `onConfirm(true)`；设置缺失或 AI 字段为空时只禁用 AI 选项，直接导出仍可点击并调用 `reportExport({ withAiSummary: false })`。
- 页面标题、面包屑、空状态、弹窗标题和说明中采用 brief 指定的中文优先术语：`项目组合`、`执行步骤（Steps）`、`假设（Claims）`、`证据（Evidence）`、`资料（Artifacts）`、`设置`。
- 新增/补强测试覆盖两种导出布尔值、未配置 AI 时直接导出仍执行、AI 选项禁用状态，以及主要页面中文优先标题。
- Task 4 的 Modal 焦点语义、Button 单行样式、Toast 高于 Modal，以及 Step 单卡布局代码均保留；相关 Modal、Button、Toast 与 Step 测试通过。

## 验证与提交

- 聚焦测试：使用 bundled Node 启动本地 Vitest，运行 `src/renderer/src/components/project-ui.test.tsx`：16/16 通过。
- 类型检查：使用 bundled Node 启动本地 `tsc --noEmit -p tsconfig.json`：退出码 0。
- 全量测试：使用 bundled Node 启动本地 Vitest：5 个测试文件、31/31 通过。
- `git diff --check`：通过。仓库没有 `pnpm-workspace.yaml`，未创建该文件。
- 功能提交 SHA：`a06a617af023b9f99ad71c09782f753482ad00a0`，提交信息为 `feat: clarify exports and localize product terms`。

## 自审与疑虑

导出选项与 IPC 布尔参数对应明确，配置判定同时兼容缺失和空白字段。测试输出包含 Vite CJS API 弃用提示和 React Router v7 future flag 提示，均未导致失败；Git 另提示工作区 LF 将转换为 CRLF，`git diff --check` 未发现空白错误。

## Fix Round 1

系统复核 brief 指定的页面与弹窗文案后，补齐成果弹窗无资料提示、阶段证据区说明、阶段审查空状态、设置页 AI 说明中的 canonical 双语术语；同步补齐假设空状态、证据关联提示、相关输入提示和缺失项目/阶段时的返回文案。测试新增上述阶段说明与空状态、设置说明、证据/资料/成果弹窗文案断言。

验证使用 bundled Node 启动本地 Vitest，`src/renderer/src/components/project-ui.test.tsx` 的 18 项测试通过；本地 TypeScript `tsc --noEmit -p tsconfig.json` 退出码为 0；`git diff --check` 通过。Vitest 仍显示 Vite CJS 弃用和 React Router future flag 提示。
