---
date: 2026-05-08
topic: remove-confirm-layer
status: ready
spec: docs/specs/2026-05-08-remove-confirm-layer-design.md
---

# Remove Confirm Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底删除 Pie 的 confirm 层（risk classifier / informed-approval card / skip-permissions toggle / K-10 reject-3-strikes），让 LLM tool call 直接执行；保留 R10 first-run-skill / R15 untrusted wrapper / handler 硬锁等其他护栏。

**Architecture:** 自顶向下分层删除 + 每层单独 commit。Task 顺序保证每个 commit 完成后 build 仍能过 + 现有相关 test 仍 green（或被同 task 一并修），避免长期 broken 中间态。最后一步加 storage migration silently drop 老 `skip_permissions_enabled` key。

**Tech Stack:** TypeScript, React 19, Vite + @crxjs, Vitest + happy-dom, Chrome Extension Manifest V3, pnpm.

---

## File Structure

### 删除的文件

| 路径 | 说明 |
|---|---|
| `src/lib/agent/risk.ts` | Risk classifier 整文件 |
| `src/lib/agent/risk.test.ts` | Risk classifier test |
| `src/lib/skip-permissions.ts` | skip-permissions storage helper |
| `src/lib/skip-permissions.test.ts` | skip-permissions test |
| `src/sidepanel/components/AgentConfirmCard.tsx` | Confirm card UI 组件 |
| `src/sidepanel/components/AgentConfirmCard.test.tsx` | Confirm card test |

### 修改的文件

| 路径 | 改动概要 |
|---|---|
| `src/lib/agent/loop.ts` | 删 confirm 调用 / K-10 fatigue / origin-change confirm / skipPermissions ctx 字段 / autoApproved 字段 / classifyRisk 调用 |
| `src/lib/agent/types.ts` | 删 `RiskAssessment` / `RiskLevel`；保留 `ResolvedElement`（仍被 agent-step 渲染用） |
| `src/lib/agent/index.ts` | 删 risk.ts re-export |
| `src/lib/agent/prompt.ts` | KEYBOARD_SIM_GUIDANCE / META_TOOL_GUIDANCE / TAB_TOOLS_GUIDANCE 6 处文案改 |
| `src/lib/agent/loop.test.ts` | 删 confirm 路径相关 case，加 "no confirm-request emit" cross-layer regression |
| `src/lib/agent/cross-layer.test.ts` | 删 confirm 透传 case，加 ex-high tool 直接 execute 断言 |
| `src/lib/agent/prompt.test.ts` | 改写 prompt 文本断言 |
| `src/background/index.ts` | 删 `pendingConfirmations` Map / `agent-confirm-request` 路由 / `skipPermissionsAtStart` 读取 / 加 storage migration |
| `src/background/abort-rotation.ts` | 删 user-reject vs aborted 区分相关注释（abort-rotation 自身保留，仅清理 reject 相关引用） |
| `src/background/abort-rotation.test.ts` | 改写 user-reject 区分相关 case |
| `src/background/effective-pinned.ts` | 检查并删 `pendingConfirmations` 引用（grep hit） |
| `src/types/messages.ts` | 删 `AgentConfirmRequestMessage` / `AgentConfirmResponseMessage` 类型 + Union 引用；删 ChatStreamMessage 里的 `skipPermissions` 字段 |
| `src/sidepanel/components/Settings.tsx` | 删 skip-permissions toggle UI 段 |
| `src/sidepanel/components/Chat.tsx` | 删 confirm-card 渲染相关 / `skipPermissions` 字段透传 |
| `src/sidepanel/components/AgentStepLine.tsx` | 删 `autoApproved` footer 渲染 + 注释 |
| `src/sidepanel/hooks/useSession/index.ts` | 删 confirm-request handler 相关 |
| `src/sidepanel/hooks/useSession/port-handlers.ts` | 删 `agent-confirm-request` 处理 |
| `src/sidepanel/hooks/useSession/index.test.ts` | 改写 confirm 相关 case |
| `src/sidepanel/hooks/useSession/port-handlers.test.ts` | 改写 confirm 相关 case |
| `src/sidepanel/hooks/useSession/concurrent.test.ts` | 改写 confirm 相关 case |
| `src/__tests__/cross-layer/concurrent-task-summary.test.ts` | 改写 confirm 相关 case |
| `src/lib/agent/tools/skill-meta.ts` | 检查并清 confirm 相关注释（grep hit） |
| `src/lib/agent/tools/tabs.ts` | 检查并清 contentPreview 相关（grep hit） |
| `src/lib/sessions/storage.ts` | 检查并清 skipPermissions / pendingConfirmations 相关字段 |
| `src/lib/sessions/storage.test.ts` | 同上 |
| `docs/release-notes/v0.X.0.md` | 新增 release note，标记 breaking |

### 新增的文件

| 路径 | 说明 |
|---|---|
| `src/__tests__/cross-layer/no-confirm-emit.test.ts` | Cross-layer regression：发 ex-high tool → 断言 SW 无 `agent-confirm-request` emit |
| `src/background/skip-permissions-cleanup.test.ts` | Migration test：startup 时 storage `skip_permissions_enabled` 被清除 |

---

## Pre-Flight Audit (Task 0)

### Task 0: 全量 grep 影响面 + 锁定 baseline

**Files:** 不修改任何文件，仅产出 audit report

- [ ] **Step 1: Grep risk classifier 引用面**

```bash
grep -rln "classifyRisk\|RiskAssessment\|RiskLevel\|hasCrossOriginTab\|ALWAYS_HIGH_TAB_TOOLS\|ALWAYS_HIGH_SCREENSHOT_TOOLS\|DANGEROUS_KEYWORD_RE\|isSensitiveInputTarget" src/ --include="*.ts" --include="*.tsx"
```

Expected hits（基线，实施时若多于此说明有新增引用要一并清）:
- `src/lib/agent/loop.ts`
- `src/lib/agent/risk.ts`
- `src/lib/agent/risk.test.ts`
- `src/lib/agent/types.ts`
- `src/lib/agent/index.ts`

- [ ] **Step 2: Grep confirm wire / UI 引用面**

