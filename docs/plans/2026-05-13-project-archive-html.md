# Project Archive HTML Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build a single-file static HTML knowledge base at `docs/archive/index.html` archiving the Chrome AI Agent project's 10 subsystems + 2 cross-cuts (Confirm-removed evolution, Phase timeline).

**Architecture:** One HTML file with inline `<style>` and `<script>`. Vanilla JS, hash-routing, zero deps. Reuses `src/sidepanel/index.css` `--c-*` design tokens. Data lives in a `archiveData` array inside the script — easy to edit.

**Tech Stack:** Plain HTML5 + CSS3 (custom properties + grid) + ES2020 vanilla JS. No build step, no CDN, no font download. Inline SVG for diagrams.

**Source of truth for content:** `docs/ROADMAP.md`, `docs/solutions/*.md`, `docs/specs/*.md`, `CLAUDE.md`, `src/lib/**`.

**Commits:** This plan does NOT include commit steps. Per repo convention, the user commits when ready. Stop after the last task and ask.

**Spec reference:** `docs/specs/2026-05-13-project-archive-html-design.md`

---

## File Structure

| Path | Purpose |
|---|---|
| `docs/archive/index.html` | The single deliverable. ~1500 lines. Contains skeleton HTML + inline `<style>` (tokens + layout + components) + inline `<script>` (data + render + interactions). |

No other files created or modified.

---

## Task 1: File skeleton + design tokens

**Files:**
- Create: `docs/archive/index.html`

**Reference:** `src/sidepanel/index.css` for `--c-*` token values (light root + `[data-theme="dark"]`).

- [ ] **Step 1: Create directory + empty file**

```bash
mkdir -p docs/archive
touch docs/archive/index.html
```

- [ ] **Step 2: Write the full skeleton + tokens + base reset**

Write to `docs/archive/index.html`:

```html
<!doctype html>
<html lang="zh-CN" data-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pie · Project Archive</title>
  <style>
    :root {
      --c-canvas: #FAFBFC;
      --c-surface: #FFFFFF;
      --c-field: #F4F6F8;
      --c-line: #E4E8EC;
      --c-fg-1: #14181D;
      --c-fg-2: #5A6470;
      --c-fg-3: #98A1AC;
      --c-fg-4: #B8BFC8;
      --c-accent: #4A5C6E;
      --c-warning: #B85A4D;
      --c-dot-grid: rgba(20, 24, 29, 0.04);
      --c-accent-tint: rgba(74, 92, 110, 0.08);
      --c-accent-line: rgba(74, 92, 110, 0.3);
      --c-warning-tint: rgba(184, 90, 77, 0.08);
      --c-warning-line: rgba(184, 90, 77, 0.4);
      --c-surface-deep: #F0F2F4;
      --c-overlay-strong: rgba(20, 24, 29, 0.5);
    }
    [data-theme="dark"] {
      --c-canvas: #0B0D10;
      --c-surface: #14171C;
      --c-field: #1A1E25;
      --c-line: #22272F;
      --c-fg-1: #E5E8EC;
      --c-fg-2: #8A929E;
      --c-fg-3: #525965;
      --c-fg-4: #3A4049;
      --c-accent: #B8C8D6;
      --c-warning: #C26B5E;
      --c-dot-grid: rgba(232, 236, 242, 0.05);
      --c-accent-tint: rgba(184, 200, 214, 0.08);
      --c-accent-line: rgba(184, 200, 214, 0.3);
      --c-warning-tint: rgba(194, 107, 94, 0.08);
      --c-warning-line: rgba(194, 107, 94, 0.45);
      --c-surface-deep: #0F1216;
      --c-overlay-strong: rgba(8, 13, 16, 0.72);
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; height: 100%; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
        "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      font-size: 14px;
      line-height: 1.55;
      color: var(--c-fg-1);
      background-color: var(--c-canvas);
      background-image: radial-gradient(var(--c-dot-grid) 1px, transparent 1px);
      background-size: 14px 14px;
    }
    code, .mono {
      font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <!-- layout shell goes in next task -->
  <script>
    // archiveData + render + interactions go in later tasks
  </script>
</body>
</html>
```

- [ ] **Step 3: Verify in browser**

Open `docs/archive/index.html` in a browser (drag into Chrome).
Expected: blank canvas-colored page with dot-grid, no console errors. Toggle DevTools "Emulate dark theme" → confirm `--c-canvas` darkens via DevTools `html` element add `data-theme="dark"`.

---

## Task 2: Layout shell (top bar + left index + right panel)

**Files:**
- Modify: `docs/archive/index.html` — add to `<style>` and replace body content.

- [ ] **Step 1: Add layout CSS to `<style>`**

Append before `</style>`:

```css
.app {
  display: grid;
  grid-template-rows: 48px 1fr;
  height: 100vh;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid var(--c-line);
  background: var(--c-surface);
}
.topbar .brand {
  font-weight: 600;
  font-size: 14px;
  letter-spacing: 0.01em;
}
.topbar .brand .sep { color: var(--c-fg-3); margin: 0 8px; }
.topbar .meta { color: var(--c-fg-2); font-size: 12px; }
.topbar .actions { display: flex; gap: 8px; align-items: center; }
.topbar button {
  background: transparent;
  border: 1px solid var(--c-line);
  color: var(--c-fg-2);
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
}
.topbar button:hover { background: var(--c-accent-tint); color: var(--c-fg-1); }
.topbar .kbd {
  font-family: ui-monospace, monospace;
  font-size: 11px;
  background: var(--c-field);
  padding: 2px 6px;
  border-radius: 3px;
  color: var(--c-fg-2);
}
.main {
  display: grid;
  grid-template-columns: 220px 1fr;
  min-height: 0;
}
.sidebar {
  border-right: 1px solid var(--c-line);
  background: var(--c-surface);
  overflow-y: auto;
  padding: 16px 0;
}
.sidebar h4 {
  margin: 12px 16px 8px;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--c-fg-3);
  font-weight: 600;
}
.sidebar nav { display: flex; flex-direction: column; }
.sidebar nav a {
  padding: 6px 16px 6px 20px;
  color: var(--c-fg-2);
  text-decoration: none;
  border-left: 2px solid transparent;
  font-size: 13.5px;
}
.sidebar nav a:hover { background: var(--c-accent-tint); color: var(--c-fg-1); }
.sidebar nav a.is-active {
  background: var(--c-accent-tint);
  color: var(--c-fg-1);
  border-left-color: var(--c-accent);
}
.sidebar .phase-strip {
  margin: 16px;
  padding: 10px 12px;
  border: 1px solid var(--c-line);
  border-radius: 4px;
  font-size: 11px;
  color: var(--c-fg-3);
  font-family: ui-monospace, monospace;
  letter-spacing: 0.04em;
}
.panel {
  overflow-y: auto;
  padding: 32px 40px 80px;
  max-width: 920px;
}
.panel header h1 {
  margin: 0 0 4px;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.panel header .tags {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  margin-bottom: 24px;
}
.panel header .tag {
  font-family: ui-monospace, monospace;
  font-size: 11px;
  padding: 2px 7px;
  border: 1px solid var(--c-accent-line);
  color: var(--c-accent);
  border-radius: 3px;
}
.section {
  margin-bottom: 28px;
}
.section > .label {
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--c-fg-3);
  font-weight: 600;
  margin-bottom: 8px;
}
.section > .body { color: var(--c-fg-1); }
.bullet {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 12px;
  padding: 6px 8px;
  border-radius: 3px;
}
.bullet .k { color: var(--c-fg-3); font-size: 12px; padding-top: 1px; }
.bullet code { color: var(--c-fg-1); }
.bullet.is-flow-hover { background: var(--c-accent-tint); }
.why-item {
  padding: 8px 0;
  border-top: 1px solid var(--c-line);
}
.why-item:first-child { border-top: none; }
.why-item .decision { font-weight: 500; }
.why-item .rationale { color: var(--c-fg-2); margin-top: 4px; }
.invariants-toggle {
  cursor: pointer;
  user-select: none;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--c-fg-3);
  font-weight: 600;
  margin-bottom: 8px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.invariants-toggle:hover { color: var(--c-fg-1); }
.invariants-list {
  display: none;
  border-top: 1px solid var(--c-line);
}
.invariants-list.is-open { display: block; }
.invariant {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 12px;
  padding: 6px 0 6px 10px;
  border-bottom: 1px solid var(--c-line);
  border-left: 2px solid var(--c-accent-line);
  font-size: 13px;
}
.invariant .tag {
  font-family: ui-monospace, monospace;
  font-size: 11px;
  color: var(--c-accent);
}
```

- [ ] **Step 2: Replace body content with layout shell**

