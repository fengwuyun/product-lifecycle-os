# Step Questions And Full UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the Step answer model, implement every P0/P1/P2 UX improvement in the approved audit spec, verify the packaged Windows app, and publish the update.

**Architecture:** Keep `questions/answers` as the only Step text-answer source and migrate v1/v2 checklist responses into compatibility questions in data version 3. Add focused renderer helpers for progress/search/recent state, keep backup/restore in a main-process service, and improve shared UI primitives so every page benefits without broad page rewrites.

**Tech Stack:** Electron 33, React 18, TypeScript 5.7, Zustand 5, Tailwind CSS 4, Vitest, Testing Library, electron-builder.

**Spec:** `docs/superpowers/specs/2026-09-12-step-questions-and-ux-audit-design.md`

## Global Constraints

- Implement P0, P1, and P2 in this delivery.
- Follow the user's preferred sequence: modify production code first, then add and run tests.
- Existing project answers and legacy checklist responses must not be lost or overwrite newer answers.
- Preserve the existing visual tokens, typography, spacing scale, icons, and card language.
- Backup restore must be transactional from the user's perspective: failure leaves current data usable.
- Do not claim complete WCAG compliance from component tests or screenshots.

---

### Task 1: Restore Questions As The Single Answer Model

**Files:**
- Modify: `src/shared/types.ts`
- Replace: `src/shared/checklistResponses.ts` with `src/shared/legacyChecklistResponses.ts`
- Modify: `src/main/defaultPlaybook.ts`
- Modify: `src/main/dataMigrations.ts`
- Modify: `src/main/services/projects.ts`
- Test: `src/main/dataMigrations.test.ts`

**Interfaces:**
- Produces: `DATA_VERSION = 3`
- Produces: `migrateData(input: AppData): { data: AppData; changed: boolean }`
- Produces: default questions `q120` and `q130`
- Removes from public types: `responseRequired`, `responsePrompt`, and `response`

- [ ] **Step 1: Change the production data model and default questions**

Restore the checklist interfaces to:

```ts
checklist: { id: string; text: string }[]
export interface ProjectChecklistItem { id: string; text: string; done: boolean }
```

Add `{ id: 'q120', q: '用一句话描述这个产品机会：为谁、在什么场景、解决什么问题？' }` to `op_s2`, and `{ id: 'q130', q: '用户真正需要解决的核心问题是什么？' }` to `op_s3` before their existing questions.

- [ ] **Step 2: Implement v3 migration before removing legacy values**

Keep legacy parsing internal with:

```ts
type LegacyChecklistItem = ProjectChecklistItem & {
  responseRequired?: boolean
  responsePrompt?: string
  response?: string
}
```

For each non-empty legacy response, generate `legacy_question_${item.id}` only when that answer ID does not exist, append a question whose text is `responsePrompt || item.text`, copy the response into `step.answers`, then replace the item with `{ id, text, done }`. Never replace an existing answer.

- [ ] **Step 3: Remove checklist-answer validation and demo response generation**

Delete the response validation in `stepComplete`, stop initializing checklist responses in `createProject`, and stop populating fake response strings in `createDemoProject`.

- [ ] **Step 4: Update migration tests after implementation**

Cover v1 and v2 direct migration, multiple responses, preservation of existing answers, removal of legacy fields, stable compatibility IDs, and idempotent second migration.

- [ ] **Step 5: Run focused tests and commit**

Run `pnpm test -- src/main/dataMigrations.test.ts` and `pnpm typecheck`. Commit with `fix: restore questions as step answer model`.

---

### Task 2: Put Questions Inside The Checklist Card

**Files:**
- Modify: `src/renderer/src/pages/Step.tsx`
- Modify: `src/renderer/src/pages/Step.test.tsx`

**Interfaces:**
- Consumes: `ProjectStep.questions` and `ProjectStep.answers`
- Produces: local save state `'idle' | 'saving' | 'saved' | 'error'`

- [ ] **Step 1: Replace the checklist-response UI**