```bash
grep -rln "agent-confirm-request\|agent-confirm-response\|AgentConfirmCard\|AgentConfirmRequestMessage\|AgentConfirmResponseMessage" src/ --include="*.ts" --include="*.tsx"
```

Expected hits:
- `src/background/index.ts`
- `src/types/messages.ts`
- `src/sidepanel/components/AgentConfirmCard.test.tsx`
- `src/sidepanel/hooks/useSession/index.test.ts`
- `src/sidepanel/hooks/useSession/port-handlers.ts`
- `src/sidepanel/components/AgentConfirmCard.tsx`
- `src/__tests__/cross-layer/concurrent-task-summary.test.ts`
- `src/sidepanel/hooks/useSession/index.ts`
- `src/sidepanel/components/Chat.tsx`
- `src/sidepanel/hooks/useSession/concurrent.test.ts`
- `src/sidepanel/hooks/useSession/port-handlers.test.ts`
- `src/lib/agent/loop.ts`
- `src/lib/agent/tools/skill-meta.ts`
- `src/lib/agent/cross-layer.test.ts`

- [ ] **Step 3: Grep confirm internals**

```bash
grep -rln "pendingConfirmations\|confirmRejections\|CONFIRM_REJECT_THRESHOLD\|sendConfirmRequest\|tabTargets\|contentPreview\|metaSkillPreview\|autoApproved" src/ --include="*.ts" --include="*.tsx"
```

- [ ] **Step 4: Grep skip-permissions 引用面**

```bash
grep -rln "skip_permissions\|skipPermissions\|skip-permissions\|SKIP_PERMISSIONS\|isSkipPermissions\|setSkipPermissions" src/ --include="*.ts" --include="*.tsx"
```

Expected hits:
- `src/background/index.ts`
- `src/types/messages.ts`
- `src/sidepanel/components/Settings.tsx`
- `src/sidepanel/components/AgentStepLine.tsx`
- `src/lib/skip-permissions.test.ts`
- `src/lib/skip-permissions.ts`
- `src/lib/agent/loop.test.ts`
- `src/lib/agent/loop.ts`
- `src/lib/agent/cross-layer.test.ts`
- `src/sidepanel/components/Chat.tsx`
- `src/background/abort-rotation.ts`
- `src/background/abort-rotation.test.ts`
- `src/lib/sessions/storage.test.ts`

- [ ] **Step 5: Run baseline test + build**

Run:

```bash
pnpm test
pnpm build
```

Expected: 全部 green。如有 fail 先 fix 再开始本 plan 任何修改（避免污染 attribution）。

- [ ] **Step 6: Commit baseline marker**

```bash
git add docs/specs/2026-05-08-remove-confirm-layer-design.md docs/plans/2026-05-08-remove-confirm-layer.md
git commit -m "docs(spec+plan): remove confirm layer (#13 §P2 #45-6 升级版)"
```

---

## Task 1: 删除 K-10 reject-3-strikes fatigue 段

> 独立段，与 confirm 路径其他部分耦合最弱；先做以缩小后续 confirm 路径删除的复杂度。

**Files:**
- Modify: `src/lib/agent/loop.ts:1237-2058`
- Modify: `src/lib/agent/loop.test.ts`（删 K-10 case）

- [ ] **Step 1: 定位现状**

Read `src/lib/agent/loop.ts` lines 1237-1248（声明）和 2012-2058（计数 + abort 触发）。

确认现状：`confirmRejections: Map<string, number>` + `CONFIRM_REJECT_THRESHOLD = 3` + `confirmResult.reason === "user-reject"` 累加 + 第 3 次触发 emit done fail。

- [ ] **Step 2: 删除声明段**

在 `loop.ts:1237-1248` 删除：

```typescript
// Phase 3 K-10 (reject-side) — per-task confirm-fatigue short-circuit.
// Key is tool name (close_tabs, group_tabs, etc.); value is consecutive
// reject count for that tool name in this task. When a tool reaches
// CONFIRM_REJECT_THRESHOLD rejects, the loop emits agent-done with a
// failure summary so the LLM can't keep re-issuing the same call and
// training the user to mash approve. Counter is task-scoped (cleared
// when runAgentLoop returns); approve does NOT reset the counter (a
// user oscillating reject/approve/reject is still trending toward
// fatigue). Cross-origin approve-side reflection was scoped out (see
// plan K-10 update during document review).
const confirmRejections = new Map<string, number>();
const CONFIRM_REJECT_THRESHOLD = 3;
```

- [ ] **Step 3: 删除计数 + abort 段**

在 `loop.ts:2012-2058` 删除整段 `if (!confirmResult.approved)` 内 K-10 block：

```typescript
if (confirmResult.reason === "user-reject") {
  const prevRejects = confirmRejections.get(tc.name) ?? 0;
  const nextRejects = prevRejects + 1;
  confirmRejections.set(tc.name, nextRejects);
  if (nextRejects >= CONFIRM_REJECT_THRESHOLD) {
    // ... fatigue abort emit
    return;
  }
}
```

保留 `if (!confirmResult.approved)` 外壳和后续 rejection observation 流（Task 4 才整体删 confirm 路径；本 task 只删 K-10 fatigue）。

- [ ] **Step 4: 删除 loop.test.ts 里的 K-10 case**

```bash
grep -n "K-10\|CONFIRM_REJECT_THRESHOLD\|repeatedly rejected\|confirmRejections" src/lib/agent/loop.test.ts
```

删每个 hit 涉及的 `it("...", ...)` 块。

- [ ] **Step 5: Run tests**

```bash
pnpm test src/lib/agent/loop.test.ts
```

Expected: 全 pass（删除的 case 不再跑；其他 case 仍 green，因为 K-10 是孤立 short-circuit）。

- [ ] **Step 6: Build**

```bash
pnpm build
```

Expected: success。

- [ ] **Step 7: Commit**

```bash
git add src/lib/agent/loop.ts src/lib/agent/loop.test.ts
git commit -m "refactor(loop): remove K-10 reject-3-strikes fatigue (confirm layer 删除前置)"
```

---

## Task 2: Origin-change confirm 回退到 hard stop

> issue #33 把 origin lock 改成 user confirm；本 task 回退到原 hard stop（emit done fail），与 restricted URL 一致。

