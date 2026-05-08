---
date: 2026-05-08
topic: remove-confirm-layer
status: brainstormed
related:
  - docs/ROADMAP.md  # §13 P2 #45-6（"reject-3-strikes 软化"原条目；本 spec 把它升级为彻底删 confirm 层）
  - src/lib/agent/risk.ts  # 当前 risk classifier，本 spec 整层删除
  - src/lib/agent/loop.ts  # confirm 调用点 + K-10 reject-side fatigue
  - src/lib/agent/prompt.ts  # KEYBOARD_SIM_GUIDANCE / META_TOOL_GUIDANCE / TAB_TOOLS_GUIDANCE confirm 表述
  - src/background/index.ts  # pendingConfirmations + agent-confirm-request 路由
  - src/sidepanel/components/AgentConfirmCard.tsx  # confirm UI 组件
  - src/sidepanel/components/Settings.tsx  # skip-permissions toggle UI
  - src/lib/skip-permissions.ts  # 当前 toggle storage helper
  - https://github.com/WiseriaAI/Pie/issues/26  # 原 skip-permissions toggle PR（本 spec 把它从 opt-in 变成默认行为后整层删除）
---

# Remove Confirm Layer

## Problem Frame

当前 Pie 在 LLM 每次发起 high-risk tool call 时弹 informed-approval confirm card：

- `dispatch_keyboard_input` / `press_key`（CDP keyboard）— 永远 high
- `create_skill` / `update_skill` — 永远 high
- `capture_visible_tab` / `capture_fullpage_tab`（screenshot）— 永远 high
- `close_tabs` / `group_tabs` / `ungroup_tabs` / `move_tabs` — 永远 high
- `get_tab_content` — 永远 high（含同 origin）
- `open_url` — 永远 high
- `activate_tab` cross-origin / `list_tabs` allWindows — 条件 high
- `type` 命中 password/OTP/支付字段 — 条件 high
- `click` / `select` 命中 submit button / 关键字 — 条件 high
- 任何 tab 工具命中非 pinned tab（cross-origin args）— 条件升级 high

每次 high call 用户必看一眼并 approve / reject。issue #26 (PR #26, 2026-05-06) 加了全局 `skip-permissions` toggle 让信任 LLM 的用户主动跳过。

实际使用反馈：confirm 摩擦是**日常最高频痛点**。多数内置工具不构成 OS 级危险，CDP keyboard 也是用户主动启动 task 时才生效（黄条仍亮）。`skip-permissions` toggle 已存在并被部分用户长期开启 — 证明"信任 LLM + 删摩擦"范式可行。

ROADMAP §13 P2 #45-6 原条目是"软化 reject-3-strikes"（拒同一 tool 3 次直接 abort task），但 brainstorm 过程中发现：与其在 confirm 内调参（threshold / observation 文案 / 计数语义），不如**彻底删 confirm 层**，让 reject-3-strikes 这个 backlog 自然消失。

## Decisions Locked During Brainstorm

1. **方向 A — 0 条硬边界**。所有 risk classifier 路径删除；任何 tool call 不经 user gate 直接执行。
2. **`skip-permissions` toggle 整层删除**，**不**提供反向 `requireAllConfirms` toggle — 简化为单一行为，不再有用户配置。
3. **K-10 reject-3-strikes（confirmRejections / CONFIRM_REJECT_THRESHOLD）整段删除** — 无 confirm 即无 reject 概念。
4. **R10 first-run-skill confirm 保留** — skill 第一次执行时仍 confirm（与 `risk.ts` 解耦，是 skill 系统单独的二次审查机制；`create_skill` / `update_skill` 删 confirm 后这是天然第二道）。
5. **R15 untrusted wrapper 保留** — `<untrusted_page_content>` / `<untrusted_tab_metadata>` / `<untrusted_skill_params>` 是 prompt injection 的唯一软防御层。
6. **Handler 层硬锁保留**：
   - `open_url` 的 `protocol === 'http:' || 'https:'` allow-list
   - Restricted URL hard stop（chrome:// / chrome-extension:// / file://）
   - R7 cross-session lock（别 session 已 pin 的 tab 拒）
   - R14 fail-on-image precondition
   - `<all_urls>` host_permission（base 能力）
   - CDP 黄条（Chrome 原生）