Replace the `<body>` content (between `<body>` and `<script>`) with:

```html
  <div class="app">
    <header class="topbar">
      <div class="brand">
        Pie<span class="sep">·</span>Project Archive
        <span class="sep">·</span>
        <span class="meta">v0.8.0 · 2026-05-13</span>
      </div>
      <div class="actions">
        <button id="search-btn" title="Search (/)">/ <span class="kbd">search</span></button>
        <button id="theme-btn" title="Toggle theme">☼</button>
      </div>
    </header>
    <div class="main">
      <aside class="sidebar">
        <h4>Subsystems</h4>
        <nav id="nav-subsystems"></nav>
        <h4>Cross-cuts</h4>
        <nav id="nav-crosscuts"></nav>
        <div class="phase-strip" id="phase-strip">0 · 1 · 2 · 2.5 · 2.6 · 3 · 4 · 5 · v1.5</div>
      </aside>
      <main class="panel" id="panel">
        <div style="color: var(--c-fg-3);">loading…</div>
      </main>
    </div>
  </div>
```

- [ ] **Step 3: Verify in browser**

Open file. Expected: top bar with brand + version + buttons. Left sidebar with two empty `<nav>` placeholders and phase strip. Right panel shows "loading…". No console errors.

---

## Task 3: Subsystem data array (the heavy lift)

**Files:**
- Modify: `docs/archive/index.html` `<script>` block.

This task writes 12 entries into one `archiveData` array. Content sourced from the repo (paths and tags below are real; verify before writing each entry).

- [ ] **Step 1: Write the array shell + first entry (Agent Loop)**

Inside `<script>`, add:

```js
const archiveData = [
  // --- Subsystems ---
  {
    slug: 'agent-loop',
    kind: 'subsystem',
    title: 'Agent Loop (ReAct)',
    phaseTags: ['P1', 'P2', 'P2.6', 'M3'],
    what: 'ReAct loop on the Service Worker: reason → tool → observe → loop. 一 task 一 mutex。',
    whatLong: 'Agent 任务全在 Service Worker 上跑。每个 task 进 mutex；用户消息走 sidepanel→SW port；模型回流式输出，工具调用拆 ContentBlock IR 在 SW 内部传递，写 storage 时序列化成 string-only ChatMessage。',
    how: [
      { label: '入口', code: 'src/lib/agent/loop.ts → runAgentLoop()' },
      { label: 'prompt 构造', code: 'src/lib/agent/prompt.ts' },
      { label: '工具注册', code: 'src/lib/agent/tools/registry.ts' },
      { label: '滑窗压缩', code: 'src/lib/agent/sliding-window.ts' },
      { label: 'wire type', code: 'AgentMessage (IR) vs ChatMessage (string-only)' },
    ],
    why: [
      { decision: '为什么 ReAct 而不是 plan-and-execute', rationale: '页面状态高度动态，计划在执行前就失效；ReAct 每轮重新观察更稳。' },
      { decision: '为什么 loop 跑在 SW 上而不是 sidepanel', rationale: 'sidepanel 随窗口关闭，SW 才有任务持久性；keep-alive 25s `getPlatformInfo()` 续命。' },
      { decision: '为什么 IR 用 ContentBlock 但 wire 序列化成 string', rationale: '渲染层不应感知 LLM 协议；写盘也只持 raw `agentMessages`，redact 在 panel 渲染时做。' },
    ],
    flow: {
      nodes: [
        { id: 'user', label: 'user msg', x: 40, y: 40 },
        { id: 'reason', label: 'reason', x: 180, y: 40 },
        { id: 'tool', label: 'tool?', x: 320, y: 40 },
        { id: 'exec', label: 'execute', x: 320, y: 130 },
        { id: 'observe', label: 'observe', x: 180, y: 130 },
        { id: 'done', label: 'done', x: 460, y: 40 },
      ],
      edges: [
        { from: 'user', to: 'reason' },
        { from: 'reason', to: 'tool' },
        { from: 'tool', to: 'done', label: 'no' },
        { from: 'tool', to: 'exec', label: 'yes' },
        { from: 'exec', to: 'observe' },
        { from: 'observe', to: 'reason' },
      ],
      bulletMap: { reason: 1, tool: 2, observe: 3, exec: 2 },
    },
    invariants: [
      { tag: 'P3-A', text: 'tabId+origin pinned at task start; re-checked every round' },
      { tag: 'P3-F', text: 'one task = one mutex on SW' },
      { tag: 'M3-U1', text: 'ChatMessage wire = string-only; AgentMessage IR only inside SW' },
      { tag: 'R14', text: 'image input puts task in fail-on-image state if model unsupported' },
    ],
  },
];
```

- [ ] **Step 2: Append Provider × Model Router entry**

Inside `archiveData = [ ... ]`, add as second element:

```js
  {
    slug: 'provider-router',
    kind: 'subsystem',
    title: 'Provider × Model Router',
    phaseTags: ['P1', 'P2', 'P5'],
    what: '8 个 provider 通过 registry + id-keyed dispatch 走统一接口。OpenAI-compat 共享 core，Anthropic/Gemini 走 native。',
    whatLong: 'Provider registry 记录 metadata (capability flags / defaultBaseUrl)；dispatch 按 provider id 路由到对应模块。5 家 OpenAI-compat 走 `_shared/openai-compat-core.ts`。Custom provider 一律 OpenAI-compat。加 provider = registry entry + 模块文件 + manifest host_permission。',
    how: [
      { label: 'registry', code: 'src/lib/model-router/registry.ts' },
      { label: 'dispatch', code: 'src/lib/model-router/providers/index.ts' },
      { label: 'shared core', code: 'src/lib/model-router/providers/_shared/openai-compat-core.ts' },
      { label: 'native', code: 'providers/anthropic.ts · providers/gemini.ts' },
      { label: 'model fetch', code: 'src/lib/openrouter-models-fetch.ts' },
    ],
    why: [
      { decision: '为什么 id-keyed dispatch 而不是 provider 自注册', rationale: 'TypeScript exhaustiveness 检查能锁住；加 provider 走 codepath 必经改 dispatch 表，避免漏。' },
      { decision: '为什么 5 家共享 OpenAI-compat core 而不是各写各的', rationale: '少 5 份 SSE 解析、retry、auth header 重复；OpenRouter 用 hooks 加自家 headers。' },
      { decision: '为什么 baseUrl 锁在 provider 层不让 instance override', rationale: 'V1→V2 migration 静默丢弃用户手填 baseUrl；信任模型只依赖 official endpoint。' },
    ],
    flow: {
      nodes: [
        { id: 'app', label: 'UI', x: 40, y: 60 },
        { id: 'reg', label: 'registry', x: 180, y: 60 },
        { id: 'disp', label: 'dispatch', x: 320, y: 60 },
        { id: 'shared', label: 'oai-compat', x: 460, y: 30 },
        { id: 'native', label: 'native', x: 460, y: 100 },
      ],
      edges: [
        { from: 'app', to: 'reg' },
        { from: 'reg', to: 'disp' },
        { from: 'disp', to: 'shared', label: 'oai' },
        { from: 'disp', to: 'native', label: 'anthropic/gemini' },
      ],
      bulletMap: { reg: 0, disp: 1, shared: 2, native: 3 },
    },
    invariants: [
      { tag: 'P-REG-1', text: 'capability flags (vision/tools/maxContextTokens) 在 ModelMeta per-model 维度' },
      { tag: 'P-REG-2', text: 'custom provider baseUrl 在 provider 层定义；instance 不能 override' },
      { tag: 'P-REG-3', text: 'custom provider 一律走 OpenAI-compat wire（无 hooks）' },
      { tag: 'P-REG-4', text: '`<all_urls>` host_permission 是 custom provider fetch 的前提' },
    ],
  },
```

- [ ] **Step 3: Append Multi-Instance Config entry**