Render checklist rows first, then a `border-t` sub-section inside the same `Card` with heading `需要回答的问题`. Render existing question label, hint, and textarea there. Delete `expandedResponseId`, `setChecklistResponse`, response gating, and the standalone questions section.

- [ ] **Step 2: Add visible auto-save state**

Set `saving` when a debounce is scheduled, `saved` after `stepSave` and `load` succeed, and `error` on failure. Show `保存中…`, `已保存`, or `保存失败` beside the question heading with `role="status"`.

- [ ] **Step 3: Correct navigation controls**

Remove `rotate-180` from the previous-step `ArrowLeft`; add accessible labels to previous/next links.

- [ ] **Step 4: Update Step interaction tests**

Assert Questions are descendants of the Checklist card, `填写完成说明` is absent, checklist toggling does not require an answer, q120/q130 answers save through `patch.answers`, save state becomes visible, and the previous arrow has no rotation class.

- [ ] **Step 5: Run focused tests and commit**

Run `pnpm test -- src/renderer/src/pages/Step.test.tsx` and `pnpm typecheck`. Commit with `fix: place step questions inside checklist card`.

---

### Task 3: Remove Legacy Answer Consumption From AI, Reports, And Playbook Editing

**Files:**
- Modify: `src/main/services/ai.ts`
- Modify: `src/main/services/report.ts`
- Modify: `src/renderer/src/pages/Playbook.tsx`
- Modify: `src/renderer/src/components/project-ui.test.tsx`

**Interfaces:**
- Consumes: `step.questions` and `step.answers`
- Removes: checklist response editor and response rendering

- [ ] **Step 1: Simplify AI and report contexts**

Remove `完成说明` from checklist serialization. Serialize answers as `{ 问题, 回答 }`, including migrated compatibility questions. Report Step rows must render only `answers`, not checklist responses.

- [ ] **Step 2: Remove Playbook checklist response controls**

Delete the “检查项完成说明” panel while keeping `reconcileChecklistItems()` so deleting and reordering lines retains stable checklist IDs.

- [ ] **Step 3: Update affected tests**

Replace metadata assertions with stable-ID assertions and add an AI-context or report assertion proving compatibility-question answers appear through the normal answer path.

- [ ] **Step 4: Run focused tests and commit**

Run `pnpm test -- src/main/services/ai.test.ts src/renderer/src/components/project-ui.test.tsx` and `pnpm typecheck`. Commit with `refactor: use questions throughout reports and ai`.

---

### Task 4: Repair Shared Buttons, Claims Layout, Dialogs, And Status Semantics

**Files:**
- Modify: `src/renderer/src/components/ui.tsx`
- Modify: `src/renderer/src/components/modals.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/pages/Stage.tsx`
- Test: `src/renderer/src/components/project-ui.test.tsx`

**Interfaces:**
- Produces: Button base classes containing `whitespace-nowrap shrink-0 leading-none`
- Produces: accessible `Modal` with title ID, focus trap, and trigger focus restoration

- [ ] **Step 1: Harden Button and Claims layout**

Add no-wrap/shrink classes to `Button`. Change Claims add row to `flex-col sm:flex-row`, add `min-w-0` to the input, and keep the button aligned without text wrapping.

- [ ] **Step 2: Add dialog focus behavior**

Capture `document.activeElement` before opening, focus the first enabled control, cycle Tab/Shift+Tab among enabled controls, close on Escape, and restore focus. Add `role="dialog"`, `aria-modal="true"`, and `aria-labelledby`.

- [ ] **Step 3: Improve status and destructive icon controls**

Give ToastHost `aria-live="polite"` and `aria-atomic="true"`. Add `aria-label` and persistent low-contrast visibility to Claim/Evidence delete buttons; preserve stronger hover/focus color. Show `当前阶段尚未解锁，完成上一阶段决策后可操作` beside the disabled decision control.

- [ ] **Step 4: Add component tests**

Assert button classes, responsive Claims layout, dialog semantics/focus/Tab/Escape restoration, toast live region, icon labels, and locked-stage explanation.

- [ ] **Step 5: Run focused tests and commit**

Run `pnpm test -- src/renderer/src/components/project-ui.test.tsx` and `pnpm typecheck`. Commit with `fix: improve controls and dialog accessibility`.