**Files:**
- Modify: `src/lib/agent/loop.ts`（origin-change 段，loop 主循环 1307-1340 范围）
- Modify: `src/lib/agent/loop.ts`（`handleOriginChange` 函数定义，约 800-870 行附近）
- Modify: `src/lib/agent/loop.test.ts`

- [ ] **Step 1: 定位现状**

Read `src/lib/agent/loop.ts:1307-1340`：

```typescript
if (currentOrigin !== pinnedOrigin) {
  const decision = await handleOriginChange({ ... });
  // ... approve / reject 分支
}
```

也读 `handleOriginChange` 函数定义（约 `loop.ts:800-870`）。

- [ ] **Step 2: 改回 hard stop**

把 `if (currentOrigin !== pinnedOrigin)` 分支改为：

```typescript
if (currentOrigin !== pinnedOrigin) {
  await emitDone({
    type: "agent-done-task",
    success: false,
    summary: `Page origin changed from ${pinnedOrigin} to ${currentOrigin}, agent stopped`,
    stepCount: stepIndex - 1,
  }, "abort");
  return;
}
```

- [ ] **Step 3: 删除 `handleOriginChange` 函数**

整段删除（不再有 caller）。同时删除其 import（如有）。

- [ ] **Step 4: 改 loop.test.ts**

```bash
grep -n "handleOriginChange\|origin-change confirm\|originChanged" src/lib/agent/loop.test.ts
```

把"origin change → confirm card → approve/reject"的 case 改写为"origin change → hard stop emit done fail"。

- [ ] **Step 5: Run tests**

```bash
pnpm test src/lib/agent/loop.test.ts
```

Expected: 全 pass（origin-change 相关 case 改写完成）。

- [ ] **Step 6: Build**

```bash
pnpm build
```

Expected: success。

- [ ] **Step 7: Commit**

```bash
git add src/lib/agent/loop.ts src/lib/agent/loop.test.ts
git commit -m "refactor(loop): origin-change 回退到 hard stop（删除 confirm 路径前置）"
```

---

## Task 3: 删除 loop.ts confirm 调用路径 + risk classifier 调用

> 这是核心改动。删除 `classifyRisk` / `sendConfirmRequest` / 大段 `confirmResult` 分支 / `tabTargets` / `contentPreview` / `metaSkillPreview` / `skipPermissions` short-circuit / `autoApproved`。tool call 改为直接 dispatch。

**Files:**
- Modify: `src/lib/agent/loop.ts`（核心 confirm 段，约 1900-2100 行）
- Modify: `src/lib/agent/loop.ts`（`AgentRunContext` 类型，删 `skipPermissions` 字段）
- Modify: `src/lib/agent/loop.test.ts`

- [ ] **Step 1: 写 cross-layer regression test（red 阶段）**

新建 `src/__tests__/cross-layer/no-confirm-emit.test.ts`：

```typescript
import { describe, it, expect, vi } from "vitest";
import { runAgentLoop } from "@/lib/agent/loop";
import type { AgentRunContext } from "@/lib/agent/loop";

describe("no confirm-request emit (acceptance for confirm layer removal)", () => {
  it("does not emit agent-confirm-request for ex-high tools (close_tabs / dispatch_keyboard_input / get_tab_content / capture_visible_tab / open_url)", async () => {
    const emittedMessages: Array<{ type: string }> = [];
    const ctx = makeMockCtx({
      onMessage: (m) => emittedMessages.push(m),
      mockLLMToolCalls: [
        { name: "close_tabs", args: { tabIds: [42] } },
        { name: "dispatch_keyboard_input", args: { text: "hello" } },
        { name: "get_tab_content", args: { tabId: 1 } },
        { name: "capture_visible_tab", args: {} },
        { name: "open_url", args: { url: "https://example.com" } },
      ],
    });

    await runAgentLoop(ctx);

    const confirmRequests = emittedMessages.filter(
      (m) => m.type === "agent-confirm-request",
    );
    expect(confirmRequests).toEqual([]);
  });
});

// makeMockCtx helper — fill per existing loop.test.ts patterns
```

参考 `src/lib/agent/loop.test.ts` 现有 mock helper 拼装 `makeMockCtx`。

- [ ] **Step 2: Run new test (expect FAIL)**

```bash
pnpm test src/__tests__/cross-layer/no-confirm-emit.test.ts
```

Expected: FAIL（confirm 路径仍在）。

- [ ] **Step 3: 删除 `classifyRisk` import + 调用**

在 `loop.ts` 顶部删除：

```typescript
import { classifyRisk } from "./risk";
```

在循环内 grep `classifyRisk(` 调用点（约 2 处），删除调用 + 后续 `risk.level === "high"` 分支判断。

- [ ] **Step 4: 删除 `AgentRunContext.skipPermissions` 字段 + 注释**

`loop.ts:138-152` 范围。删除：

```typescript
/**
 * Task-level snapshot of the global skip-permissions toggle, read at
 * chat-start by the SW dispatcher (`isSkipPermissionsEnabled()`). When
 * ...
 */
skipPermissions: boolean;
```

也删 `loop.ts:811` 处对该字段的注释引用（"global skip-permissions toggle short-circuits..."），简单删整段注释。

- [ ] **Step 5: 删除 `sendConfirmRequest` 调用 + `if (!confirmResult.approved)` 分支**

定位 `loop.ts:1990-2083`：

```typescript
const confirmResult = await sendConfirmRequest(confirmationId, {
  tool: tc.name,
  args: tc.args,
  resolvedElement: ...,
  riskReason,
  metaSkillPreview,
  tabTargets,
  contentPreview,
});

if (!confirmResult.approved) { ... }
```

整段删除（包括 `if (!approved)` 内所有 rejection observation push、emit step、continue 等）。

也删 `confirmationId` 生成 + `sendConfirmRequest` 函数定义本身（在 loop.ts 内）。

- [ ] **Step 6: 删除 `tabTargets` / `contentPreview` / `metaSkillPreview` 计算**

定位 `loop.ts` 内这三者的 build 代码（约在 confirm 调用前 50-100 行内），整段删除。