```js
  {
    slug: 'multi-instance',
    kind: 'subsystem',
    title: 'Multi-Instance Config',
    phaseTags: ['P5'],
    what: '同 provider × N 个独立 instance：每个有独立 nickname/model/apiKey。AES-GCM 加密落 chrome.storage.local。',
    whatLong: 'Instance 用 UUID 作 key (`instance_${uuid}`)，索引在 `instances_index`，全局选中走 `active_instance_id`。Session 可 override 当前 instance。Task start 时 SW snapshot ModelConfig 到 checkpoint，中途换 active 不影响 in-flight loop。',
    how: [
      { label: '存储', code: 'src/lib/instances.ts → CRUD on instance_${uuid}' },
      { label: '加密', code: 'src/lib/crypto.ts (Web Crypto AES-GCM)' },
      { label: 'V1→V2 migration', code: 'src/lib/migration-v2.ts (静默丢弃 baseUrl)' },
      { label: '自定义 model 池', code: 'src/lib/provider-custom-models.ts (pcm_${provider})' },
    ],
    why: [
      { decision: '为什么 instance 而不是 provider × model 二维', rationale: '用户可能有 2 把 OpenAI key（个人 + 公司），需要 nickname 区分。Instance 抽象出来后 session 选 instance 比选 provider/model 自然。' },
      { decision: '为什么加密密钥也存 local', rationale: 'BYOK 信任模型 = 本机即信任域；远程同步密钥反而扩攻击面。' },
      { decision: '为什么 task 开始 snapshot ModelConfig 进 checkpoint', rationale: '中途换 instance 不应改变正在跑的 loop 的模型；下一个 task 才用新 config。' },
    ],
    flow: {
      nodes: [
        { id: 'ui', label: 'Settings', x: 40, y: 60 },
        { id: 'inst', label: 'instances_index', x: 180, y: 60 },
        { id: 'enc', label: 'AES-GCM', x: 320, y: 60 },
        { id: 'store', label: 'local storage', x: 460, y: 60 },
      ],
      edges: [
        { from: 'ui', to: 'inst' },
        { from: 'inst', to: 'enc' },
        { from: 'enc', to: 'store' },
      ],
      bulletMap: { inst: 0, enc: 1, store: 0 },
    },
    invariants: [
      { tag: 'P-INST-1', text: 'API keys 用 Web Crypto AES-GCM 加密落 chrome.storage.local' },
      { tag: 'P-INST-2', text: 'V1→V2 migration 静默丢弃老用户手填的 baseUrl' },
      { tag: 'P-INST-3', text: 'task start 时 snapshot ModelConfig；中途改 active 不影响 in-flight loop' },
      { tag: 'P-INST-4', text: 'pcm_${provider} 跨 instance 共享自定义 model id 池' },
    ],
  },
```

- [ ] **Step 4: Append Skills 框架 entry**

```js
  {
    slug: 'skills',
    kind: 'subsystem',
    title: 'Skills 框架',
    phaseTags: ['P2', 'P2.6'],
    what: 'Built-in skill + user CRUD。Skill 解析为 tools subset 注入 prompt。create_skill_from_recording 由 LLM 显式调用。',
    whatLong: 'Skill 类型 + 存储 + builtin + resolveSkillToTools。Scope 当前已解禁；全局 skip-permissions toggle 决定首次执行是否弹 R10 二次 confirm。create_skill 是 meta tool。',
    how: [
      { label: '类型', code: 'src/lib/skills/types.ts' },
      { label: '存储', code: 'src/lib/skills/storage.ts' },
      { label: 'builtin', code: 'src/lib/skills/builtin/' },
      { label: 'resolve', code: 'src/lib/skills/resolve.ts → resolveSkillToTools()' },
      { label: 'meta tool', code: 'src/lib/agent/tools/skill-meta.ts' },
    ],
    why: [
      { decision: '为什么 skill = tool subset 而不是 DSL', rationale: '复用 ReAct 已有的 tool calling 路径；不引入新解释器。' },
      { decision: '为什么 builtin skill 也走 storage 一样的接口', rationale: 'SkillsList UI 不必区分来源；编辑覆盖时 builtin 复本独立。' },
      { decision: '为什么 create_skill_from_recording 走 LLM 而不是直接生成', rationale: '让用户加自由 prompt 改写录制的步骤；LLM 也能填 description/tag。' },
    ],
    flow: {
      nodes: [
        { id: 'list', label: 'SkillsList', x: 40, y: 60 },
        { id: 'res', label: 'resolve', x: 180, y: 60 },
        { id: 'tools', label: 'tools subset', x: 320, y: 60 },
        { id: 'agent', label: 'agent loop', x: 460, y: 60 },
      ],
      edges: [
        { from: 'list', to: 'res' },
        { from: 'res', to: 'tools' },
        { from: 'tools', to: 'agent' },
      ],
      bulletMap: { res: 3, tools: 0, agent: 4 },
    },
    invariants: [
      { tag: 'P2.6-S1', text: 'Skill scope 解禁；全局 skip-permissions toggle 控制 R10 二次 confirm' },
      { tag: 'P2.6-S2', text: 'create_skill / create_skill_from_recording 是 meta tools 走 LLM 调用' },
      { tag: 'P2.6-S3', text: '编辑 skill 直接覆盖；无 version 历史' },
    ],
  },
```

- [ ] **Step 5: Append Sessions entry**

```js
  {
    slug: 'sessions',
    kind: 'subsystem',
    title: 'Sessions / per-session sandbox',
    phaseTags: ['M1', 'M2', 'M3'],
    what: 'Multi-session 持久化 + per-session port + per-session pinnedTabs + ownerToken + cross-session lock。',
    whatLong: 'M1 单 session 持久化 + SW 重启恢复 + R11 drift card。M2 multi-session UI drawer + LLM 标题 + LRU archive + 30d 硬删。M3 per-session port (`chat-stream-${sessionId}`) + per-session pinned tab/origin + R7 cross-session lock + CDP ownerToken `{sessionId, tabId}` + queueTabOp 串行化。',
    how: [
      { label: '状态机', code: 'src/lib/sessions/state-machine.ts' },
      { label: '生命周期', code: 'src/lib/sessions/lifecycle.ts (archive/delete)' },
      { label: '标题', code: 'src/lib/sessions/title.ts (LLM 生成)' },
      { label: 'pinned 注册表', code: 'src/lib/sessions/pinned-tab-registry.ts' },
      { label: 'writeAtomic', code: 'archive/restore 单调用原子写' },
    ],
    why: [
      { decision: '为什么持久化 raw agentMessages 而不是 redacted', rationale: 'LLM resume 需要原始 context；redact 只在 panel 渲染时做。' },
      { decision: '为什么 per-session port 而不是单 port + sessionId 字段', rationale: 'M3 多 session 并发，port 隔离让 sidepanel 端 routing 简单；老 port 死掉不影响其他 session。' },
      { decision: '为什么 ownerToken 是 {sessionId, tabId} 复合', rationale: 'CDP debugger detach 时要确认是自己 attach 的；多 session 共享 tab 时只有发起 session 能 detach。' },
    ],
    flow: {
      nodes: [
        { id: 'panel', label: 'sidepanel', x: 40, y: 60 },
        { id: 'port', label: 'per-session port', x: 200, y: 60 },
        { id: 'sw', label: 'SW dispatch', x: 360, y: 60 },
        { id: 'store', label: 'sessions storage', x: 360, y: 140 },
      ],
      edges: [
        { from: 'panel', to: 'port' },
        { from: 'port', to: 'sw' },
        { from: 'sw', to: 'store' },
      ],
      bulletMap: { port: 1, sw: 0, store: 4 },
    },
    invariants: [
      { tag: 'M1-1', text: 'SW restart 检测未完成 task → 推 resume 卡到 Chat' },
      { tag: 'M3-U2', text: 'per-session port `chat-stream-${sessionId}`' },
      { tag: 'M3-U3', text: 'R7 cross-session lock 串行化 tab 操作' },
      { tag: 'M3-U4', text: 'ownerToken = {sessionId, tabId} 用于 CDP attach/detach 鉴权' },
      { tag: 'M3-U5', text: 'queueTabOp 串行化同 tab 上的并发请求' },
    ],
  },
```

- [ ] **Step 6: Append DOM Actions + CDP Keyboard entry**

