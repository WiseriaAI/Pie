# Chrome AI Agent

BYOK (Bring Your Own Key) Chrome Extension — 用户插入自己的 API key 获得 AI 浏览器能力。

## Tech Stack

- Chrome Extension Manifest V3
- React + TypeScript
- TailwindCSS v4
- Vite + @crxjs/vite-plugin
- pnpm

## Project Structure

- `src/background/` — Service Worker (Agent Engine, Model Router, Tab Manager)
- `src/content/` — Content Script (DOM access, page analysis, element operations)
- `src/sidepanel/` — Sidebar UI (React)
- `src/lib/model-router/` — Unified LLM interface (Anthropic/OpenAI/Google/Ollama)
- `src/types/` — Shared type definitions

## Commands

- `pnpm dev` — Start dev server with HMR
- `pnpm build` — Build for production
- `pnpm preview` — Preview production build

## Development

1. `pnpm dev` starts the Vite dev server
2. Go to `chrome://extensions`, enable Developer mode
3. Load unpacked from `dist/` directory
4. Click extension icon to open side panel

## Architecture Notes

- API keys encrypted with Web Crypto API (AES-GCM) in chrome.storage.local
- Content Script uses `activeTab` + dynamic injection (no `<all_urls>`)
- Element targeting: accessibility tree + DOM hybrid (aria labels → CSS selectors → text matching)
- Service Worker 5-min timeout: long tasks split into short chains with state persisted to chrome.storage.session