也清 `loop.ts` 顶部如有 `tabTargets` / `contentPreview` 相关 import 或 helper。

- [ ] **Step 7: 删除 `autoApproved` 字段写入**

定位 `loop.ts:1940` 和 `loop.ts:2169` 两处：

```typescript
autoApproved: ctx.skipPermissions ? true : undefined,
autoApproved: ctx.skipPermissions && risk.level === "high" ? true : undefined,
```

删除字段（`AgentStepMessage` 的 `autoApproved` 字段也在 Task 5 一并删除）。

- [ ] **Step 8: 删除 `riskReason` / `risk` 局部变量**

凡是已经没 caller 的 risk 计算代码（`const risk = classifyRisk(...)` / `const riskReason = risk.reason ?? ...`）整段删除。

- [ ] **Step 9: 删除 `pre-capture-failed` 处理**

grep `pre-capture-failed` 在 loop.ts 的 hit，删除 reason 字符串处理（screenshot pre-capture 失败的 confirm 分支）。

- [ ] **Step 10: Run cross-layer test (expect PASS)**

```bash
pnpm test src/__tests__/cross-layer/no-confirm-emit.test.ts
```

Expected: PASS。

- [ ] **Step 11: Run loop.test.ts + 修复破坏的现有 case**

```bash
pnpm test src/lib/agent/loop.test.ts
```

很多 case 会 fail（依赖 confirm 路径）。逐个 case 处理：
- 涉及 `confirmResult.approved` 的：删除该 case 或改写为"无 confirm，tool 直接 execute"
- 涉及 `tabTargets` / `contentPreview` 的：删除 case
- 涉及 `autoApproved` 的：删除 case
- 涉及 `skipPermissions` ctx 字段的：删 ctx 字段 + 调整断言

- [ ] **Step 12: Run cross-layer.test.ts + 修复**

```bash
pnpm test src/lib/agent/cross-layer.test.ts
```

同上，删 confirm 透传 case，保留主流程 case。

- [ ] **Step 13: Build**

```bash
pnpm build
```

Expected: success。如 fail，可能仍有 `classifyRisk` / `RiskAssessment` import 没清干净，grep 后清掉。

- [ ] **Step 14: Commit**

```bash
git add src/lib/agent/loop.ts src/lib/agent/loop.test.ts src/lib/agent/cross-layer.test.ts src/__tests__/cross-layer/no-confirm-emit.test.ts
git commit -m "refactor(loop): remove confirm path + risk classifier calls (tool call 直接 execute)"
```

---

## Task 4: 删除 SW pendingConfirmations + agent-confirm-request 路由 + 加 storage migration

**Files:**
- Modify: `src/background/index.ts`
- Modify: `src/background/effective-pinned.ts`（如 grep hit）
- Modify: `src/background/abort-rotation.ts`（清理注释）
- Modify: `src/background/abort-rotation.test.ts`
- Create: `src/background/skip-permissions-cleanup.test.ts`

- [ ] **Step 1: 写 migration test (red)**

新建 `src/background/skip-permissions-cleanup.test.ts`：

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { cleanupLegacySkipPermissions } from "./index"; // 或单独 export