```js
  {
    slug: 'dom-cdp',
    kind: 'subsystem',
    title: 'DOM Actions + CDP Keyboard',
    phaseTags: ['P1', 'P2.5'],
    what: 'chrome.scripting.executeScript 注入 self-contained fn；CDP debugger 处理 canvas-based 编辑器键盘。',
    whatLong: 'DOM 操作不走 content script，走 executeScript 一次性注入：闭包不可用，args 通过 executeScript 第二参数。CDP keyboard 专门给 Google Docs / Slides 等 canvas 编辑器用——它们不响应普通 click/keydown。CDP tools 永远 high risk。',
    how: [
      { label: 'DOM 注入', code: 'src/lib/dom-actions/ (一文件一 action)' },
      { label: 'CDP keyboard', code: 'src/lib/agent/tools/keyboard.ts' },
      { label: 'attach/detach', code: 'background/cdp-session.ts (lifecycle)' },
    ],
    why: [
      { decision: '为什么不写 content script', rationale: 'side-panel 常驻；activeTab 不够；`<all_urls>` host_permission + executeScript 更简单。' },
      { decision: '为什么 injected fn 必须 self-contained', rationale: 'executeScript 隔离上下文，闭包变量取不到；args 只能通过参数传。' },
      { decision: '为什么 CDP keyboard 永远 high', rationale: 'debugger API 越权风险大；与 R1/R2 confirm 模型矛盾，所以一律最高。' },
    ],
    flow: {
      nodes: [
        { id: 'agent', label: 'agent loop', x: 40, y: 60 },
        { id: 'exec', label: 'executeScript', x: 200, y: 30 },
        { id: 'cdp', label: 'CDP debugger', x: 200, y: 100 },
        { id: 'page', label: 'target page', x: 360, y: 60 },
      ],
      edges: [
        { from: 'agent', to: 'exec', label: 'DOM' },
        { from: 'agent', to: 'cdp', label: 'canvas' },
        { from: 'exec', to: 'page' },
        { from: 'cdp', to: 'page' },
      ],
      bulletMap: { exec: 0, cdp: 1 },
    },
    invariants: [
      { tag: 'P1-D1', text: 'injected fn 必须 self-contained；args 通过 executeScript 参数传' },
      { tag: 'P2.5-K1', text: 'CDP keyboard tools 永远 high risk' },
      { tag: 'K-8', text: 'verifyConfirmedOrigin bypass 当 confirm 记录不存在（confirm 层删除 post-cleanup）' },
    ],
  },
```

- [ ] **Step 7: Append Cross-Tab entry**

```js
  {
    slug: 'cross-tab',
    kind: 'subsystem',
    title: 'Cross-Tab (Pinned + Origin)',
    phaseTags: ['P3', 'v1.5'],
    what: 'task 开始时 pin tabId+origin。Multi-pin v1.5 加 open_url / focus_tab。Origin 每轮重检。',
    whatLong: 'pinnedTabs[] schema + currentFocusTabId。URL allow-list 只放 http/https。IDN punycode 显示防 homograph。所有 tab tools 在 risk.ts build-time check 锁住——`TAB_TOOL_NAMES` 必须出现在 `ALWAYS_HIGH_TAB_TOOLS` 或 `ARGS_CONDITIONAL_TAB_TOOLS`，否则 throw。',
    how: [
      { label: '工具', code: 'src/lib/agent/tools/tabs.ts' },
      { label: 'pin 注册', code: 'src/lib/sessions/pinned-tab-registry.ts' },
      { label: 'tool 名常量', code: 'src/lib/agent/tool-names.ts (build-time invariant)' },
      { label: 'UI', code: 'sidepanel PinnedTabDropdown (multi-select)' },
    ],
    why: [
      { decision: '为什么 pin tabId AND origin', rationale: '只 pin tabId 防不了被 nav 走；只 pin origin 防不了同 origin 不同 tab。两个一起才稳。' },
      { decision: '为什么 multi-pin 不做 cross-origin nav', rationale: 'pre-multi-pin review 暴露 4 个 invariant 互动复杂度（server-side redirect / pin-in-transit DoS / inTransitOrigin race / shared-pin broken）；推 v1.1 单独 brainstorm。' },
      { decision: '为什么 IDN 显示用 punycode', rationale: '防 unicode homograph 假 URL 欺骗。' },
    ],
    flow: {
      nodes: [
        { id: 'task', label: 'task start', x: 40, y: 60 },
        { id: 'pin', label: 'pin tab+origin', x: 180, y: 60 },
        { id: 'loop', label: 'each round', x: 320, y: 60 },
        { id: 'check', label: 'origin re-check', x: 460, y: 60 },
      ],
      edges: [
        { from: 'task', to: 'pin' },
        { from: 'pin', to: 'loop' },
        { from: 'loop', to: 'check' },
        { from: 'check', to: 'loop', label: 'ok' },
      ],
      bulletMap: { pin: 1, check: 2 },
    },
    invariants: [
      { tag: 'P3-A', text: 'tabId+origin pinned at task start' },
      { tag: 'P3-F', text: 'origin re-check every round' },
      { tag: 'R6', text: 'URL allow-list 显式 protocol === http/https' },
      { tag: 'R7', text: 'cross-session lock 防多 session 同时操作同 tab' },
      { tag: 'v1.5', text: 'pinnedTabs[] + currentFocusTabId；IDN punycode 显示' },
    ],
  },
```

- [ ] **Step 8: Append Multimodal entry**

```js
  {
    slug: 'multimodal',
    kind: 'subsystem',
    title: 'Multimodal (Vision)',
    phaseTags: ['P5'],
    what: '用户上传 ≤3 张 + LLM 调 screenshot tools。No-persist SW 缓存 30MB LRU。Anthropic/OpenAI/OpenRouter 三家 vision。',
    whatLong: '用户路径：粘贴/拖拽/按钮 → auto-resize 1568px JPEG q85 + EXIF strip。LLM 路径：`capture_visible_tab` / `capture_fullpage_tab` 两个工具，always-high。SW per-session cache 30MB / last-3-turn LRU / 4 个 evict 路径。R14 fail-on-image：当模型不支持 vision 时 task 进 paused→failed。',
    how: [
      { label: '用户上传', code: 'sidepanel/ChatInput image handler' },
      { label: 'screenshot tools', code: 'src/lib/agent/tools/capture*.ts (always-high)' },
      { label: 'SW 缓存', code: 'background/image-cache.ts (no-persist LRU)' },
      { label: 'untrusted boundary', code: 'R15 system prompt warn LLM about image' },
    ],
    why: [
      { decision: '为什么 no-persist 而不是写盘', rationale: '图大、隐私敏感；用户上传图不需要 resume 也跨不了 session。30MB 缓冲足够 last-3-turn。' },
      { decision: '为什么 capture tools always-high', rationale: '截屏会暴露当前页面整体上下文给 LLM，比单个 DOM action 信息泄漏面大。' },
      { decision: '为什么 fail-on-image 而不是 silent-drop', rationale: 'silent drop 让用户以为模型看到了；fail-fast 强迫用户切换 instance。' },
    ],
    flow: {
      nodes: [
        { id: 'upload', label: 'user upload', x: 40, y: 30 },
        { id: 'cap', label: 'LLM capture', x: 40, y: 100 },
        { id: 'cache', label: 'SW cache 30MB', x: 220, y: 60 },
        { id: 'send', label: 'send to provider', x: 400, y: 60 },
      ],
      edges: [
        { from: 'upload', to: 'cache' },
        { from: 'cap', to: 'cache' },
        { from: 'cache', to: 'send' },
      ],
      bulletMap: { upload: 0, cap: 1, cache: 2 },
    },
    invariants: [
      { tag: 'R14', text: 'image input + unsupported model = task paused → failed' },
      { tag: 'R15', text: 'image untrusted boundary system prompt' },
      { tag: 'P5-V1', text: '用户上传 auto-resize 1568px JPEG q85 + EXIF strip' },
      { tag: 'P5-V2', text: 'SW cache 30MB / last-3-turn LRU / 4 evict 路径' },
    ],
  },
```

- [ ] **Step 9: Append Untrusted Boundary entry**

```js
  {
    slug: 'untrusted',
    kind: 'subsystem',
    title: 'Prompt Injection 防御',
    phaseTags: ['P2'],
    what: '<untrusted_*> wrapper 是唯一 escape 入口；只进 user role，never 进 system role。',
    whatLong: '页面 snapshot、tab metadata、用户消息这三类不可信内容统一用 `<untrusted_page_content>` / `<untrusted_tab_metadata>` / `<untrusted_user_message>` 包裹后进 user role。System role 保持纯净的 agent 指令。`untrusted-wrappers.ts` 是唯一构造入口，靠 build-time check 保证别处不能直接拼字符串。',
    how: [
      { label: '唯一入口', code: 'src/lib/agent/untrusted-wrappers.ts' },
      { label: 'wire 校验', code: 'tool-names.ts build-time invariant' },
      { label: 'prompt 构造', code: 'src/lib/agent/prompt.ts (system 仅放 agent 指令)' },
    ],
    why: [
      { decision: '为什么 wrapper 而不是 escape 字符', rationale: 'LLM 对 XML-like tag 更有"这是数据"语义直觉；纯 escape 容易被 prompt injection 反 escape。' },
      { decision: '为什么 never 进 system role', rationale: 'system role 在多家 provider 都享有更高指令优先级；让外部输入污染 system 等于扩攻击面。' },
      { decision: '为什么 user 消息也包', rationale: '用户消息可能被剪贴板劫持或自动化注入；统一 wrapper 简化模型对"哪段是 trust 哪段不是"的判断。' },
    ],
    flow: {
      nodes: [
        { id: 'page', label: 'page snapshot', x: 40, y: 30 },
        { id: 'meta', label: 'tab metadata', x: 40, y: 80 },
        { id: 'usr', label: 'user msg', x: 40, y: 130 },
        { id: 'wrap', label: 'wrapper', x: 220, y: 80 },
        { id: 'user', label: 'user role', x: 400, y: 80 },
        { id: 'sys', label: 'system role', x: 400, y: 20 },
      ],
      edges: [
        { from: 'page', to: 'wrap' },
        { from: 'meta', to: 'wrap' },
        { from: 'usr', to: 'wrap' },
        { from: 'wrap', to: 'user' },
      ],
      bulletMap: { wrap: 0, user: 2, sys: 2 },
    },
    invariants: [
      { tag: 'P2-U1', text: 'untrusted 内容 only 通过 untrusted-wrappers.ts 构造' },
      { tag: 'P2-U2', text: 'untrusted wrappers never 进 system role' },
      { tag: 'P2-U3', text: '页面 snapshot + tab metadata + user message 三类都要包' },
    ],
  },
```

