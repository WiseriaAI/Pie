# Pie — Privacy Policy

Last updated: 2026-05-04

Pie is a BYOK (Bring Your Own Key) Chrome Extension. The Pie project does
not operate any backend service, does not collect telemetry, and has no
access to your data.

## What we don't do

- We don't have a server. Pie has no backend that could receive your data.
- We don't collect analytics, page contents, prompts, or browsing history.
- We don't read `chrome.history`, sync data across devices, or share
  anything with third parties.
- We don't track you across sites.

## What stays on your device

The following are stored only in `chrome.storage.local`, on the device
where you installed Pie:

- **API keys** — encrypted with AES-GCM (Web Crypto API). The encryption
  key is generated locally and stored alongside the ciphertext in
  `chrome.storage.local`. Pie never transmits your API key to anyone other
  than the LLM provider you configured.
- **Sessions** — your conversation history, pinned tab references, and
  user-authored skills.
- **Preferences** — UI settings (theme, CDP keyboard toggle, etc.).

## What gets sent off-device, and to whom

When you run a chat or an agent task, Pie sends data **only to the LLM
provider you configured** (Anthropic, OpenAI, OpenRouter, MiniMax, ZhiPu,
or Bailian). Specifically:

- The chat messages you typed.
- Page snippets the agent reads on your behalf to complete a task.
- Tool-call descriptions and tool results from agent actions.

These transmissions go directly from your browser to the provider's API
endpoint — Pie has no proxy in between. The data is then subject to that
provider's privacy policy.

## Permissions, and why each one is needed

| Permission | Why |
|---|---|
| `<all_urls>` host permission | Read page content and inject DOM action scripts |
| `tabs`, `tabGroups` | Multi-tab agent tools (list / activate / close / group) |
| `scripting` | `chrome.scripting.executeScript` for DOM operations |
| `debugger` | CDP keyboard simulation for canvas editors (e.g. Feishu Docs); off by default, opt-in toggle in Settings |
| `sidePanel` | Render the Pie UI |
| `storage` | Persist sessions, encrypted API keys, and preferences |
| `activeTab` | Required by some Chrome APIs even when `<all_urls>` is granted |

Pie deliberately does **not** request `incognito` access, `chrome.history`,
or any cross-device sync permission.

## Removing your data

Uninstalling Pie from `chrome://extensions` removes all
`chrome.storage.local` state, including encrypted API keys. There is
nothing to delete server-side because there is no server.

## Contact

Issues and questions: <https://github.com/WiseriaAI/Pie/issues>