describe("skip_permissions_enabled storage cleanup", () => {
  beforeEach(() => {
    // mock chrome.storage.local
    global.chrome = {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({ skip_permissions_enabled: true }),
          set: vi.fn().mockResolvedValue(undefined),
          remove: vi.fn().mockResolvedValue(undefined),
        },
      },
    } as any;
  });

  it("removes legacy skip_permissions_enabled key on startup", async () => {
    await cleanupLegacySkipPermissions();
    expect(chrome.storage.local.remove).toHaveBeenCalledWith("skip_permissions_enabled");
  });
});
```

- [ ] **Step 2: Run migration test (FAIL — function not exported)**

```bash
pnpm test src/background/skip-permissions-cleanup.test.ts
```

Expected: FAIL（`cleanupLegacySkipPermissions` not exported）。

- [ ] **Step 3: 加 cleanup function + 在 SW 启动时调用**

在 `src/background/index.ts` 添加：

```typescript
export async function cleanupLegacySkipPermissions(): Promise<void> {
  await chrome.storage.local.remove("skip_permissions_enabled");
}
```

在 SW 启动入口（`chrome.runtime.onStartup` / `onInstalled`）调用一次。Idempotent，多次调用无害。

- [ ] **Step 4: Run migration test (PASS)**

```bash
pnpm test src/background/skip-permissions-cleanup.test.ts
```

Expected: PASS。

- [ ] **Step 5: 删除 `isSkipPermissionsEnabled` import + 调用**

`src/background/index.ts:53` 删除 import。

`background/index.ts:651` / `:1259` 两处删除 `const skipPermissionsAtStart = await isSkipPermissionsEnabled();`。

`:757-768` / `:1369-1380` 两处删除 `if (skipPermissionsAtStart) { ... pre-capture short-circuit ... }` 整段。

`:903` / `:1503` 两处删除 `skipPermissions: skipPermissionsAtStart,` 字段。

- [ ] **Step 6: 删除 `pendingConfirmations` Map + 路由**

grep 出所有 `pendingConfirmations` 引用：

```bash
grep -n "pendingConfirmations" src/background/index.ts
```

逐处删除：
- Map 声明
- `pendingConfirmations.set(...)` / `.get(...)` / `.delete(...)`
- 路由 `agent-confirm-request` 发送 + `agent-confirm-response` 接收 handler
- Flood-limit short-circuit
- Abort drain（`resolver({ approved: false, reason: "aborted" })`）
- 函数签名里 `pendingConfirmations` 参数（多个 helper function 接受这个 Map）

- [ ] **Step 7: 删除 `effective-pinned.ts` 内引用**

```bash
grep -n "pendingConfirmations" src/background/effective-pinned.ts
```

逐处删除（如仅是注释或 unused 参数，删掉对应签名 + caller 同步调整）。

- [ ] **Step 8: 清理 abort-rotation.ts 注释**

`src/background/abort-rotation.ts:21` 处 `mistake them for user-rejects` 注释。整段重写为不依赖 reject 概念的描述（abort-rotation 自身仍是 SW 状态机的一部分，但不再服务 confirm）。

- [ ] **Step 9: 改写 abort-rotation.test.ts**

```bash
grep -n "user-reject\|fatigue\|K-10" src/background/abort-rotation.test.ts
```

每个 hit 涉及的 `it("...")` 块改写或删除（不再区分 user-reject vs aborted；abort 路径仅由 panel disconnect / Stop 触发）。

- [ ] **Step 10: Run SW + abort-rotation tests**

```bash
pnpm test src/background/
```

Expected: 全 pass。

- [ ] **Step 11: Build**

```bash
pnpm build
```

Expected: success。

- [ ] **Step 12: Commit**

```bash
git add src/background/ 
git commit -m "refactor(sw): remove pendingConfirmations route + skip-permissions read + add legacy storage cleanup"
```

---

## Task 5: 删除 panel confirm UI

**Files:**
- Delete: `src/sidepanel/components/AgentConfirmCard.tsx`
- Delete: `src/sidepanel/components/AgentConfirmCard.test.tsx`
- Modify: `src/sidepanel/components/Chat.tsx`
- Modify: `src/sidepanel/components/AgentStepLine.tsx`
- Modify: `src/sidepanel/hooks/useSession/index.ts`
- Modify: `src/sidepanel/hooks/useSession/port-handlers.ts`
- Modify: `src/sidepanel/hooks/useSession/index.test.ts`
- Modify: `src/sidepanel/hooks/useSession/port-handlers.test.ts`
- Modify: `src/sidepanel/hooks/useSession/concurrent.test.ts`
- Modify: `src/__tests__/cross-layer/concurrent-task-summary.test.ts`

- [ ] **Step 1: 删除 AgentConfirmCard 文件**

```bash
rm src/sidepanel/components/AgentConfirmCard.tsx
rm src/sidepanel/components/AgentConfirmCard.test.tsx
```

- [ ] **Step 2: 删除 Chat.tsx 内 AgentConfirmCard 引用**

```bash
grep -n "AgentConfirmCard\|agent-confirm-request\|skipPermissions" src/sidepanel/components/Chat.tsx
```

逐处清理：
- import
- JSX render（`<AgentConfirmCard ... />`）
- DisplayMessage type guard `m.type === "confirm-request"` 分支

- [ ] **Step 3: 删除 useSession 内 confirm-request handler**

`src/sidepanel/hooks/useSession/port-handlers.ts`：grep `agent-confirm-request` 处理 case，整段删除（包括把 confirm-request 推进 displayMessages 的逻辑）。

`src/sidepanel/hooks/useSession/index.ts`：grep 同样的引用，删除相关 state / dispatch / context 字段（如 pendingConfirms / approveConfirm / rejectConfirm 等）。

- [ ] **Step 4: 删除 AgentStepLine.tsx autoApproved footer**

`src/sidepanel/components/AgentStepLine.tsx:31` 注释 + `:132` JSX block：

```tsx
{step.autoApproved && (
  <div className="...">auto-approved by skip-permissions</div>
)}
```

整段删除 + 注释清理。同时把 `AgentStepMessage` 类型上的 `autoApproved?: boolean` 字段（在 messages.ts，Task 6 处理）。

- [ ] **Step 5: 改写 panel tests**

`src/sidepanel/hooks/useSession/index.test.ts` / `port-handlers.test.ts` / `concurrent.test.ts`：grep `confirm-request` 相关 case 全删；保留主流程 case。

`src/__tests__/cross-layer/concurrent-task-summary.test.ts`：同上。

- [ ] **Step 6: Run panel tests**

```bash
pnpm test src/sidepanel/
```

Expected: 全 pass。

- [ ] **Step 7: Run cross-layer tests**

```bash
pnpm test src/__tests__/cross-layer/
```

Expected: 全 pass（含 Task 3 加的 no-confirm-emit）。

- [ ] **Step 8: Build**

```bash
pnpm build
```

Expected: success。

- [ ] **Step 9: Commit**

```bash
git add src/sidepanel/ src/__tests__/
git commit -m "refactor(panel): remove AgentConfirmCard + useSession confirm handlers + autoApproved footer"
```

---

## Task 6: 删除 messages.ts confirm 类型 + skipPermissions 字段

**Files:**
- Modify: `src/types/messages.ts`

- [ ] **Step 1: 定位**

```bash
grep -n "AgentConfirmRequestMessage\|AgentConfirmResponseMessage\|skipPermissions\|autoApproved" src/types/messages.ts
```

- [ ] **Step 2: 删除 AgentConfirmRequestMessage 接口（约 L342-L401）**

整段删除。

- [ ] **Step 3: 删除 AgentConfirmResponseMessage 接口（约 L403-L417）**

整段删除。

- [ ] **Step 4: 从 Union 类型里删 confirm message 引用**

`L606` / `L619` 范围（PanelToBgMessage / BgToPanelMessage union），删除 union member。

- [ ] **Step 5: 删除 ChatStreamMessage 内 skipPermissions 字段**

grep `skipPermissions` 在 messages.ts，逐处删除字段定义。

- [ ] **Step 6: 删除 AgentStepMessage.autoApproved 字段**

`messages.ts:327` 周围 `autoApproved?: boolean` 字段定义。

- [ ] **Step 7: Run all tests**

```bash
pnpm test
```

Expected: 全 pass。如 fail，多半是 Task 3-5 漏清的引用，逐个 grep 并修。

- [ ] **Step 8: Build**

```bash
pnpm build
```

Expected: success。

- [ ] **Step 9: Commit**

```bash
git add src/types/messages.ts
git commit -m "refactor(types): remove AgentConfirm{Request,Response}Message + skipPermissions/autoApproved fields"
```

---

## Task 7: 删除 risk.ts 文件 + 清 types.ts

**Files:**
- Delete: `src/lib/agent/risk.ts`
- Delete: `src/lib/agent/risk.test.ts`
- Modify: `src/lib/agent/types.ts`
- Modify: `src/lib/agent/index.ts`
- Modify: `src/lib/agent/tools/skill-meta.ts`（如 grep hit）
- Modify: `src/lib/agent/tools/tabs.ts`（如 grep hit）

- [ ] **Step 1: Final grep 验证 0 caller**

```bash
grep -rn "from.*\\bagent/risk\\b\|from.*\"\\./risk\"\|classifyRisk\|hasCrossOriginTab\|RiskAssessment\|RiskLevel" src/ --include="*.ts" --include="*.tsx"
```

Expected hits ≤ `src/lib/agent/risk.ts` + `src/lib/agent/risk.test.ts` + `src/lib/agent/types.ts` + `src/lib/agent/index.ts`（这 4 个文件待清）。如有其他文件 hit，先回 Task 3 修。

- [ ] **Step 2: 删除文件**

```bash
rm src/lib/agent/risk.ts
rm src/lib/agent/risk.test.ts
```

- [ ] **Step 3: 清 types.ts**

`src/lib/agent/types.ts:3-8` 范围删除：

```typescript
export type RiskLevel = "low" | "high";
export interface RiskAssessment {
  level: RiskLevel;
  reason?: string;
}
```

保留 `ResolvedElement`（仍被 agent-step 渲染用）。

- [ ] **Step 4: 清 index.ts re-export**

```bash
grep -n "risk" src/lib/agent/index.ts
```

删除 risk 相关 re-export 行。

- [ ] **Step 5: 清 skill-meta.ts / tabs.ts 内残留注释**

```bash
grep -n "confirm\|approval\|risk" src/lib/agent/tools/skill-meta.ts src/lib/agent/tools/tabs.ts
```

每个 hit 评估：是必要业务注释（保留）还是 confirm 残留（删）。一般 `tabs.ts` 内 `contentPreview` 相关字段定义可能还在 — 删除。

- [ ] **Step 6: Run all tests**

```bash
pnpm test
```

Expected: 全 pass。

- [ ] **Step 7: Build**

```bash
pnpm build
```

Expected: success。`risk.ts` 内的 build-time invariant `console.error throw` 也随之消失，build 不会因此 fail。

- [ ] **Step 8: Commit**

```bash
git add src/lib/agent/
git commit -m "refactor(agent): delete risk.ts + RiskAssessment/RiskLevel types"
```

---

## Task 8: 删除 skip-permissions.ts + Settings UI

**Files:**
- Delete: `src/lib/skip-permissions.ts`
- Delete: `src/lib/skip-permissions.test.ts`
- Modify: `src/sidepanel/components/Settings.tsx`
- Modify: `src/lib/sessions/storage.ts`（如 grep hit）
- Modify: `src/lib/sessions/storage.test.ts`（如 grep hit）

- [ ] **Step 1: Final grep 验证 0 caller**

```bash
grep -rn "skip_permissions\|skipPermissions\|isSkipPermissions\|setSkipPermissions\|SKIP_PERMISSIONS_STORAGE_KEY" src/ --include="*.ts" --include="*.tsx"
```

Expected hits ≤ `src/lib/skip-permissions.ts` + `src/lib/skip-permissions.test.ts` + `src/sidepanel/components/Settings.tsx` + `src/lib/sessions/storage.{ts,test.ts}`（4-5 个文件待清，且 Task 4 已加的 cleanup test 内引用是 storage key string，无 import）。

- [ ] **Step 2: 删除 skip-permissions 文件**

```bash
rm src/lib/skip-permissions.ts
rm src/lib/skip-permissions.test.ts
```

- [ ] **Step 3: 清 Settings.tsx**

`src/sidepanel/components/Settings.tsx`：
- L18 删 import
- L43 删 `useState` 行
- L75 删 `isSkipPermissionsEnabled().then(...)`
- L82-83 删 set 调用
- L88-89 删另一处 set 调用
- L351 周围 JSX `<Toggle enabled={skipPermissions} ... />` 整段删除
- 同时清掉对应的 label / description text / handler 函数

- [ ] **Step 4: 清 sessions/storage.ts + .test.ts**

```bash
grep -n "skipPermissions\|skip_permissions" src/lib/sessions/storage.ts src/lib/sessions/storage.test.ts
```

每个 hit：
- `storage.ts` 如 SessionMeta schema 含 skipPermissions snapshot 字段，删除字段（silent migration — 老 session JSON 字段仍在但 reader 忽略）
- `storage.test.ts` 删相关 case

- [ ] **Step 5: Run all tests**

```bash
pnpm test
```

Expected: 全 pass。

- [ ] **Step 6: Build**

```bash
pnpm build
```

Expected: success。

- [ ] **Step 7: Manual smoke (设置页)**

```bash
pnpm dev
# Load extension at chrome://extensions/, open side panel, navigate to Settings
```

Expected: 设置页无 skip-permissions toggle UI；其他设置（API key / model / sessions 等）正常。

- [ ] **Step 8: Commit**

```bash
git add src/lib/skip-permissions.ts src/lib/skip-permissions.test.ts src/sidepanel/components/Settings.tsx src/lib/sessions/
git commit -m "refactor(panel): remove skip-permissions toggle + storage helper"
```

注：`rm` 的文件 git 自动跟踪 deletion，`git add` 它们的路径即可记录删除。

---

## Task 9: 改写 prompt.ts 6 处文案

**Files:**
- Modify: `src/lib/agent/prompt.ts`
- Modify: `src/lib/agent/prompt.test.ts`

- [ ] **Step 1: 改 KEYBOARD_SIM_GUIDANCE L26**

定位 `prompt.ts:24-30` KEYBOARD_SIM_GUIDANCE。

把 L26 末尾：
```
... Each call activates Chrome's debugger and requires user approval.
```

改为：
```
... Each call activates Chrome's debugger (Chrome shows a yellow bar while debugging is active).
```

- [ ] **Step 2: 改 KEYBOARD_SIM_GUIDANCE L28**

把 L28 中：
```
... DO NOT call \`press_key("Enter")\` between paragraphs — every extra tool call requires the user to approve again.
```