- [ ] **Step 10: Append Streaming / Wire entry**

```js
  {
    slug: 'streaming',
    kind: 'subsystem',
    title: 'Streaming / Wire 协议',
    phaseTags: ['P1', 'M3'],
    what: 'chrome.runtime.connect() port，per-session 命名 `chat-stream-${sessionId}`。SSE parser 同时处理 \\n / \\r\\n。keep-alive 25s。',
    whatLong: 'sendMessage 不能流式，必须 port。port 命名带 sessionId 让 multi-session 隔离。SSE 解析器要兼容两种换行因为不同 provider 不同。SW 25s 调一次 `getPlatformInfo()` 续命防 30s 自动停。',
    how: [
      { label: 'SW 端', code: 'src/background/chat-port.ts' },
      { label: 'sidepanel 端', code: 'src/sidepanel/hooks/useChatStream.ts' },
      { label: 'SSE parser', code: 'src/lib/model-router/sse.ts' },
      { label: 'keep-alive', code: 'src/background/keep-alive.ts' },
    ],
    why: [
      { decision: '为什么 port 不用 sendMessage', rationale: 'sendMessage 是 req-resp 一次性；流式 token 必须长连接。' },
      { decision: '为什么 port 名带 sessionId', rationale: 'M3 multi-session 并发；老 port 死掉不影响其他 session；sidepanel 路由简单。' },
      { decision: '为什么 SSE parser 处理 \\r\\n', rationale: '部分 provider gateway 把 \\n 转 \\r\\n；不处理会 block 在 buffer 等不到换行。' },
    ],
    flow: {
      nodes: [
        { id: 'panel', label: 'sidepanel', x: 40, y: 60 },
        { id: 'port', label: 'port chat-stream', x: 200, y: 60 },
        { id: 'sw', label: 'SW', x: 360, y: 60 },
        { id: 'sse', label: 'SSE parser', x: 360, y: 140 },
        { id: 'prov', label: 'provider', x: 520, y: 60 },
      ],
      edges: [
        { from: 'panel', to: 'port' },
        { from: 'port', to: 'sw' },
        { from: 'sw', to: 'prov' },
        { from: 'prov', to: 'sse' },
        { from: 'sse', to: 'port', label: 'stream back' },
      ],
      bulletMap: { port: 0, sw: 0, sse: 2 },
    },
    invariants: [
      { tag: 'P1-S1', text: 'streaming 走 chrome.runtime.connect()，never sendMessage' },
      { tag: 'P1-S2', text: 'SSE parser 同时处理 \\n 和 \\r\\n 行尾' },
      { tag: 'P1-S3', text: 'keep-alive 25s 调 getPlatformInfo() 续命' },
      { tag: 'M3-U2', text: 'port 命名 chat-stream-${sessionId} per-session 隔离' },
    ],
  },
```

- [ ] **Step 11: Append Record & Replay entry**

```js
  {
    slug: 'record-replay',
    kind: 'subsystem',
    title: 'Record & Replay',
    phaseTags: ['P3+'],
    what: 'sidepanel Record button → DOM event capture → trace 作为 chip 注入 chat 输入框 → 用户加 prompt → LLM 显式调 create_skill_from_recording。',
    whatLong: '回放完全复用 ReAct + click/type 工具路径，不写新执行引擎。R10 first-run confirm 卡片是 capability review surface。Phase 2.6 capability + Phase 3 cross-tab + M3 multi-session 全自动兼容。',
    how: [
      { label: '录制', code: 'src/sidepanel/record/capture.ts (DOM events)' },
      { label: '注入', code: 'trace → chat input chip' },
      { label: '创建', code: 'create_skill_from_recording (built-in skill)' },
      { label: '回放', code: '复用 click/type tool path' },
    ],
    why: [
      { decision: '为什么 trace 进 chat 让 LLM 创建 skill 而不是直接生成', rationale: '用户可加自由 prompt 改写录制；LLM 也填 description/tag；R10 二次 confirm 当 review。' },
      { decision: '为什么不写独立回放引擎', rationale: 'click/type 工具已经稳；写新引擎要重做 cross-tab / multi-session / risk classifier 兼容。' },
    ],
    flow: {
      nodes: [
        { id: 'rec', label: 'Record btn', x: 40, y: 60 },
        { id: 'cap', label: 'DOM capture', x: 180, y: 60 },
        { id: 'chip', label: 'chip → chat', x: 320, y: 60 },
        { id: 'llm', label: 'LLM create_skill', x: 460, y: 60 },
      ],
      edges: [
        { from: 'rec', to: 'cap' },
        { from: 'cap', to: 'chip' },
        { from: 'chip', to: 'llm' },
      ],
      bulletMap: { cap: 0, chip: 1, llm: 2 },
    },
    invariants: [
      { tag: 'RR-1', text: '回放复用 click/type 工具路径；不写独立执行引擎' },
      { tag: 'RR-2', text: 'R10 first-run confirm 是 capability review surface' },
      { tag: 'RR-3', text: 'v1 仅单 tab；cross-tab 录制 v1.1 backlog' },
    ],
  },
```

- [ ] **Step 12: Append cross-cut: Confirm 层删除变迁**

```js
  // --- Cross-cuts ---
  {
    slug: 'confirm-removed',
    kind: 'crosscut',
    title: 'Confirm 层删除变迁',
    phaseTags: ['P2.5', 'P3', '2026-05-08'],
    what: 'Risk classifier → confirm card → skip-permissions toggle → K-10 reject-3-strikes 全部撤回。Confirm 层 2026-05-08 彻底删除。',
    whatLong: 'Phase 2.5 引入 risk classifier 区分 low/high 工具；P3 加 cross-origin / 敏感字段升级 + reject-3-strikes 防滥用。后来全局 skip-permissions toggle 出现，用户基本一直 on。2026-05-08 评估实际防御价值 vs UI confirm fatigue，决定彻底删 confirm 层。K-8 verifyConfirmedOrigin 改 bypass when no confirm record。',
    how: [
      { label: '删除 commit', code: '73d6d84 fix(tabs): bypass K-8 verifyConfirmedOrigin' },
      { label: '前置 PR', code: 'feat/remove-confirm-layer (PR #48)' },
      { label: '残留 wire 字段', code: 'K-8 bypass 是 post-cleanup 兼容' },
    ],
    why: [
      { decision: '为什么撤 confirm 而不是改设计', rationale: '所有用户 skip-permissions 都是 on；confirm fatigue 远大于实际防御价值。真正的安全护栏是 origin pin + URL allow-list + untrusted wrapper，confirm 是 UI 反复打断。' },
      { decision: '为什么 K-8 bypass 而不是删 verifyConfirmedOrigin 整段', rationale: 'cross-tab 还在用 origin 验证；只删 confirm-driven 部分，留 origin check 本身。' },
      { decision: '为什么不留 toggle 给愿意 confirm 的用户', rationale: '维护两条 path 的成本远超少数用户需求；可以未来用 skill 级别"询问后再继续"的 prompt pattern 替代。' },
    ],
    flow: {
      nodes: [
        { id: 'p25', label: 'P2.5 risk', x: 40, y: 60 },
        { id: 'p3', label: 'P3 升级条件', x: 180, y: 60 },
        { id: 'skip', label: 'skip toggle', x: 320, y: 60 },
        { id: 'rm', label: '2026-05-08 删', x: 460, y: 60 },
      ],
      edges: [
        { from: 'p25', to: 'p3' },
        { from: 'p3', to: 'skip' },
        { from: 'skip', to: 'rm' },
      ],
      bulletMap: { p25: 0, rm: 0 },
    },
    invariants: [
      { tag: 'K-8', text: 'verifyConfirmedOrigin bypass 当 confirm 记录不存在（post confirm-layer removal）' },
      { tag: 'POST-RM-1', text: '真正护栏是 origin pin + URL allow-list + untrusted wrapper；confirm 不再担任安全角色' },
    ],
  },
```