---

### Task 5: Fix Export Choices And Unify Product Terminology

**Files:**
- Modify: `src/renderer/src/pages/Pipeline.tsx`
- Modify: `src/renderer/src/pages/Portfolio.tsx`
- Modify: `src/renderer/src/pages/Stage.tsx`
- Modify: `src/renderer/src/pages/Step.tsx`
- Modify: `src/renderer/src/pages/Settings.tsx`
- Modify: `src/renderer/src/components/modals.tsx`
- Test: `src/renderer/src/components/project-ui.test.tsx`

**Interfaces:**
- Produces: report calls with `withAiSummary: false` or `true`

- [ ] **Step 1: Expose both export paths**

Use modal actions `直接导出` calling `onConfirm(false)` and `AI 总结并导出` calling `onConfirm(true)`. Disable only the AI option when AI settings are incomplete; direct export remains enabled.

- [ ] **Step 2: Apply Chinese-first terminology**

Use `项目组合`, `执行步骤（Steps）`, `假设（Claims）`, `证据（Evidence）`, `资料（Artifacts）`, and `设置` in headings, breadcrumbs, empty states, modal titles, and descriptions. Do not rename persisted field names or IPC names.

- [ ] **Step 3: Add export and copy tests**

Assert both buttons call the correct boolean and the primary page headings use Chinese-first labels.

- [ ] **Step 4: Run focused tests and commit**

Run `pnpm test -- src/renderer/src/components/project-ui.test.tsx` and `pnpm typecheck`. Commit with `feat: clarify exports and localize product terms`.

---

### Task 6: Add Stage Progress Summary

**Files:**
- Create: `src/renderer/src/components/StageProgressSummary.tsx`
- Modify: `src/renderer/src/pages/Stage.tsx`
- Test: `src/renderer/src/components/StageProgressSummary.test.tsx`

**Interfaces:**
- Consumes: `{ project: Project; stage: ProjectStage; evidences: Evidence[] }`
- Produces: `getStageProgressSummary(...)` with five metrics and `nextGap`

- [ ] **Step 1: Implement progress derivation and component**

Return metrics for Steps, Todo, required deliverables, Evidence, and exit criteria. Derive the first gap in that order and display compact progress bars plus `下一项：${nextGap}`; if all complete, display `已满足阶段决策条件`.

- [ ] **Step 2: Place summary after the stage key question**

Keep every existing detail section; the summary is navigation, not a replacement editor.

- [ ] **Step 3: Add derivation and rendering tests**

Cover incomplete and ready states, zero evidence requirements, and counts matching `stageGate`.

- [ ] **Step 4: Run focused tests and commit**

Run `pnpm test -- src/renderer/src/components/StageProgressSummary.test.tsx` and `pnpm typecheck`. Commit with `feat: add stage progress summary`.

---

### Task 7: Add Project Search, Recent Projects, And Sidebar Overflow Controls

**Files:**
- Modify: `src/renderer/src/store/sidebarWorkspace.ts`
- Modify: `src/renderer/src/components/Sidebar.tsx`
- Modify: `src/renderer/src/pages/Portfolio.tsx`
- Modify: `src/renderer/src/components/project-ui.test.tsx`

**Interfaces:**
- Produces persisted workspace version 2 with `recentProjectIds: string[]`
- Produces actions `markRecent(projectId)`, `collapseAll()`, and `clearRecent()`

- [ ] **Step 1: Migrate sidebar local state to version 2**

Read v1 safely, retain project and expansion order, initialize recents empty, and cap recents to five unique valid IDs. `openProject` calls `markRecent` without reordering `projectIds`.

- [ ] **Step 2: Add sidebar management controls**

Show `已打开项目 · N`, add `全部折叠` when any project is expanded, keep the project region `min-h-0 overflow-y-auto`, and preserve drag order.

- [ ] **Step 3: Add project search and recent shortcuts**

Add a labeled search field above the portfolio list. Match normalized query against name, description, current stage name/short name, and localized status label. When empty, show up to five recent project chips; when no results, show `未找到匹配项目` and `清除搜索`.