改为：
```
... DO NOT call \`press_key("Enter")\` between paragraphs — batch into one call to keep the trace tidy.
```

- [ ] **Step 3: 改 META_TOOL_GUIDANCE L38**

定位 `prompt.ts:32-41`。

把 L38：
```
- Each call to create_skill / update_skill requires user confirmation, and the skill's first execution requires another confirmation. Be sparing — do not propose a skill on a one-off task.
```

改为：
```
- The skill's first execution requires user confirmation (so the user can review the workflow before it runs). Be sparing — do not propose a skill on a one-off task.
```

- [ ] **Step 4: 改 TAB_TOOLS_GUIDANCE L45**

定位 `prompt.ts:43-63`。

把 L45：
```
Tab management tools (...) let you act on browser tabs (including the one this conversation started on, the "pinned tab"). The user sees an informed-approval confirm card listing every affected tab before any high-risk call lands.
```

改为：
```
Tab management tools (...) let you act on browser tabs (including the one this conversation started on, the "pinned tab"). Calls execute directly — there is no per-call confirm card. Use them deliberately and batch where possible.
```

- [ ] **Step 5: 删 TAB_TOOLS_GUIDANCE L47-52 整个 "Risk model" 段**

定位整段：
```
Risk model:
- list_tabs scope=currentWindow → low (no confirm). scope=allWindows → high; ...
- close_tabs / group_tabs / ungroup_tabs / move_tabs are always high. ...
- get_tab_content is always high (even same-origin) ...
- activate_tab same-origin → low (just a navigation aid, no confirm). Cross-origin → high. ...
- open_url(url, active?) — open a new browser tab loading url (http/https only; other schemes are rejected). The new tab is added to your pinned tab list automatically; call focus_tab(newTabId) next iteration to operate on it. Always high — each call requires user confirmation. Pass active=true only if the user explicitly wants the tab foregrounded.
```

