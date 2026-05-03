<div align="center">
  <img src="public/icons/icon-128.svg" alt="Pie" width="96" height="96" />
  <h1>Pie</h1>
  <p><strong>BYOK Chrome Extension Agent — your browser, augmented with the LLM you already pay for.</strong></p>
  <p>
    <a href="#install">Install</a> ·
    <a href="#configuration">Configure</a> ·
    <a href="PRIVACY.md">Privacy</a> ·
    <a href="CHANGELOG.md">Changelog</a> ·
    <a href="docs/ROADMAP.md">Roadmap</a>
  </p>
</div>

---

## Why Pie

Pie turns any modern Chromium browser into an AI agent — page understanding,
multi-step task automation, and tab management — without subscribing to yet
another AI service. You bring your own API key (Anthropic, OpenAI,
OpenRouter, or any of four China-region providers); Pie keeps it encrypted
locally and talks directly to your provider.

- **Your key, your data.** Encrypted at rest with AES-GCM in
  `chrome.storage.local`. Pie has no backend, no telemetry, no proxy. See
  [PRIVACY.md](PRIVACY.md).
- **Side panel, not pop-up.** Pie lives in Chrome's side panel and stays
  open while you browse — chat, run agent tasks, manage tabs without losing
  context.
- **Asks before it acts.** Risk-classified confirm cards gate destructive
  or cross-origin actions, so you stay in informed control.
- **Multi-session, durable.** Conversations survive Service Worker
  restarts; archived sessions evict on storage pressure (LRU + 30-day hard
  delete).

## Features

### Page understanding
Ask questions about the page you're on. Pie extracts visible text (with
hardened scrubbing of credential fields) and sends only that to the LLM.

### Agent automation
Describe a task in natural language; the LLM plans steps and executes them
through a tool registry — DOM clicks, typing, selecting, scrolling, page
snapshots, and (opt-in) raw keyboard simulation via Chrome DevTools
Protocol for canvas editors like Feishu Docs.

### Smart tab management
Cross-tab agent tools (`list_tabs`, `close_tabs`, `group_tabs`,
`activate_tab`, `get_tab_content`, ...) plus three ready-to-use skills:
`auto_group_tabs`, `close_duplicate_tabs`, `close_inactive_tabs`. Write
your own in the SkillsList editor — Pie enforces an 8-guard capability
boundary so a skill cannot escape its declared tool whitelist.

### Supported providers

| Provider | Notes |
|---|---|
| Anthropic Claude | Native API + native `tool_use` |
| OpenAI | OpenAI `function_calling` |
| OpenRouter | OpenAI-compatible |
| MiniMax | OpenAI-compatible |
| ZhiPu (智谱) | OpenAI-compatible |
| Bailian (百炼) | OpenAI-compatible |

Adding a provider is a registry entry plus a host permission. Gemini and
local Ollama are on the [roadmap](docs/ROADMAP.md).

## Install

Pie is in **MVP pre-release**. Installation is via an unpacked developer
build; a Chrome Web Store listing is in preparation.

### Prerequisites

- [Node.js](https://nodejs.org) 20+
- [pnpm](https://pnpm.io) 10+
- A Chromium-based browser with side-panel support (Chrome 114+, Edge,
  Brave, Arc, …)

### Build and load

```bash
git clone https://github.com/WiseriaAI/Pie.git
cd Pie
pnpm install
pnpm build
```

Then in your browser:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the generated `dist/` directory
4. Pin Pie to the toolbar; click the icon to open the side panel

## Configuration

1. Open the side panel and switch to the **Settings** tab
2. Add a provider entry — paste your API key, choose a model
3. Switch back to **Chat** and send a message

Your key is encrypted before it lands in `chrome.storage.local`. The
encryption key itself is generated locally on first run and never leaves
the device.

## Privacy & security

- BYOK: your API key never leaves the device, except as an `Authorization`
  header on direct provider API calls
- All page content delivered to the LLM is wrapped in `<untrusted_*>` tags,
  hardening against prompt injection from page DOM
- Cross-origin tab actions and high-risk DOM actions require an explicit
  confirm card — Pie shows you exactly what would happen, on which origin,
  before it runs
- No telemetry, no analytics, no third parties

Full policy: [PRIVACY.md](PRIVACY.md).

## Development

```bash
pnpm install
pnpm dev          # Vite dev server with HMR
pnpm test         # Vitest, single run
pnpm test:watch   # Vitest, watch mode
pnpm build        # Production build to dist/
```

When developing, load the unpacked extension from `dist/` (after the first
`pnpm dev` run), and click the **Reload** button in `chrome://extensions`
after each service-worker change.

### Tech stack

- Chrome Extension Manifest V3
- React 19 + TypeScript 6
- TailwindCSS 4 (Vite plugin, no config file)
- Vite 8 + `@crxjs/vite-plugin` 2.4
- pnpm

### Project layout

| Path | Purpose |
|---|---|
| `src/background/` | Service Worker — message routing, agent loop dispatch, keep-alive |
| `src/sidepanel/` | React side-panel UI (Chat, Settings, session drawer) |
| `src/lib/model-router/` | Unified LLM interface; per-provider streaming + tool calling |
| `src/lib/agent/` | ReAct loop, tool registry, risk classifier, prompt builder |
| `src/lib/dom-actions/` | Self-contained DOM action functions injected via `executeScript` |
| `src/lib/skills/` | Skill framework: types, storage, built-in skills |
| `src/lib/sessions/` | Session lifecycle: persistence, archive, multi-session sandbox |

Architectural notes and invariant traces live in `docs/solutions/`. The
project's compound-engineering notes and contributor guidance are in
[`CLAUDE.md`](CLAUDE.md).

## Roadmap

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the deferred-milestone
backlog. Highlights:

- Gemini provider
- Local model support via Ollama
- Keyboard shortcuts
- Page-URL-matched skill auto-trigger
- Operation recording → skill autogeneration

## Versioning & releases

Pie follows [Semantic Versioning](https://semver.org). Release notes live
in [CHANGELOG.md](CHANGELOG.md).

## License

Licensed under the [Apache License, Version 2.0](LICENSE) — © 2026 Pie Project Contributors.