- [ ] **Step 13: Append cross-cut: Phase 时间线**

```js
  {
    slug: 'phases',
    kind: 'crosscut',
    title: 'Phase 时间线',
    phaseTags: ['*'],
    what: 'Phase 0 → 1 → 2 → 2.5 → 2.6 → 3 → 4 (M1/M2/M3) → 5 (v1) → v1.5。每个 phase 加了什么 + 新增 invariant + 关键 PR。',
    whatLong: '完整演进时间线。所有子系统都能 trace 回某个 phase。Backlog 不在这里，看 docs/ROADMAP.md。',
    how: [
      { label: 'source', code: 'docs/ROADMAP.md' },
      { label: 'invariant traces', code: 'docs/solutions/*.md' },
    ],
    why: [
      { decision: '为什么时间轴而不是分支图', rationale: '项目只有 main 一条主线；分支图会过度承诺 parallel work。' },
    ],
    flow: {
      nodes: [
        { id: 'p0', label: 'P0', x: 30, y: 60 },
        { id: 'p1', label: 'P1', x: 90, y: 60 },
        { id: 'p2', label: 'P2', x: 150, y: 60 },
        { id: 'p25', label: 'P2.5', x: 210, y: 60 },
        { id: 'p26', label: 'P2.6', x: 270, y: 60 },
        { id: 'p3', label: 'P3', x: 330, y: 60 },
        { id: 'p4', label: 'P4', x: 390, y: 60 },
        { id: 'p5', label: 'P5', x: 450, y: 60 },
        { id: 'v15', label: 'v1.5', x: 510, y: 60 },
      ],
      edges: [
        { from: 'p0', to: 'p1' },
        { from: 'p1', to: 'p2' },
        { from: 'p2', to: 'p25' },
        { from: 'p25', to: 'p26' },
        { from: 'p26', to: 'p3' },
        { from: 'p3', to: 'p4' },
        { from: 'p4', to: 'p5' },
        { from: 'p5', to: 'v15' },
      ],
      bulletMap: {},
    },
    invariants: [
      { tag: 'P0', text: 'spike：扩展骨架 + side panel 启动 + 1 provider 验证' },
      { tag: 'P1', text: '基础 Agent Loop + 多 provider + DOM actions + streaming + AES-GCM 加密' },
      { tag: 'P2', text: 'Skills 框架 + untrusted-wrappers prompt injection 防御' },
      { tag: 'P2.5', text: 'CDP keyboard for canvas editors + risk classifier (已撤)' },
      { tag: 'P2.6', text: 'Skill scope + skill 自主 CRUD + skip-permissions toggle (已撤)' },
      { tag: 'P3', text: 'cross-tab pinned tab + origin re-check + 工具 risk 升级矩阵 (已撤)' },
      { tag: 'P4-M1', text: '单 session 持久化 + SW restart recovery + R11 drift card' },
      { tag: 'P4-M2', text: 'multi-session UI drawer + LLM 标题 + LRU archive' },
      { tag: 'P4-M3', text: 'per-session port + per-session pin + ownerToken + R7 lock' },
      { tag: 'P5', text: '多模态：用户上传 + screenshot tools + R14 fail-on-image + R15 untrusted' },
      { tag: 'v1.5', text: 'multi-pin + open_url + focus_tab + IDN punycode' },
      { tag: '2026-05-08', text: 'Confirm 层彻底删除（risk / confirm card / skip toggle / reject-3-strikes）' },
    ],
  },
];
```

(Close the `archiveData` array with `];`)

- [ ] **Step 14: Verify the data array**

Open file in browser, DevTools Console:
```js
> archiveData.length
12
> archiveData.map(d => d.slug)
// ['agent-loop', 'provider-router', 'multi-instance', 'skills', 'sessions',
//  'dom-cdp', 'cross-tab', 'multimodal', 'untrusted', 'streaming',
//  'record-replay', 'confirm-removed', 'phases']
```
Wait — that's 13. The spec said 10 subsystems + 2 cross-cuts = 12. Recount the array; intended count is **13** (11 subsystems entries + 2 cross-cuts since Record/Replay counts as a subsystem). The §6 table in spec lists 13 rows. The "12" in spec §1 is the panel count after merging cross-cuts into one row; the §6 table has the correct 13. **The plan's data array should have 13 entries.** Verify `archiveData.length === 13`. If it's not 13, scroll back through Steps 1-13 and find the missing one.

---

## Task 4: Sidebar render + hash routing

**Files:**
- Modify: `docs/archive/index.html` `<script>` — append render code.

- [ ] **Step 1: Add sidebar render fn**

Append after `archiveData = [...];`:

```js
function renderSidebar() {
  const navSub = document.getElementById('nav-subsystems');
  const navCross = document.getElementById('nav-crosscuts');
  navSub.innerHTML = '';
  navCross.innerHTML = '';
  archiveData.forEach(d => {
    const a = document.createElement('a');
    a.href = '#' + d.slug;
    a.dataset.slug = d.slug;
    a.textContent = d.title;
    (d.kind === 'crosscut' ? navCross : navSub).appendChild(a);
  });
}

function setActiveSlug(slug) {
  document.querySelectorAll('.sidebar nav a').forEach(a => {
    a.classList.toggle('is-active', a.dataset.slug === slug);
  });
}
```

- [ ] **Step 2: Add panel render fn (skeleton — flow + invariants come later tasks)**