7. **agent-step UI 不动** — 默认收起 + 手动展开是用户认可的现状（不在 spec scope 加强）。Stop 按钮 + yellow-bar cancel 是删 confirm 后用户唯一的 inline 干预路径，保留现状。
8. **Migration silent drop** — 老 `skip_permissions_enabled` storage key 启动时清除；不写 fallback / 不弹通知（同 V1→V2 baseUrl drop pattern）。

## Architecture Changes

### Section A — 删除清单

| 层 | 文件 / 范围 | 处理 |
|---|---|---|
| Risk classifier | `src/lib/agent/risk.ts` | 整文件删除（含 `classifyRisk` / `hasCrossOriginTab` / `ALWAYS_HIGH_*` / `DANGEROUS_KEYWORD_RE` / `isSensitiveInputTarget`）；上游 import 全删 |
| Risk types | `src/lib/agent/types.ts` 中 `RiskAssessment` / `RiskLevel` / `ResolvedElement`（如 confirm-only）| 删除未被复用的类型；如 `ResolvedElement` 仍被 agent-step 渲染用，保留 |
| Loop confirm 路径 | `src/lib/agent/loop.ts` | 删 `sendConfirmRequest` 调用 + `confirmResult.approved` 分支 + `pre-capture-failed` 处理 + `tabTargets` / `contentPreview` 计算 + origin-change confirm；tool call 改为直接 dispatch handler |
| Loop K-10 fatigue | `src/lib/agent/loop.ts:1237-2058` 范围 | 删 `confirmRejections` Map + `CONFIRM_REJECT_THRESHOLD` + 同 tool name 累计计数 + fatigue abort emit done 分支 |
| Loop origin-change confirm | `src/lib/agent/loop.ts` `handleOriginChange` | issue #33 follow-up 把 origin-change 改成 user confirm 的逻辑改回 hard-stop（emit done 直接 fail）— 与 restricted URL 一致；origin lock 仍是不可绕的 invariant，但用户失去"approve"路径，需 verify 这与"信任 LLM"模型一致 |
| SW confirm 路由 | `src/background/index.ts` | 删 `pendingConfirmations` Map + `agent-confirm-request` 发送 + `agent-confirm-response` 接收 + flood-limit + abort drain；`AgentConfirmRequestMessage` / `AgentConfirmResponseMessage` 类型删除 |
| Panel confirm UI | `src/sidepanel/components/AgentConfirmCard.tsx` + `useSession.ts` confirm handler | 整删；`DisplayMessage` 类型中 `confirm-request` 分支删除 |
| Settings UI | `src/sidepanel/components/Settings.tsx` | 删 skip-permissions toggle UI 段落 |
| skip-permissions helper | `src/lib/skip-permissions.ts` + `src/lib/skip-permissions.test.ts` | 整文件删除 |

### Section B — 保留的防御层（删 confirm 后剩余护栏）

| # | 层 | 形式 |
|---|---|---|
| 1 | Untrusted wrapper（软防御） | `<untrusted_page_content>` / `<untrusted_tab_metadata>` / `<untrusted_skill_params>` system prompt 提示 |
| 2 | URL allow-list（硬锁） | `open_url` handler 强制 `protocol === 'http:' || 'https:'` |
| 3 | Restricted URL hard stop | pinned tab navigate 到 chrome:// / chrome-extension:// / file:// → loop emit done fail，不可绕 |
| 4 | Origin lock hard stop | pinned tab origin 切换 → loop emit done fail（删除 confirm 路径后回到 hard stop） |
| 5 | R7 cross-session lock | 别 session 已 pin 的 tab，本 session 工具拒 |
| 6 | R10 first-run-skill confirm | skill 第一次执行时仍 confirm（独立机制，不在 risk.ts） |
| 7 | R14 fail-on-image precondition | paused task resume 时 image cache 已 evict → fail |
| 8 | `<all_urls>` host_permission | manifest 级 base 能力 |
| 9 | CDP 黄条 | Chrome 浏览器原生提示 |
| 10 | agent-step UI 事后审计 | 用户在 panel 看每个 tool call 的 args + result（默认收起 + 手动展开）|
| 11 | Stop 按钮 / yellow-bar cancel | 删 confirm 后用户唯一 inline 干预路径 |