整段删除，替换为简短的执行注意事项段：
```
Tool semantics:
- list_tabs scope=currentWindow (default) returns tabs in the current window. scope=allWindows includes every window — use only when explicitly needed.
- close_tabs / group_tabs / ungroup_tabs / move_tabs accept arrays — batch into ONE call rather than looping per tab id.
- get_tab_content reads the visible page text of the target tab.
- activate_tab brings a tab to foreground but does NOT change the agent's pinned tab — subsequent click/type tools still target the original pin.
- open_url(url, active?) opens a new browser tab. Only http/https URLs are accepted (other schemes are rejected by the handler). The new tab is added to your pinned tab list automatically; call focus_tab(newTabId) next iteration to operate on it. Pass active=true only if the user explicitly wants the tab foregrounded.
```

- [ ] **Step 6: 删 TAB_TOOLS_GUIDANCE L60**

定位：
```
- Refusing to act repeatedly: if the user rejects the same tool 3 times in a row, the loop terminates the task. Don't keep proposing the same operation after a reject.
```

整条删除（K-10 已在 Task 1 删除）。

- [ ] **Step 7: 改写 prompt.test.ts 相关断言**

```bash
grep -n "approval\|approve\|reject\|confirm\|3 times" src/lib/agent/prompt.test.ts
```

每个 hit 涉及的 `expect(...).toContain(...)` / `toMatch(...)`：
- 断言 "user approval" / "confirm card" / "3 times in a row" 的：删除
- 断言 untrusted wrapper / fail safely / credential safety 的：保留 ✓
- 加新断言：`expect(prompt).toContain("execute directly")` 锁住新文案

- [ ] **Step 8: Run prompt tests**

```bash
pnpm test src/lib/agent/prompt.test.ts
```

Expected: 全 pass。

- [ ] **Step 9: Build**

```bash
pnpm build
```

Expected: success。

- [ ] **Step 10: Commit**

```bash
git add src/lib/agent/prompt.ts src/lib/agent/prompt.test.ts
git commit -m "refactor(prompt): remove confirm/approval references; tab tools guidance simplified"
```

---

## Task 10: 全套 acceptance + manual smoke

**Files:** 不修改代码，仅验证

- [ ] **Step 1: 全套 unit + integration test**

```bash
pnpm test
```

Expected: 全 pass。如有 fail，逐个 fix 再 commit。

- [ ] **Step 2: Build**

```bash
pnpm build
```

Expected: success。`risk.ts` build-time invariant 已删，无新 throw。

- [ ] **Step 3: Final grep audit — 应 0 hit**

```bash
grep -rn "classifyRisk\|RiskAssessment\|RiskLevel\|hasCrossOriginTab\|sendConfirmRequest\|pendingConfirmations\|confirmRejections\|CONFIRM_REJECT_THRESHOLD\|isSkipPermissionsEnabled\|setSkipPermissionsEnabled\|AgentConfirmRequestMessage\|AgentConfirmResponseMessage\|AgentConfirmCard\|tabTargets\|metaSkillPreview" src/ --include="*.ts" --include="*.tsx"
```

Expected: 0 hits（除了本 spec/plan 自己 + 可能的 release notes — 这些不在 src/ 内）。

```bash
grep -rn "skip_permissions\|skipPermissions" src/ --include="*.ts" --include="*.tsx"
```

Expected: 仅剩 `cleanupLegacySkipPermissions` 函数 + migration test 内的 storage key string `"skip_permissions_enabled"`。

```bash
grep -rin "approval\|requires user confirm\|3 times in a row" src/lib/agent/prompt.ts
```

Expected: 0 hits。

- [ ] **Step 4: Manual smoke — chrome://extensions reload + 5 个核心场景**

```bash
pnpm dev
# Reload extension at chrome://extensions/, open side panel
```

跑 5 个场景，每个验证"无 confirm card 弹出 + tool 直接 execute + agent-step 显示完整 args/result"：

1. **CDP keyboard**：在 Notion / Feishu Docs 输入多段文字（ex-high `dispatch_keyboard_input`）
2. **close_tabs**：让 LLM 关掉一个非 pinned tab（ex-high cross-origin args）
3. **get_tab_content**：让 LLM 读 pinned tab 同 origin 内容（ex-high always-high）
4. **screenshot**：让 LLM `capture_visible_tab`（ex-high screenshot）
5. **open_url**：让 LLM 开新 tab https://example.com（ex-high 并新加 pin）

也额外验证：
6. **R10 first-run-skill confirm 仍工作**：让 LLM `create_skill`（不弹 create confirm）→ skill 第一次执行时仍弹 first-run confirm
7. **URL allow-list 仍工作**：让 LLM `open_url("javascript:alert(1)")` → handler 拒
8. **Origin lock hard stop 仍工作**：在 task 跑到一半时 panel 用户手动跳 origin → loop emit done fail
9. **Cross-session lock 仍工作**：开两个 session 各 pin 不同 tab → 互相不能 mutate