- [ ] **Step 4: Add store and UI tests**

Cover v1-to-v2 local migration, dedupe/cap/filter, recents not changing drag order, collapse all, multi-field search, clear search, and recent chip navigation.

- [ ] **Step 5: Run focused tests and commit**

Run `pnpm test -- src/renderer/src/components/project-ui.test.tsx` and `pnpm typecheck`. Commit with `feat: add project search and recent workspace controls`.

---

### Task 8: Add Complete Backup And Transactional Restore

**Files:**
- Create: `src/main/services/backup.ts`
- Modify: `src/main/store.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/renderer/src/pages/Settings.tsx`
- Test: `src/main/services/backup.test.ts`

**Interfaces:**
- Produces: `backupCreate(): Promise<{ canceled?: boolean; path?: string; error?: string }>`
- Produces: `backupRestore(): Promise<{ canceled?: boolean; restored?: boolean; safetyBackupPath?: string; error?: string }>`
- Produces: `replaceLoadedDB(data: AppData): void`

- [ ] **Step 1: Implement validated filesystem helpers**

Validate candidates with `meta`, `projects`, `playbooks`, and array collections. Copy current `data.json` and `artifacts` into an explicit timestamped directory. Restore via a temporary staging directory, parse and migrate staged JSON, create a safety backup, then replace data and artifacts only after validation succeeds.

- [ ] **Step 2: Wire IPC and preload types**

Register `backup:create` and `backup:restore`; expose matching `Api` methods and preload calls. Wrap errors as user-facing result objects without leaking the API key.

- [ ] **Step 3: Add Settings UI**

Add `完整备份与恢复` card with warning that backups can contain the API Key, buttons `创建完整备份` and `从备份恢复`, progress disabling, restore confirmation, success path display, and `load()` after restore.

- [ ] **Step 4: Add filesystem service tests**

Use unique temporary directories. Cover data/artifact copy, invalid JSON, missing required arrays, safety backup creation, successful restore, and failure preserving original file/hash.

- [ ] **Step 5: Run focused tests and commit**

Run `pnpm test -- src/main/services/backup.test.ts` and `pnpm typecheck`. Commit with `feat: add complete backup and safe restore`.

---

### Task 9: Full Experience Verification, Audit Report, Packaging, And Release

**Files:**
- Create: `docs/audits/2026-09-12-product-experience-audit.md`
- Modify: `package.json` only if the release version is incremented
- Modify: desktop portable EXE outside Git only after build succeeds

**Interfaces:**
- Consumes all previous tasks
- Produces verified audit report, portable EXE, pushed branch/master, and GitHub Release asset

- [ ] **Step 1: Run full automated verification**

Run `pnpm typecheck`, `pnpm test`, `pnpm build`, and `git diff --check`. Record exact pass counts and non-blocking warnings.

- [ ] **Step 2: Perform packaged-app manual checks**

Run `pnpm dist:portable`. Check project search, recent projects, sidebar collapse/drag, Step question placement, autosave indicator, Claims layout, both export modes, backup creation, restore confirmation/cancel, modal keyboard behavior, and 200% Windows scaling. Do not claim screen-reader compliance; record semantic checks and remaining manual limits.

- [ ] **Step 3: Write the inline-audit source report**

List every checked flow step with health, screenshot/code evidence, fixed issue, remaining risk, and the exact evidence limit from the spec. Include the two user-provided screenshots as initial-state evidence paths.

- [ ] **Step 4: Request code review and fix every Critical/Important finding**

Review the full diff against this plan and the approved spec, then rerun affected tests after each fix.

- [ ] **Step 5: Run fresh final verification and commit**

Repeat `pnpm typecheck`, `pnpm test`, `pnpm build`, and `git diff --check`. Commit the audit and final corrections with `docs: add product experience audit`.

- [ ] **Step 6: Integrate and publish only after user-approved branch workflow**

Merge or PR according to the finishing-development-branch choice. Build the final portable EXE, verify SHA-256 after copying to the desktop shortcut target, push GitHub, upload the Release asset, and confirm remote commit and release digest equal local values.