```js
function renderPanel(slug) {
  const d = archiveData.find(x => x.slug === slug) || archiveData[0];
  const panel = document.getElementById('panel');
  panel.innerHTML = `
    <header>
      <h1>${escapeHtml(d.title)}</h1>
      <div class="tags">${d.phaseTags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>
    </header>
    <div class="section">
      <div class="label">what</div>
      <div class="body">
        <p><strong>${escapeHtml(d.what)}</strong></p>
        <p style="color: var(--c-fg-2)">${escapeHtml(d.whatLong)}</p>
      </div>
    </div>
    <div class="section">
      <div class="label">how</div>
      <div class="body" id="how-list">
        ${d.how.map((h, i) => `
          <div class="bullet" data-bullet-index="${i}">
            <div class="k">${escapeHtml(h.label)}</div>
            <div><code>${escapeHtml(h.code)}</code></div>
          </div>`).join('')}
      </div>
    </div>
    <div class="section">
      <div class="label">flow</div>
      <div class="body" id="flow-host"></div>
    </div>
    <div class="section">
      <div class="label">why</div>
      <div class="body">
        ${d.why.map(w => `
          <div class="why-item">
            <div class="decision">${escapeHtml(w.decision)}</div>
            <div class="rationale">${escapeHtml(w.rationale)}</div>
          </div>`).join('')}
      </div>
    </div>
    <div class="section">
      <div class="invariants-toggle" id="inv-toggle">▸ invariants (${d.invariants.length})</div>
      <div class="invariants-list" id="inv-list">
        ${d.invariants.map(inv => `
          <div class="invariant">
            <span class="tag">${escapeHtml(inv.tag)}</span>
            <span>${escapeHtml(inv.text)}</span>
          </div>`).join('')}
      </div>
    </div>
  `;
  setActiveSlug(d.slug);
  // flow render + invariants toggle wired in later tasks
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
```

- [ ] **Step 3: Add hash routing + boot**

```js
function currentSlug() {
  return location.hash.slice(1) || 'agent-loop';
}
function boot() {
  renderSidebar();
  renderPanel(currentSlug());
  window.addEventListener('hashchange', () => renderPanel(currentSlug()));
}
boot();
```

- [ ] **Step 4: Verify in browser**

Open file. Expected:
- Left sidebar lists all subsystems + cross-cuts; first one (`agent-loop`) shows `is-active` styling
- Right panel shows Agent Loop content: title, phase tags, what (bold + grey detail), how bullets with code, flow placeholder (empty for now), why list, invariants toggle showing "▸ invariants (4)" but list invisible
- Click another sidebar item → URL hash updates → panel switches
- Browser back/forward works

---

## Task 5: SVG flow renderer + hover linking

**Files:**
- Modify: `docs/archive/index.html` `<script>` + `<style>`.

- [ ] **Step 1: Add CSS for SVG flow**

Append to `<style>`:

```css
.flow-svg {
  display: block;
  width: 100%;
  max-width: 560px;
  height: auto;
  background: var(--c-field);
  border: 1px solid var(--c-line);
  border-radius: 4px;
}
.flow-svg .node rect {
  fill: var(--c-surface);
  stroke: var(--c-line);
  stroke-width: 1;
}
.flow-svg .node text {
  font-family: ui-monospace, monospace;
  font-size: 11px;
  fill: var(--c-fg-1);
}
.flow-svg .edge {
  stroke: var(--c-fg-3);
  stroke-width: 1;
  fill: none;
}
.flow-svg .edge-label {
  font-family: ui-monospace, monospace;
  font-size: 10px;
  fill: var(--c-fg-3);
}
.flow-svg .node.is-hover rect {
  fill: var(--c-accent-tint);
  stroke: var(--c-accent);
}
```

- [ ] **Step 2: Add SVG render fn**

Append to `<script>`:

```js
function renderFlow(d) {
  const host = document.getElementById('flow-host');
  if (!d.flow || !d.flow.nodes.length) { host.innerHTML = ''; return; }
  const { nodes, edges, bulletMap } = d.flow;
  const W = 560, H = 180, NW = 96, NH = 28;
  const nodeById = Object.fromEntries(nodes.map(n => [n.id, n]));
  const edgePath = (a, b) => {
    const ax = a.x + NW / 2, ay = a.y + NH / 2;
    const bx = b.x + NW / 2, by = b.y + NH / 2;
    return `M${ax},${ay} L${bx},${by}`;
  };
  const svg = `
    <svg class="flow-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5"
                markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--c-fg-3)" />
        </marker>
      </defs>
      ${edges.map(e => {
        const a = nodeById[e.from], b = nodeById[e.to];
        if (!a || !b) return '';
        const mid = { x: (a.x + b.x) / 2 + NW / 2, y: (a.y + b.y) / 2 + NH / 2 };
        return `
          <path class="edge" d="${edgePath(a, b)}" marker-end="url(#arr)" />
          ${e.label ? `<text class="edge-label" x="${mid.x + 4}" y="${mid.y - 4}">${escapeHtml(e.label)}</text>` : ''}
        `;
      }).join('')}
      ${nodes.map(n => `
        <g class="node" data-node-id="${n.id}">
          <rect x="${n.x}" y="${n.y}" width="${NW}" height="${NH}" rx="3" />
          <text x="${n.x + NW / 2}" y="${n.y + NH / 2 + 4}" text-anchor="middle">${escapeHtml(n.label)}</text>
        </g>
      `).join('')}
    </svg>
  `;
  host.innerHTML = svg;
  wireFlowHover(d);
}

function wireFlowHover(d) {
  const map = d.flow.bulletMap || {};
  const inv = {};
  Object.entries(map).forEach(([nid, bi]) => { inv[bi] = (inv[bi] || []).concat(nid); });
  document.querySelectorAll('.flow-svg .node').forEach(g => {
    const nid = g.dataset.nodeId;
    const bi = map[nid];
    const bullet = bi != null ? document.querySelector(`[data-bullet-index="${bi}"]`) : null;
    const enter = () => {
      g.classList.add('is-hover');
      if (bullet) bullet.classList.add('is-flow-hover');
    };
    const leave = () => {
      g.classList.remove('is-hover');
      if (bullet) bullet.classList.remove('is-flow-hover');
    };
    g.addEventListener('mouseenter', enter);
    g.addEventListener('mouseleave', leave);
  });
  document.querySelectorAll('.bullet[data-bullet-index]').forEach(b => {
    const bi = b.dataset.bulletIndex;
    const linkedNodes = inv[bi] || [];
    const enter = () => {
      b.classList.add('is-flow-hover');
      linkedNodes.forEach(nid => document.querySelector(`.flow-svg .node[data-node-id="${nid}"]`)?.classList.add('is-hover'));
    };
    const leave = () => {
      b.classList.remove('is-flow-hover');
      linkedNodes.forEach(nid => document.querySelector(`.flow-svg .node[data-node-id="${nid}"]`)?.classList.remove('is-hover'));
    };
    b.addEventListener('mouseenter', enter);
    b.addEventListener('mouseleave', leave);
  });
}
```

- [ ] **Step 3: Hook into renderPanel**

In `renderPanel`, append after `setActiveSlug(d.slug);`:

```js
  renderFlow(d);
```

- [ ] **Step 4: Verify**

Open file. For each panel:
- SVG flow shows under "flow" label
- Hover a node → node and its mapped bullet both highlight (tinted bg)
- Hover a bullet → same effect
- No console errors

---

## Task 6: Invariants fold toggle

**Files:**
- Modify: `docs/archive/index.html` `<script>` — append.

- [ ] **Step 1: Add toggle wiring in renderPanel**

In `renderPanel`, at the end, append:

```js
  const tog = document.getElementById('inv-toggle');
  const list = document.getElementById('inv-list');
  tog.addEventListener('click', () => {
    const open = list.classList.toggle('is-open');
    tog.textContent = `${open ? '▾' : '▸'} invariants (${d.invariants.length})`;
  });
```

- [ ] **Step 2: Verify**

Open file. Default each panel shows `▸ invariants (N)` and list hidden. Click → arrow flips, list visible. Click again → collapses. Switch panel → resets to collapsed (since render replaces).

---

## Task 7: Theme toggle (☼/☾)

**Files:**
- Modify: `docs/archive/index.html` `<script>` — append.

- [ ] **Step 1: Add theme logic**

Append:

```js
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('theme-btn').textContent = theme === 'dark' ? '☾' : '☼';
}
function initTheme() {
  const saved = localStorage.getItem('archiveTheme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (prefersDark ? 'dark' : 'light'));
  document.getElementById('theme-btn').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('archiveTheme', next);
  });
}
initTheme();
```

Insert the `initTheme();` call inside `boot()` after `renderSidebar();` — or just below `boot();` line; both work since DOM is ready (script at end of body).

- [ ] **Step 2: Verify**

Open file. Click ☼ → page goes dark, icon becomes ☾. Refresh → stays dark. Click ☾ → back to light. Refresh → stays light. DevTools, clear `localStorage.archiveTheme`, refresh in a system set to dark → loads dark.

---

## Task 8: `/` search omni-bar

**Files:**
- Modify: `docs/archive/index.html` `<style>` + `<script>`.

- [ ] **Step 1: Add CSS**

Append to `<style>`:

```css
.search-overlay {
  position: fixed;
  inset: 0;
  background: var(--c-overlay-strong);
  display: none;
  align-items: flex-start;
  justify-content: center;
  padding-top: 80px;
  z-index: 100;
}
.search-overlay.is-open { display: flex; }
.search-box {
  width: min(640px, 80vw);
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: 6px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.12);
  overflow: hidden;
}
.search-box input {
  width: 100%;
  padding: 14px 16px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--c-line);
  font-family: inherit;
  font-size: 15px;
  color: var(--c-fg-1);
  outline: none;
}
.search-results { max-height: 50vh; overflow-y: auto; }
.search-results .hit {
  padding: 10px 16px;
  border-bottom: 1px solid var(--c-line);
  cursor: pointer;
}
.search-results .hit:hover, .search-results .hit.is-focused {
  background: var(--c-accent-tint);
}
.search-results .hit .ttl { font-weight: 500; font-size: 13.5px; }
.search-results .hit .snip {
  color: var(--c-fg-2); font-size: 12px; margin-top: 2px;
}
```

- [ ] **Step 2: Add DOM**

Inside `<body>` right after `</div>` closing `.app`, insert:

```html
    <div class="search-overlay" id="search-overlay" role="dialog" aria-modal="true">
      <div class="search-box">
        <input type="text" id="search-input" placeholder="搜索 subsystem / invariant…" />
        <div class="search-results" id="search-results"></div>
      </div>
    </div>
```

- [ ] **Step 3: Add search logic**

Append to `<script>`:

