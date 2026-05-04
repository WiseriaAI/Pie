# Chrome AI Agent (Pie)

BYOK (Bring Your Own Key) Chrome Extension — 用户插入自己的 API key 获得 AI 浏览器能力。

## Tech Stack

- Chrome Extension Manifest V3, React 19 + TypeScript 6
- TailwindCSS v4 (Vite plugin, no config file), Vite 8 + @crxjs/vite-plugin 2.4
- pnpm; vitest + happy-dom + @testing-library/react

## Project Structure

- `src/background/` — Service Worker: message routing, port streaming, agent loop dispatch, keep-alive, CDP session lifecycle
- `src/content/` — placeholder (DOM ops 走 `chrome.scripting.executeScript` 注入)
- `src/sidepanel/` — Sidebar UI: Chat (Agent UI) / Settings / SkillsList / SessionDrawer
- `src/lib/model-router/` — Unified LLM interface + tool calling; `providers/` 6 providers + `registry.ts` 元数据
- `src/lib/dom-actions/` — Self-contained DOM action functions injected via executeScript
- `src/lib/agent/` — ReAct loop, tool registry, risk classifier, prompt builder, sliding window, `untrusted-wrappers.ts`, `tool-names.ts`
- `src/lib/agent/tools/` — `keyboard.ts` (CDP) / `skill-meta.ts` (skill CRUD) / `tabs.ts` (cross-tab)
- `src/lib/skills/` — Skill framework: types, storage, builtin, resolveSkillToTools
- `src/lib/sessions/` — Multi-session persistence: state-machine, lifecycle (archive/delete), pinned-tab-registry, title
- `src/lib/crypto.ts` / `src/lib/storage.ts` — AES-GCM encrypted API key storage
- `src/types/` — Shared message + agent protocol types

## Supported Providers

Anthropic (native API), OpenAI, OpenRouter, MiniMax, ZhiPu (智谱), Bailian (百炼)。
所有 OpenAI-compatible provider 共享一套 streaming impl via registry。

## Commands

- `pnpm dev` — Dev server with HMR
- `pnpm build` — Production build
- `pnpm test` / `pnpm test:watch` — vitest run
- 提交前跑 `pnpm test` 与 `pnpm build`（build-time invariants 在 `risk.ts` / `tool-names.ts` 会 throw）

## Development

1. `pnpm dev` 启 Vite dev server
2. `chrome://extensions` 开启 Developer mode
3. Load unpacked 加载 `dist/` 目录
4. 点击扩展图标打开 side panel

## Architecture Invariants (evergreen)

> Phase 落地的具体 invariant 清单（P3-A...V / M3-U1...U5 / capability-grant guards 等）见 `docs/solutions/`，不在此重复。

- API keys: Web Crypto AES-GCM 加密存 `chrome.storage.local`，加密密钥也在 local
- DOM access: `<all_urls>` host_permission + `chrome.scripting.executeScript`（activeTab 不够 side-panel 常驻场景）
- Streaming: `chrome.runtime.connect()` port，**不用** `sendMessage`；keep-alive 25s `getPlatformInfo()`
- SSE parser 同时处理 `\n` 和 `\r\n` 行尾
- Provider registry pattern: 加 provider 只需 registry entry + host_permission + supportsTools flag
- Injected functions 必须 self-contained（无闭包，args 通过 `executeScript`）
- ChatMessage 始终 string-only（wire format）；AgentMessage IR (`string | ContentBlock[]`) 仅 SW 内部
- Agent Loop: tabId+origin pinning at task start，每轮 origin 重检
- Risk classifier: 默认 low + 结构化升级（submit / 敏感字段 / 关键字 / cross-origin args）；CDP keyboard tools 永远 high
- Prompt injection 防御: 页面 snapshot 在 user role 用 `<untrusted_*>` wrapper（`untrusted_page_content` / `untrusted_tab_metadata` / `untrusted_user_message`），**never** 进 system role；`untrusted-wrappers.ts` 是唯一 escape 入口
- Per-session sandbox: per-session port (`chat-stream-${sessionId}`) + per-session pinned tab/origin + CDP `ownerToken={sessionId,tabId}` + 跨 session R7 lock
- Session 持久化: storage at-rest 持 raw `agentMessages`（LLM resume 需要原始 context），panel render 才走 `redactArgsForPanel`；archive/restore 走 `writeAtomic` 单调用

## Docs Map

- `docs/ROADMAP.md` — 已交付 phases + backlog（single source of truth）
- `docs/solutions/` — 落地后的 invariant trace docs（per phase / per milestone）
- `docs/brainstorms/` + `docs/plans/` — `/ce:brainstorm` + `/ce:plan` 产出
- `docs/release-notes/` — 用户可见 changelog
- `docs/design.md` — 早期 Phase 0–3 设计构想（历史档案）