### Section C — `prompt.ts` 改动

| 位置 | 改动 |
|---|---|
| `KEYBOARD_SIM_GUIDANCE` L26 | 删 `requires user approval`，改为 `(yellow bar visible)` |
| `KEYBOARD_SIM_GUIDANCE` L28 | 删 `every extra tool call requires the user to approve again` 整句 |
| `META_TOOL_GUIDANCE` L38 | 删 `Each call to create_skill / update_skill requires user confirmation`；保留 `the skill's first execution requires another confirmation`（R10 first-run-confirm 仍在）|
| `TAB_TOOLS_GUIDANCE` L45 | 删 `The user sees an informed-approval confirm card listing every affected tab before any high-risk call lands` 整句 |
| `TAB_TOOLS_GUIDANCE` L47-52 | 删整个 "Risk model" 段（high/low/confirm 概念全消失），保留各 tool 用途说明（重写为简短"Tab tools execute directly"+ scope 默认值 + open_url URL 限制） |
| `TAB_TOOLS_GUIDANCE` L60 | 删 `Refusing to act repeatedly: if the user rejects the same tool 3 times in a row, the loop terminates the task` 整条 |

**不动**：
- `STATIC_AGENT_SYSTEM_PROMPT` L10 untrusted wrapper 防御
- `STATIC_AGENT_SYSTEM_PROMPT` L13 `If you are uncertain, prefer to fail safely rather than take irreversible actions`（LLM 自律提示，非 confirm）
- `META_TOOL_GUIDANCE` L41 `update_skill ... re-confirm on next execution`（R10 仍在）
- `TAB_TOOLS_GUIDANCE` L54-56 untrusted wrapper 段
- `TAB_TOOLS_GUIDANCE` L58-59 `close_tabs cannot close pinned tab`
- `TAB_TOOLS_GUIDANCE` L62-63 credential safety 段

## Migration

| 维度 | 处理 |
|---|---|
| `skip_permissions_enabled` storage key | SW startup 时 `chrome.storage.local.remove("skip_permissions_enabled")`；不写 fallback、不弹通知 |
| `instance.skipPermissions` 字段（如有）| 实施时 grep；如 instance schema 含此字段，silent drop（同 V1→V2 baseUrl drop pattern） |
| In-flight task 持有 confirm 等待 | 启动时 SW 已清理 `pendingConfirmations`（现有逻辑）；新版本上线后此 Map 永远空 |
| Session checkpoint 含 confirm 状态 | 实施时检查 checkpoint schema；如有 confirm 字段，silent drop |
| 设置页 UI | "Permissions" 整段移除（不留 placeholder note，避免视觉空段）|
| Release notes | 标记本版为 breaking — 明示"所有工具不再弹 confirm，原 skip-permissions 设置失效"；避免用户以为是 bug |

## Test Impact

### 删除（confirm 路径专测）

- `src/lib/agent/risk.test.ts` 整文件
- `src/lib/skip-permissions.test.ts` 整文件
- `src/lib/agent/loop.test.ts` 内 confirm 路径相关 case：K-10 reject-side / cross-origin escalation / submit-button / 关键字 / sensitive field / origin-change confirm
- `src/lib/agent/cross-layer.test.ts` 内 confirm-request → confirm-response 透传 case
- `src/background/abort-rotation.test.ts` 内 user-reject vs aborted 区分相关 case（abort-rotation 本身保留，相关断言改写为不依赖 user-reject 概念）
- panel `AgentConfirmCard.test.tsx`（如有）+ `useSession.confirm.test.ts`（如有）
- SW `pendingConfirmations` flood-limit / abort drain test（如有）

### 保留 / 改写

- `loop.test.ts` 主流程：把 confirm 路径移除后，tool execution path 直走，断言无 `agent-confirm-request` 消息发出
- skill first-run-confirm test（R10）：保留
- URL allow-list test：保留
- Restricted URL hard stop test：保留
- Origin lock test：从"confirm card 弹出"改回"emit done fail"

### 新加