- [ ] **Step 5: 设置页验证**

打开 Settings：确认无 skip-permissions toggle；其他设置项（instances / sessions / about）正常。

- [ ] **Step 6: Storage migration 验证**

```bash
# In Chrome DevTools console (extension context):
chrome.storage.local.get("skip_permissions_enabled", (r) => console.log(r))
```

Expected: `{}` 空对象（key 已被 startup 清理）。

如果之前有老用户开过 toggle，第一次启动新版后应该就清掉了。

- [ ] **Step 7: Commit acceptance marker**

```bash
git commit --allow-empty -m "chore: confirm-layer removal acceptance — 9 manual scenarios + grep audit pass"
```

---

## Task 11: 写 release notes

**Files:**
- Create: `docs/release-notes/v0.X.0.md`（X 取决于当前版本，看 `manifest.json` / `package.json` 决定下一版号）
- Modify: `docs/ROADMAP.md`（关闭 §13 P2 #45-6 + skip-permissions 相关 backlog 项）

- [ ] **Step 1: 决定版本号**

```bash
grep '"version"' manifest.json package.json
```

按当前版本 + 1 minor（这是 breaking 改动，按 SemVer 实际应 major，但 Pie 处于 0.X 阶段，minor bump 是 convention）。

- [ ] **Step 2: 写 release note**

新建 `docs/release-notes/v0.X.0.md`：

```markdown
# v0.X.0 — Confirm Layer Removed

## Breaking Change

本版起 Pie 不再为任何 tool call 弹出 confirm 卡片。原 `Settings → 跳过权限确认` toggle 已移除（无论之前是开还是关，新版统一行为）。

**为什么：** 多数内置工具不构成 OS 级危险，CDP keyboard 也是用户主动启动 task 时才生效（黄条仍亮）。informed-approval confirm 在日常使用中是最高频摩擦。

**保留的护栏：**

- Skill 第一次执行仍需 confirm（防 LLM 静默写入 skill 后立即误用）
- `<untrusted_*>` wrapper system prompt 软防御 prompt injection
- `open_url` URL allow-list（仅 http/https）
- 跳到 `chrome://` / `chrome-extension://` / `file://` 的 pinned tab 仍硬停
- 不同 session 之间的 pinned tab 互相不能 mutate

**用户应注意：**

- LLM tool call 直接执行，建议在 panel 滚动看 agent-step（默认收起，点开看 args / 结果）
- 不可逆动作（删除 / 提交 / 支付）由 LLM 自律 + agent-step 事后审计承担
- 若 LLM 行为偏离预期，按 Stop 按钮中止（panel 顶部 yellow bar）

## Migration

- 老 `skip_permissions_enabled` 设置自动清除
- 现有 session / skill / instance 不受影响
```

- [ ] **Step 3: 改 ROADMAP**

`docs/ROADMAP.md`：

- §13 P2 #45-6 "reject-3-strikes 软化"标 ✅ SHIPPED 2026-05-08（升级为彻底删 confirm 层）
- §推荐推进顺序 第一梯队 #1 同上标 SHIPPED
- §推荐推进顺序 已交付路径列表追加：`✅ Confirm 层彻底删除（§13 P2 #45-6 升级版）— 2026-05-08`
- 受影响的 backlog 项关闭：§13 P2 #44-9 业务按钮语义风险（confirm 删后该项失效）+ #45-7 凭据场景 pause/resume（同样依赖 confirm，可在新模型下重新评估或关闭）

注：`#45-7 凭据 pause/resume` 的合理性其实仍存在（登录墙场景与 confirm 不直接相关），保留 backlog 但 review 描述。

- [ ] **Step 4: Commit**

```bash
git add docs/release-notes/v0.X.0.md docs/ROADMAP.md
git commit -m "docs: v0.X.0 release notes (confirm layer removed) + ROADMAP update"
```

- [ ] **Step 5: 版本 bump**

```bash
# 编辑 manifest.json + package.json 把 version bump 到 0.X.0
```

```bash
git add manifest.json package.json
git commit -m "chore(release): bump version to 0.X.0"
```

---

## Self-Review

### Spec coverage
- ✅ Section 1 删除清单 → Task 3 (loop confirm) / Task 4 (SW) / Task 5 (panel) / Task 6 (messages.ts) / Task 7 (risk.ts) / Task 8 (skip-permissions)
- ✅ Section 2 保留防御层 → manual smoke Step 4 第 6-9 项验证 R10 / URL allow-list / Origin lock / Cross-session lock 仍工作
- ✅ Section 3 prompt.ts 6 处 → Task 9 逐条
- ✅ Section 4 Migration → Task 4 storage cleanup + Task 8 silent drop SessionMeta 字段 + Task 11 release notes
- ✅ Section 5 测试影响 → 各 Task 内分散覆盖（删 / 改写 / 新加）

### Placeholder scan
- 各 Task Step 都有具体命令 / 代码 / 期望输出
- "如 grep hit" 的条件性步骤已显式列 grep 命令 + 决策依据，不是 TODO
- Manual smoke 9 个场景具体可操作

### Type consistency
- `cleanupLegacySkipPermissions` 函数名在 Task 4 Step 3 / Task 10 Step 6 一致
- Storage key `"skip_permissions_enabled"` 在 Task 4 / Task 10 一致
- `AgentConfirmRequestMessage` / `AgentConfirmResponseMessage` 在 Task 6 / pre-flight grep 一致
- `RiskAssessment` / `RiskLevel` / `classifyRisk` 在 Task 3 / Task 7 / pre-flight grep 一致

### 已知 Open Question 提示
- Task 7 Step 5：`tabs.ts` 内 `contentPreview` 字段定义可能仍在 — 实施时 grep 决定是否清
- Task 8 Step 4：SessionMeta `skipPermissions` 字段是否存在 — 实施时 grep 决定
- 这些都不是 placeholder，是依赖代码当前实际状态的决策点，每条都给了 grep 命令 + 决策依据