```js
function matchHits(q) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  const hits = [];
  archiveData.forEach(d => {
    const hay = [d.title, d.what, d.whatLong, ...(d.invariants || []).map(i => i.tag + ' ' + i.text)];
    const idx = hay.findIndex(h => (h || '').toLowerCase().includes(q));
    if (idx >= 0) {
      const text = hay[idx];
      const i = text.toLowerCase().indexOf(q);
      const snip = '…' + text.slice(Math.max(0, i - 20), i + q.length + 40) + '…';
      hits.push({ slug: d.slug, title: d.title, snip });
    }
  });
  return hits.slice(0, 10);
}

function renderHits(hits) {
  const host = document.getElementById('search-results');
  host.innerHTML = hits.map((h, i) => `
    <div class="hit ${i === 0 ? 'is-focused' : ''}" data-slug="${h.slug}">
      <div class="ttl">${escapeHtml(h.title)}</div>
      <div class="snip">${escapeHtml(h.snip)}</div>
    </div>`).join('');
  host.querySelectorAll('.hit').forEach(el => {
    el.addEventListener('click', () => {
      location.hash = '#' + el.dataset.slug;
      closeSearch();
    });
  });
}

let focusedIdx = 0;
function openSearch() {
  const ov = document.getElementById('search-overlay');
  ov.classList.add('is-open');
  const input = document.getElementById('search-input');
  input.value = '';
  document.getElementById('search-results').innerHTML = '';
  focusedIdx = 0;
  setTimeout(() => input.focus(), 0);
}
function closeSearch() {
  document.getElementById('search-overlay').classList.remove('is-open');
}
function initSearch() {
  const input = document.getElementById('search-input');
  document.getElementById('search-btn').addEventListener('click', openSearch);
  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      openSearch();
    } else if (e.key === 'Escape') {
      closeSearch();
    }
  });
  input.addEventListener('input', () => {
    const hits = matchHits(input.value);
    renderHits(hits);
    focusedIdx = 0;
  });
  input.addEventListener('keydown', e => {
    const hits = document.querySelectorAll('.search-results .hit');
    if (!hits.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusedIdx = (focusedIdx + 1) % hits.length;
      hits.forEach((h, i) => h.classList.toggle('is-focused', i === focusedIdx));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusedIdx = (focusedIdx - 1 + hits.length) % hits.length;
      hits.forEach((h, i) => h.classList.toggle('is-focused', i === focusedIdx));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const slug = hits[focusedIdx].dataset.slug;
      location.hash = '#' + slug;
      closeSearch();
    }
  });
  document.getElementById('search-overlay').addEventListener('click', e => {
    if (e.target.id === 'search-overlay') closeSearch();
  });
}
initSearch();
```

Add `initSearch();` line at module scope (already there from this step). The other init calls (`initTheme()`, `boot()`) run earlier.

- [ ] **Step 4: Verify**

- Press `/` → overlay opens, input focused
- Type "untrusted" → at least 1 hit shows (Prompt Injection 防御 panel)
- ArrowDown / ArrowUp navigate hits, Enter jumps + closes
- Esc closes
- Click outside the box also closes
- Top-bar `/` button does the same

---

## Task 9: Phase mini-card (right-bottom floating)

**Files:**
- Modify: `docs/archive/index.html` `<style>` + `<script>`.

- [ ] **Step 1: Add CSS**

Append to `<style>`:

```css
.phase-card {
  position: fixed;
  right: 16px;
  bottom: 16px;
  width: 220px;
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 11px;
  color: var(--c-fg-2);
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
  cursor: pointer;
  z-index: 50;
}
.phase-card .title {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--c-fg-3);
  margin-bottom: 4px;
}
.phase-card .dots {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  align-items: center;
}
.phase-card .dot {
  font-family: ui-monospace, monospace;
  font-size: 10px;
  padding: 1px 6px;
  border: 1px solid var(--c-line);
  border-radius: 3px;
  color: var(--c-fg-3);
}
.phase-card .dot.is-active {
  background: var(--c-accent-tint);
  border-color: var(--c-accent);
  color: var(--c-accent);
}
```

- [ ] **Step 2: Add DOM**

Inside `<body>` after the `.search-overlay` block, insert:

```html
    <div class="phase-card" id="phase-card" title="Open Phase timeline">
      <div class="title">phases · click for timeline</div>
      <div class="dots" id="phase-dots"></div>
    </div>
```

- [ ] **Step 3: Add render + wiring**

Append to `<script>`:

```js
const PHASE_ORDER = ['P0','P1','P2','P2.5','P2.6','P3','P4','P5','v1.5'];
function phaseTagToBucket(tag) {
  if (tag.startsWith('M')) return 'P4';
  if (tag === '*') return null;
  return PHASE_ORDER.find(p => tag === p) || PHASE_ORDER.find(p => tag.startsWith(p));
}
function renderPhaseCard(d) {
  const active = new Set();
  (d.phaseTags || []).forEach(t => {
    const b = phaseTagToBucket(t);
    if (b) active.add(b);
  });
  const host = document.getElementById('phase-dots');
  host.innerHTML = PHASE_ORDER.map(p => `<span class="dot ${active.has(p) ? 'is-active' : ''}">${p}</span>`).join('');
}
document.getElementById('phase-card').addEventListener('click', () => {
  location.hash = '#phases';
});
```

Hook into `renderPanel`: at the end append:
```js
  renderPhaseCard(d);
```

- [ ] **Step 4: Verify**

- Right-bottom card visible at all times
- On Agent Loop panel: P1, P2, P2.6, P4 (since M3→P4) are highlighted
- On Cross-Tab panel: P3 and v1.5 highlighted
- Click card → URL hash becomes `#phases`, Phase 时间线 panel renders

---

## Task 10: Responsive narrow-screen drawer

**Files:**
- Modify: `docs/archive/index.html` `<style>`.

- [ ] **Step 1: Add media query**

Append to `<style>`:

```css
@media (max-width: 960px) {
  .main {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }
  .sidebar {
    border-right: none;
    border-bottom: 1px solid var(--c-line);
    max-height: 200px;
  }
  .panel { padding: 24px 20px 80px; }
  .phase-card { display: none; }
}
```

- [ ] **Step 2: Verify**

Open DevTools, set responsive viewport ≤ 960px wide. Expected:
- Sidebar moves to top, becomes scrollable strip
- Panel takes full width below
- Phase card hidden
- Still functional

---

## Task 11: Final QA pass

- [ ] **Step 1: Run through spec §9 acceptance checklist**

Spec `docs/specs/2026-05-13-project-archive-html-design.md` §9 contains:
- [ ] 双击 file 可看，无 console error
- [ ] 13 个面板都点得到（spec §1 写"12"是计 cross-cut 后的折叠数，实际 entries = 13）
- [ ] `/` 搜索弹框 → 输入 "untrusted" 命中 → Enter 跳转 panel
- [ ] invariants 折叠收/展正常
- [ ] 深/浅 toggle 正常，刷新后保持
- [ ] SVG flow 节点 hover 高亮对应 bullet
- [ ] 右下 Phase 小卡显示当前 panel 关联的 phase
- [ ] 窄屏（<960px）左栏折叠为顶部抽屉

- [ ] **Step 2: Check console for any errors**

Open DevTools Console. Browse all 13 panels. No errors expected.

- [ ] **Step 3: Sanity check content**

Spot-check each panel:
- title, what, whatLong, how list, flow SVG, why list, invariants折叠 — all present
- No `undefined` or empty sections rendered
- Code paths in `how` look plausible vs actual `src/lib/` layout

- [ ] **Step 4: Report back**

Tell the user file is ready at `docs/archive/index.html`. Ask whether to commit.

---

## Self-Review

**Spec coverage:**
- §1 范围与非范围 → Task 1 (skeleton, no build), all tasks respect "no external resources"
- §2 文件与产物 → Task 1
- §3 视觉系统 → Task 1 (tokens), Task 2 (layout CSS)
- §4 布局 → Task 2
- §5 子系统面板 schema → Task 3
- §6 12/13 面板清单 → Task 3 (Steps 1–13)
- §7.1 全局搜索 → Task 8
- §7.2 invariants 折叠 → Task 6
- §7.3 深/浅主题 → Task 7
- §7.4 SVG hover 联动 → Task 5
- §7.5 Phase 小卡 → Task 9
- §7.6 路由 → Task 4 (hash routing)
- §8 JS 预算 → respected (≈1000 lines JS across tasks)
- §9 验收 → Task 11
- §10 backlog 不做 → respected

**Placeholder scan:** No TBD/TODO. All code blocks complete and copy-pasteable.

**Type consistency:**
- `archiveData[i].slug` used consistently
- `kind: 'subsystem' | 'crosscut'` used in render
- `bulletMap` keys = node ids, values = bullet index — consistent
- `phaseTags` array of strings — consistent
- `flow.nodes[i].id` referenced in `flow.edges` and `bulletMap` — consistent
- `getElementById` ids: `nav-subsystems`, `nav-crosscuts`, `phase-strip`, `panel`, `theme-btn`, `search-btn`, `search-overlay`, `search-input`, `search-results`, `phase-card`, `phase-dots`, `flow-host`, `how-list`, `inv-toggle`, `inv-list` — all defined in HTML and used in JS

**Count reconciliation:** Spec §1 wrote "12 个内容面板" but §6 table lists 13 rows. The plan's archiveData has 13 entries. Task 11 explicitly handles this. Spec is wrong; plan is correct; user can fix spec later if desired.