1. **Cross-layer regression**：发原 high tool（`dispatch_keyboard_input` / `close_tabs` / `get_tab_content` / `capture_visible_tab` / `open_url`）→ 断言 SW 无 `agent-confirm-request` emit + tool 直接 execute → result observation 流回 panel agent-step（按 memory cross-layer integration test 模板：跨层 wire 改动必加 wire→DisplayMessage 透传 regression）
2. **Setting migration**：startup 时 `skip_permissions_enabled` storage key 被清除

## Spec Pre-Audit（实施前应做）

实施时先 grep 出完整影响面再开始改：

- `grep -rn "skip_permissions\|skipPermissions\|skip-permissions" src/`
- `grep -rn "classifyRisk\|RiskAssessment\|RiskLevel" src/`
- `grep -rn "agent-confirm-request\|agent-confirm-response" src/`
- `grep -rn "pendingConfirmations\|confirmRejections\|CONFIRM_REJECT_THRESHOLD" src/`
- `grep -rn "AgentConfirmCard\|tabTargets\|contentPreview\|metaSkillPreview" src/`
- `grep -rn "user-reject\|flood-limit\|pre-capture-failed" src/`

每个 hit 列表都要在 plan 阶段拆成具体修改任务。

## Out of Scope

- agent-step UI 加强（args 默认全展开 / 错误高亮 / cross-origin 视觉提权 / Stop 按钮提权）— 当前 default-collapsed + 手动展开是用户认可的现状
- 反向 `requireAllConfirms` toggle — 用户明确不要
- 引入新的 prompt-injection 防御机制（如 LLM 输出二次过滤、tool call 静态分析）— 仍只靠 R15 wrapper
- 业务关键字识别加强（ROADMAP §13 P3 #44-9）— 删 confirm 层后该 backlog 项自然失效
- "informed approval" 的替代 UX（如 Slack 风格的 inline retro 卡）— 本 spec 不引入新 UX surface
- ROADMAP §13 P2 #45-6 "reject-3-strikes 软化"原条目 — 被本 spec 升级吸收，关闭原 backlog 项

## Risks & Open Questions

### 可接受风险（用户已评估）

1. **Prompt injection 攻击 LLM 调 high-impact tool** — 删 confirm 后唯一软防御是 R15 wrapper。最严重情景：恶意 page 注入指令让 LLM 调 `get_tab_content` 跨 tab 读银行/支付页凭据 → BYOK provider 数据已发不可逆。用户已明示接受此 trade-off。
2. **LLM 误判调 `click` 命中"删除 / 提交 / 支付"按钮** — 业务关键字 heuristic 删除后无 inline 拦截；用户须在 agent-step UI 事后看到 + Stop 按钮中止。
3. **LLM 静默 `create_skill` 写持久化** — R10 first-run-confirm 仍在，下次执行用户会看到；首次写入静默接受。

### 实施期 open questions

1. **Origin lock 回退**：`handleOriginChange` 改回 hard stop 后，原 issue #33 "panel 用户主动跳 origin 想让 agent 跟着"的场景失去支持。是否在 spec scope 加新机制（如 LLM 主动调 `relock_origin` tool）— 本 spec 倾向 punt 到后续，先确认无回归。
2. **R10 first-run-skill confirm 是否独立成立** — 需读 `src/lib/skills/` 验证 R10 的实现是否依赖 `risk.ts` 任何符号；如依赖，需 detangle。
3. **`ResolvedElement` 类型** — agent-step 渲染用，confirm 也用。删 confirm 后该类型仍被 agent-step 引用；保留位置可能从 risk.ts 移到 types.ts。

## Acceptance

- 任何 tool call 不再产生 `agent-confirm-request` 消息（cross-layer regression test 断言）
- `risk.ts` / `skip-permissions.ts` / `AgentConfirmCard.tsx` 文件不再存在（grep 验证）
- 设置页无 skip-permissions UI（手测）
- LLM prompt 里不再出现 "approval" / "approve" / "reject" / "confirm card" 字样（grep prompt.ts 验证）
- 老用户 storage 内 `skip_permissions_enabled` 自动清除（migration test 断言）
- skill first-run-confirm（R10）/ URL allow-list / restricted URL / origin lock hard stop / cross-session lock 全部仍工作（保留 test 通过）
