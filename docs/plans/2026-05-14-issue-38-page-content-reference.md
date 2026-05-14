---
status: ready-for-execution
spec: docs/specs/2026-05-14-issue-38-page-content-reference-design.md
issue: https://github.com/WiseriaAI/Pie/issues/38
preview: docs/specs/2026-05-14-issue-38-preview.html
---

# Issue #38 v1 — Page Content Reference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement v1 of "引用页内内容" — users can select page text or pick a DOM element from any tab, surface it as a chip in the composer chip row, and have it serialized into the next user turn as an `<untrusted_page_quote>` wrapper + image content block.

**Architecture:** First-ever permanent content script (`src/content/quote/`) handles in-page UI (selection bubble + element picker overlay). A thin SW module `quote-bridge.ts` routes payloads, crops bbox screenshots, and broadcasts picker enter/exit. Sidepanel `useSession` gains a per-session `quotes: Quote[]` field (M3-U6 model). Send-time serialization places image content blocks first, then a text block wrapping new untrusted-tag literals. No persistence — chips clear after send / session switch / SW restart.

**Tech Stack:** Manifest V3, React 19 + TypeScript 6, Vite 8 + `@crxjs/vite-plugin` 2.4 (auto-handles `content_scripts` from manifest), Vitest + happy-dom + @testing-library/react.

**Symbol-name caveat for implementer:** plan references several internal codebase symbols by best-effort name (e.g. `panelPortsBySession`, `setSlots`, `session.port`, `session.setActiveSession`, `makeSession` factory in `Chat.test.tsx`, send-button accessible-name `/发送/`). These are inferred from a reconnaissance pass; verify each against current source before relying on it. If a name differs, adjust the task in place — don't fight the codebase.

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `src/types/quotes.ts` | `Quote` union type + panel↔SW wire message types |
| `src/content/quote/index.ts` | Content script entry: register listeners + handle SW messages |
| `src/content/quote/bbox-extractor.ts` | Pure metadata extraction from a DOM `Element` (role / accessibleName / textContent / outerHTML / bbox) |
| `src/content/quote/floating-bubble.ts` | Shadow DOM bubble render + click handler |
| `src/content/quote/selection-listener.ts` | `mouseup` + `selectionchange` listener + anchor computation |
| `src/content/quote/element-picker.ts` | Hover-highlight overlay + click selection + Esc exit |
| `src/background/quote-bridge.ts` | SW-side route + screenshot crop + picker RPC |
| `src/lib/images/crop-bbox.ts` | Util: crop dataURL by bbox → JPEG q85 dataURL |
| `src/sidepanel/components/QuoteChip.tsx` | Chip visual for text / element quotes, with hover popover |
| `src/sidepanel/components/__tests__/cross-layer-quote.test.tsx` | content → SW → panel → DisplayMessage integration |
| Each module's `*.test.ts(x)` next to source |

### Modified files

| Path | Change |
|---|---|
| `manifest.json` | Add `content_scripts: [{matches: ["<all_urls>"], js: ["src/content/index.ts"], run_at: "document_idle", all_frames: false}]` |
| `src/content/index.ts` | Replace placeholder with `import("./quote")` |
| `src/lib/agent/untrusted-wrappers.ts` | `UNTRUSTED_WRAPPER_TAGS` += `untrusted_page_quote`, `untrusted_page_element` |
| `src/types/index.ts` | Re-export `quotes` module |
| `src/sidepanel/hooks/useSession/runtime-map.ts` | `SessionRuntimeSlot` += `quotes: Quote[]`; `EMPTY_SLOT.quotes = []` |
| `src/sidepanel/hooks/useSession/index.ts` | `addQuote` / `removeQuote` / `clearQuotes` methods + `quote-added` port handler |
| `src/sidepanel/components/Chat.tsx` | Composer chip row renders `QuoteChip[]` + 拾取元素 button; pre-submit serialize quotes into user message content array |
| `src/background/index.ts` | Wire QuoteBridge: `chrome.runtime.onMessage` external listener + panel port `picker:start/stop` dispatch |
| `docs/release-notes/v0.10.0.md` | New file |
| `docs/ROADMAP.md` | Update §12 #38 status |

---

## Invariant Index (referenced throughout)

| ID | Description | Source |
|---|---|---|
| R15 | Image untrusted boundary in system prompt | Phase 5 v1 |
| R13/R14 | Image cache LRU evict + image-bearing paused→failed | Phase 5 v1 |
| M3-U6 | Per-session state hub (`Map<sessionId, SessionRuntimeSlot>`) | PR #30 |
| W-1 | Content script registers listeners at module load — no DOMContentLoaded gate; survives SPA route changes | spec §3.6 |
| W-2 | All bubble / picker DOM lives in Shadow DOM attached to `document.documentElement` | spec §3.6 |
| W-3 | `sender.tab.id === undefined` → drop message (untrusted origin) | spec §4.2 |
| W-4 | Chip id generated SW-side via `crypto.randomUUID()`, not by content script | spec §4.2 |
| W-5 | `captureVisibleTab` requires `windowId`; SW first calls `chrome.tabs.get(tabId)` for `windowId` | implementation detail |
| W-6 | Quotes are not persisted (no storage write); cleared on send / session switch / SW restart | spec §2.1 |
| W-7 | Quotes per-session via `SessionRuntimeSlot.quotes` (M3-U6 model) | spec §2.1 |
| W-8 | LLM wire: image content blocks (image-bearing chip subsequence, in chip add order) come BEFORE the text block; the text block contains all wrappers + plain text input | spec §6.3 |

---

## Task 1: Types + Wire schema

**Files:**
- Create: `src/types/quotes.ts`
- Modify: `src/types/index.ts`
- Test: `src/types/quotes.test.ts`

**Context:** Define the `Quote` union type (text + element variants) and all panel↔SW wire message types. This is the foundation other tasks import from.

- [ ] **Step 1: Write the failing test**

Create `src/types/quotes.test.ts`:

```typescript
import { describe, it, expectTypeOf } from "vitest";
import type {
  Quote,
  TextQuote,
  ElementQuote,
  QuoteTextCapturedMessage,
  QuoteElementCapturedMessage,
  QuoteAddedMessage,
  PickerStartMessage,
  PickerStopMessage,
  PickerEnterMessage,
  PickerExitMessage,
} from "./quotes";

describe("Quote types", () => {
  it("TextQuote shape", () => {
    expectTypeOf<TextQuote>().toEqualTypeOf<{
      id: string;
      kind: "text";
      text: string;
      sourceUrl: string;
      sourceTabId: number;
    }>();
  });

  it("ElementQuote allows null imageDataUrl", () => {
    const q: ElementQuote = {
      id: "x",
      kind: "element",
      role: "button",
      accessibleName: "Create",
      textContent: "New issue",
      outerHTMLTruncated: "<button>New issue</button>",
      imageDataUrl: null,
      sourceUrl: "https://example.com",
      sourceTabId: 1,
    };
    expectTypeOf(q).toMatchTypeOf<ElementQuote>();
  });

  it("Quote is union of TextQuote and ElementQuote", () => {
    expectTypeOf<Quote>().toEqualTypeOf<TextQuote | ElementQuote>();
  });

  it("wire message types exist", () => {
    expectTypeOf<QuoteTextCapturedMessage>().toMatchTypeOf<{
      type: "quote-text-captured";
      payload: { text: string; sourceUrl: string };
    }>();
    expectTypeOf<QuoteElementCapturedMessage>().toMatchTypeOf<{
      type: "quote-element-captured";
    }>();
    expectTypeOf<QuoteAddedMessage>().toMatchTypeOf<{
      type: "quote-added";
      quote: Quote;
    }>();
    expectTypeOf<PickerStartMessage>().toMatchTypeOf<{ type: "picker:start"; tabId: number }>();
    expectTypeOf<PickerStopMessage>().toMatchTypeOf<{ type: "picker:stop"; tabId: number }>();
    expectTypeOf<PickerEnterMessage>().toMatchTypeOf<{ type: "picker:enter" }>();
    expectTypeOf<PickerExitMessage>().toMatchTypeOf<{ type: "picker:exit" }>();
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `pnpm vitest run src/types/quotes.test.ts`
Expected: fail with "Cannot find module './quotes'".

- [ ] **Step 3: Write `src/types/quotes.ts`**

```typescript
export type TextQuote = {
  id: string;
  kind: "text";
  text: string;
  sourceUrl: string;
  sourceTabId: number;
};

export type ElementQuote = {
  id: string;
  kind: "element";
  role: string;
  accessibleName: string;
  textContent: string; // truncated to 500 chars
  outerHTMLTruncated: string; // truncated to 1000 chars
  imageDataUrl: string | null; // JPEG q85 dataURL, or null when captureVisibleTab fails
  sourceUrl: string;
  sourceTabId: number;
};

export type Quote = TextQuote | ElementQuote;

// --- content → SW ---
export type QuoteTextCapturedMessage = {
  type: "quote-text-captured";
  payload: { text: string; sourceUrl: string };
};

export type QuoteElementCapturedMessage = {
  type: "quote-element-captured";
  payload: {
    bbox: { x: number; y: number; width: number; height: number };
    devicePixelRatio: number;
    role: string;
    accessibleName: string;
    textContent: string;
    outerHTMLTruncated: string;
    sourceUrl: string;
  };
};

// --- SW → panel ---
export type QuoteAddedMessage = {
  type: "quote-added";
  quote: Quote;
};

// --- panel → SW ---
export type PickerStartMessage = { type: "picker:start"; tabId: number };
export type PickerStopMessage = { type: "picker:stop"; tabId: number };

// --- SW → content (chrome.tabs.sendMessage) ---
export type PickerEnterMessage = { type: "picker:enter" };
export type PickerExitMessage = { type: "picker:exit" };
```

- [ ] **Step 4: Update `src/types/index.ts` re-exports**

Modify `src/types/index.ts` — append:

```typescript
export type {
  Quote,
  TextQuote,
  ElementQuote,
  QuoteTextCapturedMessage,
  QuoteElementCapturedMessage,
  QuoteAddedMessage,
  PickerStartMessage,
  PickerStopMessage,
  PickerEnterMessage,
  PickerExitMessage,
} from "./quotes";
```

- [ ] **Step 5: Run tests, verify PASS**

Run: `pnpm vitest run src/types/quotes.test.ts`
Expected: PASS, 4 cases.

- [ ] **Step 6: Commit**

```bash
git add src/types/quotes.ts src/types/quotes.test.ts src/types/index.ts
git commit -m "feat(quotes): add Quote types + panel<->SW wire schema"
```

---

## Task 2: Untrusted wrappers extension

**Files:**
- Modify: `src/lib/agent/untrusted-wrappers.ts:41-48`
- Test: `src/lib/agent/untrusted-wrappers.test.ts` (existing — add cases)

**Context:** Add 2 new wrapper tags to `UNTRUSTED_WRAPPER_TAGS`. The regex (`WRAPPER_RE`, line 80) auto-picks them up via `TAG_ALT` join. Verify both new tags get the full 8-mode closing-tag confusable sanitize.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/agent/untrusted-wrappers.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { escapeUntrustedWrappers, escapeWrapperAttribute } from "./untrusted-wrappers";

describe("untrusted_page_quote / untrusted_page_element sanitize", () => {
  it("escapes plain closing tag", () => {
    expect(escapeUntrustedWrappers("</untrusted_page_quote>")).toContain("&lt;/untrusted_page_quote&gt;");
    expect(escapeUntrustedWrappers("</untrusted_page_element>")).toContain("&lt;/untrusted_page_element&gt;");
  });

  it("escapes fullwidth bracket variant", () => {
    expect(escapeUntrustedWrappers("＜/untrusted_page_quote＞")).toContain("&lt;/untrusted_page_quote&gt;");
  });

  it("escapes zero-width injection", () => {
    // Zero-width space hidden inside the tag name
    const attack = "<​/untrusted_page_element>";
    expect(escapeUntrustedWrappers(attack)).toContain("&lt;/untrusted_page_element&gt;");
  });

  it("escapeWrapperAttribute handles quote / lt / gt in source_url", () => {
    const v = `https://x.test/?q="><tag`;
    expect(escapeWrapperAttribute(v)).toBe(`https://x.test/?q=&quot;&gt;&lt;tag`);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `pnpm vitest run src/lib/agent/untrusted-wrappers.test.ts`
Expected: the 3 new cases fail (the closing-tag string passes through unmodified because the tag name is unknown). The `escapeWrapperAttribute` case may already pass.

- [ ] **Step 3: Edit `UNTRUSTED_WRAPPER_TAGS`**

Modify `src/lib/agent/untrusted-wrappers.ts` lines 41-48:

```typescript
export const UNTRUSTED_WRAPPER_TAGS = [
  "untrusted_page_content",
  "untrusted_skill_params",
  "untrusted_tab_metadata",
  "untrusted_user_message",
  "untrusted_prior_task_summary",
  "untrusted_continuity_marker",
  "untrusted_page_quote",
  "untrusted_page_element",
] as const;
```

- [ ] **Step 4: Run all wrapper tests, verify PASS**

Run: `pnpm vitest run src/lib/agent/untrusted-wrappers.test.ts`
Expected: PASS (all cases including the 4 new ones).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/untrusted-wrappers.ts src/lib/agent/untrusted-wrappers.test.ts
git commit -m "feat(quotes): register page_quote/page_element wrapper tags"
```

---

## Task 3: Bbox metadata extractor

**Files:**
- Create: `src/content/quote/bbox-extractor.ts`
- Test: `src/content/quote/bbox-extractor.test.ts`

**Context:** Pure DOM-→-payload function. Given a clicked element, return `{role, accessibleName, textContent (≤500), outerHTMLTruncated (≤1000), bbox, devicePixelRatio}`. Uses ARIA role fallback chain: `[role]` → element tag → `"generic"`. `accessibleName` uses `aria-label` → `aria-labelledby` (resolved) → `<label for=...>` → ancestor `<label>` → textContent first line. happy-dom supports all of this.

- [ ] **Step 1: Write the failing test**

Create `src/content/quote/bbox-extractor.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { extractElementQuotePayload } from "./bbox-extractor";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("extractElementQuotePayload", () => {
  it("returns role from explicit aria role attribute", () => {
    document.body.innerHTML = `<div role="button" id="t">Click me</div>`;
    const el = document.getElementById("t")!;
    const out = extractElementQuotePayload(el, "https://example.com");
    expect(out.role).toBe("button");
  });

  it("falls back to tagName lowercase when no role", () => {
    document.body.innerHTML = `<button id="t">Send</button>`;
    const el = document.getElementById("t")!;
    expect(extractElementQuotePayload(el, "https://x").role).toBe("button");
  });

  it("accessibleName via aria-label", () => {
    document.body.innerHTML = `<button id="t" aria-label="Close dialog">X</button>`;
    const el = document.getElementById("t")!;
    expect(extractElementQuotePayload(el, "https://x").accessibleName).toBe("Close dialog");
  });

  it("accessibleName via label[for]", () => {
    document.body.innerHTML = `<label for="t">Username</label><input id="t" />`;
    const el = document.getElementById("t")!;
    expect(extractElementQuotePayload(el, "https://x").accessibleName).toBe("Username");
  });

  it("accessibleName via textContent fallback", () => {
    document.body.innerHTML = `<button id="t">Create issue</button>`;
    const el = document.getElementById("t")!;
    expect(extractElementQuotePayload(el, "https://x").accessibleName).toBe("Create issue");
  });

  it("textContent truncated to 500 chars", () => {
    document.body.innerHTML = `<div id="t">${"a".repeat(700)}</div>`;
    const el = document.getElementById("t")!;
    expect(extractElementQuotePayload(el, "https://x").textContent.length).toBe(500);
  });

  it("outerHTML truncated to 1000 chars", () => {
    document.body.innerHTML = `<div id="t">${"a".repeat(2000)}</div>`;
    const el = document.getElementById("t")!;
    expect(extractElementQuotePayload(el, "https://x").outerHTMLTruncated.length).toBe(1000);
  });

  it("bbox uses getBoundingClientRect + devicePixelRatio", () => {
    document.body.innerHTML = `<div id="t">x</div>`;
    const el = document.getElementById("t")!;
    const r = el.getBoundingClientRect();
    const out = extractElementQuotePayload(el, "https://x");
    expect(out.bbox).toEqual({ x: r.x, y: r.y, width: r.width, height: r.height });
    expect(out.devicePixelRatio).toBe(window.devicePixelRatio);
  });

  it("propagates sourceUrl", () => {
    document.body.innerHTML = `<button id="t">x</button>`;
    const el = document.getElementById("t")!;
    expect(extractElementQuotePayload(el, "https://foo.test/page").sourceUrl).toBe("https://foo.test/page");
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `pnpm vitest run src/content/quote/bbox-extractor.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/content/quote/bbox-extractor.ts`:

```typescript
import type { QuoteElementCapturedMessage } from "@/types";

type Payload = QuoteElementCapturedMessage["payload"];

function getRole(el: Element): string {
  const explicit = el.getAttribute("role");
  if (explicit) return explicit;
  return el.tagName.toLowerCase();
}

function getAccessibleName(el: Element): string {
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel.trim();

  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const ref = el.ownerDocument?.getElementById(labelledBy);
    if (ref?.textContent) return ref.textContent.trim();
  }

  const id = el.id;
  if (id) {
    const label = el.ownerDocument?.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (label?.textContent) return label.textContent.trim();
  }

  const ancestorLabel = el.closest("label");
  if (ancestorLabel?.textContent) return ancestorLabel.textContent.trim();

  return (el.textContent ?? "").trim().split("\n")[0] ?? "";
}

export function extractElementQuotePayload(el: Element, sourceUrl: string): Payload {
  const rect = el.getBoundingClientRect();
  const text = (el.textContent ?? "").slice(0, 500);
  const outerHTML = (el as HTMLElement).outerHTML ?? "";
  return {
    bbox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    devicePixelRatio: window.devicePixelRatio,
    role: getRole(el),
    accessibleName: getAccessibleName(el),
    textContent: text,
    outerHTMLTruncated: outerHTML.slice(0, 1000),
    sourceUrl,
  };
}
```

- [ ] **Step 4: Run test, verify PASS**

Run: `pnpm vitest run src/content/quote/bbox-extractor.test.ts`
Expected: PASS, 9 cases.

- [ ] **Step 5: Commit**

```bash
git add src/content/quote/bbox-extractor.ts src/content/quote/bbox-extractor.test.ts
git commit -m "feat(quotes): extract element metadata for picker payload"
```

---

## Task 4: Crop bbox util

**Files:**
- Create: `src/lib/images/crop-bbox.ts`
- Test: `src/lib/images/crop-bbox.test.ts`

**Context:** Given the dataURL returned by `chrome.tabs.captureVisibleTab`, crop a bbox region (in CSS pixels) using `OffscreenCanvas` + `createImageBitmap`, scaling by `devicePixelRatio`, and re-encode as JPEG q85. SW supports OffscreenCanvas. happy-dom does NOT — we mock these globals in the test (consistent with how Phase 5 image normalize tests mock them).

- [ ] **Step 1: Write the failing test**

Create `src/lib/images/crop-bbox.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cropBboxToJpegDataUrl } from "./crop-bbox";

const mockBitmap = { close: vi.fn() } as unknown as ImageBitmap;
const mockBlob = new Blob(["fake-jpeg"], { type: "image/jpeg" });

beforeEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error mock
  globalThis.createImageBitmap = vi.fn(async () => mockBitmap);
  // @ts-expect-error mock
  globalThis.OffscreenCanvas = vi.fn().mockImplementation((w: number, h: number) => ({
    width: w,
    height: h,
    getContext: () => ({
      drawImage: vi.fn(),
    }),
    convertToBlob: vi.fn(async () => mockBlob),
  }));
  // @ts-expect-error mock
  globalThis.FileReader = vi.fn().mockImplementation(() => ({
    readAsDataURL(b: Blob) {
      setTimeout(() => {
        this.result = "data:image/jpeg;base64,ZmFrZS1qcGVn";
        this.onload?.();
      }, 0);
    },
  }));
});

describe("cropBboxToJpegDataUrl", () => {
  it("returns JPEG dataURL", async () => {
    const out = await cropBboxToJpegDataUrl({
      sourceDataUrl: "data:image/png;base64,xxxx",
      bbox: { x: 10, y: 20, width: 100, height: 50 },
      devicePixelRatio: 2,
    });
    expect(out).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("multiplies bbox by devicePixelRatio for canvas size", async () => {
    const ctor = globalThis.OffscreenCanvas as unknown as ReturnType<typeof vi.fn>;
    await cropBboxToJpegDataUrl({
      sourceDataUrl: "data:image/png;base64,xxxx",
      bbox: { x: 0, y: 0, width: 100, height: 50 },
      devicePixelRatio: 2,
    });
    expect(ctor).toHaveBeenCalledWith(200, 100);
  });

  it("clamps zero-width bbox to 1x1", async () => {
    const ctor = globalThis.OffscreenCanvas as unknown as ReturnType<typeof vi.fn>;
    await cropBboxToJpegDataUrl({
      sourceDataUrl: "data:image/png;base64,xxxx",
      bbox: { x: 0, y: 0, width: 0, height: 0 },
      devicePixelRatio: 1,
    });
    expect(ctor).toHaveBeenCalledWith(1, 1);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `pnpm vitest run src/lib/images/crop-bbox.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/lib/images/crop-bbox.ts`:

```typescript
type Input = {
  sourceDataUrl: string;
  bbox: { x: number; y: number; width: number; height: number };
  devicePixelRatio: number;
};

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function cropBboxToJpegDataUrl({
  sourceDataUrl,
  bbox,
  devicePixelRatio,
}: Input): Promise<string> {
  const sourceBlob = await dataUrlToBlob(sourceDataUrl);
  const bitmap = await createImageBitmap(sourceBlob);
  const dpr = Math.max(devicePixelRatio, 1);
  const w = Math.max(1, Math.round(bbox.width * dpr));
  const h = Math.max(1, Math.round(bbox.height * dpr));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(
    bitmap,
    bbox.x * dpr,
    bbox.y * dpr,
    bbox.width * dpr,
    bbox.height * dpr,
    0,
    0,
    w,
    h,
  );
  (bitmap as ImageBitmap & { close?: () => void }).close?.();
  const outBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
  return blobToDataUrl(outBlob);
}
```

- [ ] **Step 4: Run test, verify PASS**

Run: `pnpm vitest run src/lib/images/crop-bbox.test.ts`
Expected: PASS, 3 cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/images/crop-bbox.ts src/lib/images/crop-bbox.test.ts
git commit -m "feat(quotes): add bbox crop util (OffscreenCanvas + JPEG q85)"
```

---

## Task 5: SW QuoteBridge module

**Files:**
- Create: `src/background/quote-bridge.ts`
- Test: `src/background/quote-bridge.test.ts`

**Context:** Thin module that handles 3 jobs: (a) route `quote-text-captured` from a content script into a `quote-added` panel message; (b) accept `quote-element-captured`, look up the tab's `windowId`, call `chrome.tabs.captureVisibleTab(windowId)`, crop via Task 4 util, emit `quote-added` with `imageDataUrl`; (c) broadcast `picker:enter` / `picker:exit` to a specific tab. Generates chip ids via `crypto.randomUUID()` (W-4). Drops messages with no `sender.tab.id` (W-3). On `captureVisibleTab` failure → `imageDataUrl: null` (still emits chip).

- [ ] **Step 1: Write the failing test**

Create `src/background/quote-bridge.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock MUST be top-level — vitest hoists it before imports.
vi.mock("@/lib/images/crop-bbox", () => ({
  cropBboxToJpegDataUrl: vi.fn(async () => "data:image/jpeg;base64,Y3JvcA=="),
}));

import {
  handleQuoteTextCaptured,
  handleQuoteElementCaptured,
  broadcastPickerEnter,
  broadcastPickerExit,
} from "./quote-bridge";

beforeEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error
  globalThis.chrome = {
    tabs: {
      get: vi.fn(async (id: number) => ({ id, windowId: 7, url: "https://example.com" })),
      captureVisibleTab: vi.fn(async () => "data:image/png;base64,xxxx"),
      sendMessage: vi.fn(),
    },
    runtime: { lastError: null },
  };
  // @ts-expect-error
  globalThis.crypto = { randomUUID: () => "u-1" };
});

describe("QuoteBridge", () => {
  it("text capture → quote-added with stable id + sourceTabId", async () => {
    const sender = { tab: { id: 42 } } as chrome.runtime.MessageSender;
    const out = await handleQuoteTextCaptured(sender, {
      text: "hi",
      sourceUrl: "https://example.com",
    });
    expect(out).toEqual({
      type: "quote-added",
      quote: {
        id: "u-1",
        kind: "text",
        text: "hi",
        sourceUrl: "https://example.com",
        sourceTabId: 42,
      },
    });
  });

  it("text capture → null when sender.tab.id missing (W-3)", async () => {
    const out = await handleQuoteTextCaptured(
      {} as chrome.runtime.MessageSender,
      { text: "hi", sourceUrl: "x" },
    );
    expect(out).toBeNull();
  });

  it("element capture → quote-added with cropped image", async () => {
    const sender = { tab: { id: 42 } } as chrome.runtime.MessageSender;
    const out = await handleQuoteElementCaptured(sender, {
      bbox: { x: 0, y: 0, width: 10, height: 10 },
      devicePixelRatio: 2,
      role: "button",
      accessibleName: "Create",
      textContent: "New issue",
      outerHTMLTruncated: "<button>New issue</button>",
      sourceUrl: "https://example.com",
    });
    expect(out?.quote.kind).toBe("element");
    if (out?.quote.kind !== "element") throw new Error("guard");
    expect(out.quote.imageDataUrl).toBe("data:image/jpeg;base64,Y3JvcA==");
    expect(out.quote.role).toBe("button");
  });

  it("element capture → imageDataUrl=null when captureVisibleTab throws", async () => {
    // @ts-expect-error
    chrome.tabs.captureVisibleTab = vi.fn(async () => {
      throw new Error("Permission denied");
    });
    const sender = { tab: { id: 42 } } as chrome.runtime.MessageSender;
    const out = await handleQuoteElementCaptured(sender, {
      bbox: { x: 0, y: 0, width: 10, height: 10 },
      devicePixelRatio: 1,
      role: "button",
      accessibleName: "x",
      textContent: "x",
      outerHTMLTruncated: "<x />",
      sourceUrl: "https://example.com",
    });
    expect(out?.quote.kind === "element" && out.quote.imageDataUrl).toBe(null);
  });

  it("broadcastPickerEnter → tabs.sendMessage", async () => {
    await broadcastPickerEnter(42);
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(42, { type: "picker:enter" });
  });

  it("broadcastPickerExit → tabs.sendMessage", async () => {
    await broadcastPickerExit(42);
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(42, { type: "picker:exit" });
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `pnpm vitest run src/background/quote-bridge.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/background/quote-bridge.ts`:

```typescript
import { cropBboxToJpegDataUrl } from "@/lib/images/crop-bbox";
import type {
  QuoteTextCapturedMessage,
  QuoteElementCapturedMessage,
  QuoteAddedMessage,
  Quote,
} from "@/types";

function newId(): string {
  return crypto.randomUUID();
}

export async function handleQuoteTextCaptured(
  sender: chrome.runtime.MessageSender,
  payload: QuoteTextCapturedMessage["payload"],
): Promise<QuoteAddedMessage | null> {
  const tabId = sender.tab?.id;
  if (typeof tabId !== "number") return null; // W-3
  const quote: Quote = {
    id: newId(), // W-4
    kind: "text",
    text: payload.text,
    sourceUrl: payload.sourceUrl,
    sourceTabId: tabId,
  };
  return { type: "quote-added", quote };
}

export async function handleQuoteElementCaptured(
  sender: chrome.runtime.MessageSender,
  payload: QuoteElementCapturedMessage["payload"],
): Promise<QuoteAddedMessage | null> {
  const tabId = sender.tab?.id;
  if (typeof tabId !== "number") return null; // W-3

  let imageDataUrl: string | null = null;
  try {
    const tab = await chrome.tabs.get(tabId); // W-5: need windowId
    if (typeof tab.windowId === "number") {
      const visibleDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: "png",
      });
      imageDataUrl = await cropBboxToJpegDataUrl({
        sourceDataUrl: visibleDataUrl,
        bbox: payload.bbox,
        devicePixelRatio: payload.devicePixelRatio,
      });
    }
  } catch {
    imageDataUrl = null;
  }

  const quote: Quote = {
    id: newId(),
    kind: "element",
    role: payload.role,
    accessibleName: payload.accessibleName,
    textContent: payload.textContent,
    outerHTMLTruncated: payload.outerHTMLTruncated,
    imageDataUrl,
    sourceUrl: payload.sourceUrl,
    sourceTabId: tabId,
  };
  return { type: "quote-added", quote };
}

export async function broadcastPickerEnter(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "picker:enter" });
  } catch {
    // tab no longer alive — silent
  }
}

export async function broadcastPickerExit(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "picker:exit" });
  } catch {
    // tab no longer alive — silent
  }
}
```

- [ ] **Step 4: Run test, verify PASS**

Run: `pnpm vitest run src/background/quote-bridge.test.ts`
Expected: PASS, 6 cases.

- [ ] **Step 5: Commit**

```bash
git add src/background/quote-bridge.ts src/background/quote-bridge.test.ts
git commit -m "feat(quotes): add SW QuoteBridge (route + crop + picker RPC)"
```

---

## Task 6: Wire QuoteBridge into SW

**Files:**
- Modify: `src/background/index.ts:1145-1179` (panel-port switch) + top-level `chrome.runtime.onMessage` listener
- Test: append to `src/background/quote-bridge.test.ts` an integration case OR create `src/background/quote-bridge-wire.test.ts`

**Context:** Two wires:
1. **content → SW**: register `chrome.runtime.onMessage.addListener` at SW init. Dispatch `quote-text-captured` / `quote-element-captured` → `handleQuote*` → forward result to active panel port (resolved via `lastActivePanelPort` ref; see panel port map in `index.ts:1077-1081`).
2. **panel → SW**: extend the existing `port.onMessage` switch (line ~1145) with `picker:start` / `picker:stop` cases → call `broadcastPickerEnter/Exit(tabId)`.

The "active panel port for a given session" lookup is already used by `port.postMessage()` paths (line ~569, ~840). We reuse that registry. If no panel for a sessionId is connected, quote payload is dropped silently (the user's panel is closed — chip would have nowhere to go).

- [ ] **Step 1: Write the integration test**

Create `src/background/quote-bridge-wire.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// We test the wired listener by importing the SW init function and
// driving it with mocks. Adjust import per actual export from index.ts.
import { __test__registerQuoteListeners } from "./index";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("SW quote wire", () => {
  it("content quote-text-captured → forwards quote-added to panel port", async () => {
    const listeners: Array<(msg: unknown, sender: unknown, sendResponse: (r: unknown) => void) => boolean | undefined> = [];
    // @ts-expect-error mock
    globalThis.chrome = {
      runtime: {
        onMessage: { addListener: (fn: typeof listeners[number]) => listeners.push(fn) },
        lastError: null,
      },
      tabs: { get: vi.fn(), captureVisibleTab: vi.fn(), sendMessage: vi.fn() },
    };
    // @ts-expect-error
    globalThis.crypto = { randomUUID: () => "u-1" };
    const port = { name: "chat-stream-S1", postMessage: vi.fn() };
    const registry = new Map<string, typeof port>([["S1", port]]);
    __test__registerQuoteListeners({
      getActivePanelPortForTab: (_tabId: number) => port,
      getAllPanelPorts: () => Array.from(registry.values()),
    });

    const fn = listeners[0];
    expect(fn).toBeTruthy();
    const sendResponse = vi.fn();
    const sender = { tab: { id: 42 } };
    fn!({ type: "quote-text-captured", payload: { text: "hi", sourceUrl: "https://x" } }, sender, sendResponse);
    await new Promise((r) => setTimeout(r, 0));

    expect(port.postMessage).toHaveBeenCalledWith({
      type: "quote-added",
      quote: { id: "u-1", kind: "text", text: "hi", sourceUrl: "https://x", sourceTabId: 42 },
    });
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `pnpm vitest run src/background/quote-bridge-wire.test.ts`
Expected: FAIL — `__test__registerQuoteListeners` missing.

- [ ] **Step 3: Implement wire**

Append to `src/background/index.ts` (after the existing port wiring near line 1180 — keep additions self-contained):

```typescript
import {
  handleQuoteTextCaptured,
  handleQuoteElementCaptured,
  broadcastPickerEnter,
  broadcastPickerExit,
} from "./quote-bridge";

type PanelPortRegistry = {
  getActivePanelPortForTab(tabId: number): chrome.runtime.Port | undefined;
  getAllPanelPorts(): chrome.runtime.Port[];
};

// Exported for tests; wires content→SW message listener for quote routing.
export function __test__registerQuoteListeners(registry: PanelPortRegistry): void {
  chrome.runtime.onMessage.addListener((message, sender, _sendResponse) => {
    void (async () => {
      if (!message || typeof message !== "object") return;
      const m = message as { type?: string };
      if (m.type === "quote-text-captured") {
        const out = await handleQuoteTextCaptured(sender, (message as any).payload);
        if (!out) return;
        // Broadcast to every connected panel: the chip will land in whichever
        // session's slot the active panel is on (panel chooses by activeId).
        for (const port of registry.getAllPanelPorts()) {
          try { port.postMessage(out); } catch { /* port closed */ }
        }
      } else if (m.type === "quote-element-captured") {
        const out = await handleQuoteElementCaptured(sender, (message as any).payload);
        if (!out) return;
        for (const port of registry.getAllPanelPorts()) {
          try { port.postMessage(out); } catch { /* port closed */ }
        }
      }
    })();
    // No sync response needed.
    return false;
  });
}

// Wire at SW init using the existing panel port map. Replace the
// `getAllPanelPorts` body with whatever the existing index.ts uses to
// iterate panel ports (e.g. `Array.from(panelPortsBySession.values())`).
__test__registerQuoteListeners({
  getActivePanelPortForTab: (_tabId) => undefined, // unused in v1 broadcast model
  getAllPanelPorts: () => Array.from(panelPortsBySession.values()),
});
```

Then extend the panel-port `port.onMessage` switch (existing around line 1145):

```typescript
// existing switch (msg.type) { ... }
//   case "panel-mounted": ...
//   case "chat-start": ...
//   ADD:
case "picker:start": {
  const m = msg as { type: "picker:start"; tabId: number };
  void broadcastPickerEnter(m.tabId);
  break;
}
case "picker:stop": {
  const m = msg as { type: "picker:stop"; tabId: number };
  void broadcastPickerExit(m.tabId);
  break;
}
```

- [ ] **Step 4: Run test, verify PASS**

Run: `pnpm vitest run src/background/quote-bridge-wire.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint + build smoke check**

Run: `pnpm build`
Expected: success (no TS errors).

- [ ] **Step 6: Commit**

```bash
git add src/background/index.ts src/background/quote-bridge-wire.test.ts
git commit -m "feat(quotes): wire QuoteBridge listeners into service worker"
```

---

## Task 7: Floating bubble (Shadow DOM)

**Files:**
- Create: `src/content/quote/floating-bubble.ts`
- Test: `src/content/quote/floating-bubble.test.ts`

**Context:** Render a small clickable bubble inside a Shadow DOM container attached to `document.documentElement`. Position is `position: fixed` with explicit `top`/`left`; the bubble appears ABOVE the selection's end rect when there's room, else falls back BELOW (W-2). One bubble at a time. Show/hide is idempotent. Click → invoke callback.

- [ ] **Step 1: Write the failing test**

Create `src/content/quote/floating-bubble.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { showBubble, hideBubble, __test__isVisible } from "./floating-bubble";

beforeEach(() => {
  document.body.innerHTML = "";
  document.documentElement.querySelectorAll("[data-pie-quote-bubble]").forEach((el) => el.remove());
  Object.defineProperty(window, "innerHeight", { value: 1000, writable: true });
  Object.defineProperty(window, "innerWidth", { value: 1280, writable: true });
});

describe("floating bubble", () => {
  it("renders a host element in Shadow DOM", () => {
    showBubble({ anchorTop: 100, anchorLeft: 200, onClick: vi.fn() });
    const host = document.documentElement.querySelector("[data-pie-quote-bubble]");
    expect(host).not.toBeNull();
    expect(host?.shadowRoot).not.toBeNull();
  });

  it("places bubble ABOVE selection when room above", () => {
    showBubble({ anchorTop: 500, anchorLeft: 200, onClick: vi.fn() });
    const host = document.documentElement.querySelector<HTMLElement>("[data-pie-quote-bubble]")!;
    const styleTop = parseInt(host.style.top, 10);
    expect(styleTop).toBeLessThan(500);
  });

  it("falls back BELOW when no room above", () => {
    showBubble({ anchorTop: 5, anchorLeft: 200, onClick: vi.fn() });
    const host = document.documentElement.querySelector<HTMLElement>("[data-pie-quote-bubble]")!;
    const styleTop = parseInt(host.style.top, 10);
    expect(styleTop).toBeGreaterThan(5);
  });

  it("idempotent: show twice → still one host", () => {
    showBubble({ anchorTop: 100, anchorLeft: 200, onClick: vi.fn() });
    showBubble({ anchorTop: 110, anchorLeft: 210, onClick: vi.fn() });
    expect(document.documentElement.querySelectorAll("[data-pie-quote-bubble]").length).toBe(1);
  });

  it("hide removes the host", () => {
    showBubble({ anchorTop: 100, anchorLeft: 200, onClick: vi.fn() });
    hideBubble();
    expect(__test__isVisible()).toBe(false);
  });

  it("click in shadow root invokes callback then hides", () => {
    const onClick = vi.fn();
    showBubble({ anchorTop: 100, anchorLeft: 200, onClick });
    const host = document.documentElement.querySelector<HTMLElement>("[data-pie-quote-bubble]")!;
    const btn = host.shadowRoot!.querySelector<HTMLButtonElement>("button")!;
    btn.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(__test__isVisible()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `pnpm vitest run src/content/quote/floating-bubble.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/content/quote/floating-bubble.ts`:

```typescript
const HOST_ATTR = "data-pie-quote-bubble";
const BUBBLE_HEIGHT = 34;
const MARGIN = 6;

let host: HTMLElement | null = null;
let currentClick: (() => void) | null = null;

function ensureHost(): HTMLElement {
  if (host) return host;
  host = document.createElement("div");
  host.setAttribute(HOST_ATTR, "");
  host.style.position = "fixed";
  host.style.zIndex = "2147483647";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .b {
        background: #ffb95a;
        color: #1c1d22;
        font: 600 12px/1 -apple-system, "Helvetica Neue", sans-serif;
        padding: 7px 11px 7px 9px;
        border-radius: 999px;
        border: 0;
        cursor: pointer;
        box-shadow: 0 6px 18px rgba(0,0,0,0.35);
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .b::before {
        content: "+";
        background: rgba(28,29,34,0.18);
        width: 14px; height: 14px;
        border-radius: 50%;
        display: inline-flex; align-items: center; justify-content: center;
        font-weight: 700; font-size: 11px;
      }
    </style>
    <button class="b" type="button">添加为引用</button>
  `;
  shadow.querySelector<HTMLButtonElement>("button")!.addEventListener("click", () => {
    const cb = currentClick;
    hideBubble();
    cb?.();
  });
  document.documentElement.appendChild(host);
  return host;
}

export function showBubble(args: { anchorTop: number; anchorLeft: number; onClick: () => void }): void {
  const h = ensureHost();
  currentClick = args.onClick;
  // Position above the anchor when there is room; else below.
  const above = args.anchorTop - BUBBLE_HEIGHT - MARGIN;
  const top = above >= 0 ? above : args.anchorTop + MARGIN;
  h.style.top = `${Math.round(top)}px`;
  h.style.left = `${Math.round(Math.max(8, args.anchorLeft))}px`;
}

export function hideBubble(): void {
  if (!host) return;
  host.remove();
  host = null;
  currentClick = null;
}

export function __test__isVisible(): boolean {
  return host !== null;
}
```

- [ ] **Step 4: Run test, verify PASS**

Run: `pnpm vitest run src/content/quote/floating-bubble.test.ts`
Expected: PASS, 6 cases.

- [ ] **Step 5: Commit**

```bash
git add src/content/quote/floating-bubble.ts src/content/quote/floating-bubble.test.ts
git commit -m "feat(quotes): floating bubble in Shadow DOM with above/below fallback"
```

---

## Task 8: Selection listener

**Files:**
- Create: `src/content/quote/selection-listener.ts`
- Test: `src/content/quote/selection-listener.test.ts`

**Context:** Wire `mouseup` + `selectionchange` listeners. On non-empty selection (trimmed length ≥ 1), compute anchor = end-rect of last range, show bubble. On click in bubble, fire `chrome.runtime.sendMessage({type: "quote-text-captured", payload: {text, sourceUrl}})`. On selection clear, hide bubble. Same selection clicked twice = two messages (no dedupe).

- [ ] **Step 1: Write the failing test**

Create `src/content/quote/selection-listener.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { attachSelectionListener, detachSelectionListener } from "./selection-listener";

const sendMessageMock = vi.fn();

beforeEach(() => {
  sendMessageMock.mockReset();
  document.body.innerHTML = "<p id='p'>Hello world</p>";
  // @ts-expect-error mock
  globalThis.chrome = { runtime: { sendMessage: sendMessageMock } };
  // @ts-expect-error
  globalThis.location = { href: "https://example.com/page" };
});

afterEach(() => {
  detachSelectionListener();
  window.getSelection()?.removeAllRanges();
});

function selectRange(start: number, end: number) {
  const p = document.getElementById("p")!;
  const range = document.createRange();
  range.setStart(p.firstChild!, start);
  range.setEnd(p.firstChild!, end);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  // Patch getBoundingClientRect for the range (happy-dom returns zeros).
  vi.spyOn(range, "getBoundingClientRect").mockReturnValue({
    top: 100, left: 50, right: 150, bottom: 120, x: 50, y: 100, width: 100, height: 20,
    toJSON: () => ({}),
  } as DOMRect);
}

describe("selection listener", () => {
  it("non-empty selection on mouseup → shows bubble", () => {
    attachSelectionListener();
    selectRange(0, 5); // "Hello"
    window.dispatchEvent(new MouseEvent("mouseup"));
    expect(document.documentElement.querySelector("[data-pie-quote-bubble]")).not.toBeNull();
  });

  it("empty selection → no bubble", () => {
    attachSelectionListener();
    window.dispatchEvent(new MouseEvent("mouseup"));
    expect(document.documentElement.querySelector("[data-pie-quote-bubble]")).toBeNull();
  });

  it("click bubble → sendMessage with selected text", async () => {
    attachSelectionListener();
    selectRange(0, 5);
    window.dispatchEvent(new MouseEvent("mouseup"));
    const host = document.documentElement.querySelector("[data-pie-quote-bubble]");
    const btn = host!.shadowRoot!.querySelector("button") as HTMLButtonElement;
    btn.click();
    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "quote-text-captured",
      payload: { text: "Hello", sourceUrl: "https://example.com/page" },
    });
  });

  it("selection cleared via selectionchange → bubble hides", async () => {
    attachSelectionListener();
    selectRange(0, 5);
    window.dispatchEvent(new MouseEvent("mouseup"));
    expect(document.documentElement.querySelector("[data-pie-quote-bubble]")).not.toBeNull();
    window.getSelection()?.removeAllRanges();
    document.dispatchEvent(new Event("selectionchange"));
    expect(document.documentElement.querySelector("[data-pie-quote-bubble]")).toBeNull();
  });

  it("detach removes listeners (no bubble after detach)", () => {
    attachSelectionListener();
    detachSelectionListener();
    selectRange(0, 5);
    window.dispatchEvent(new MouseEvent("mouseup"));
    expect(document.documentElement.querySelector("[data-pie-quote-bubble]")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `pnpm vitest run src/content/quote/selection-listener.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/content/quote/selection-listener.ts`:

```typescript
import { showBubble, hideBubble } from "./floating-bubble";

let attached = false;

function onMouseUp(): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const text = sel.toString().trim();
  if (text.length === 0) {
    hideBubble();
    return;
  }
  const range = sel.getRangeAt(sel.rangeCount - 1);
  const rect = range.getBoundingClientRect();
  showBubble({
    anchorTop: rect.top,
    anchorLeft: rect.right,
    onClick: () => {
      void chrome.runtime.sendMessage({
        type: "quote-text-captured",
        payload: { text, sourceUrl: location.href },
      });
    },
  });
}

function onSelectionChange(): void {
  const sel = window.getSelection();
  if (!sel || sel.toString().trim().length === 0) {
    hideBubble();
  }
}

export function attachSelectionListener(): void {
  if (attached) return;
  window.addEventListener("mouseup", onMouseUp);
  document.addEventListener("selectionchange", onSelectionChange);
  attached = true;
}

export function detachSelectionListener(): void {
  window.removeEventListener("mouseup", onMouseUp);
  document.removeEventListener("selectionchange", onSelectionChange);
  hideBubble();
  attached = false;
}
```

- [ ] **Step 4: Run test, verify PASS**

Run: `pnpm vitest run src/content/quote/selection-listener.test.ts`
Expected: PASS, 5 cases.

- [ ] **Step 5: Commit**

```bash
git add src/content/quote/selection-listener.ts src/content/quote/selection-listener.test.ts
git commit -m "feat(quotes): selection listener + bubble click dispatch"
```

---

## Task 9: Element picker

**Files:**
- Create: `src/content/quote/element-picker.ts`
- Test: `src/content/quote/element-picker.test.ts`

**Context:** Two states: idle / picking. Enter from SW message `picker:enter`. In picking mode: `mousemove` adds outline + bbox label overlay; `click` (capture phase, prevent default) selects element → `extractElementQuotePayload` → `chrome.runtime.sendMessage("quote-element-captured")` → exit. Esc / right-click / SW `picker:exit` → exit. Hover overlay also lives in Shadow DOM.

- [ ] **Step 1: Write the failing test**

Create `src/content/quote/element-picker.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { enterPicker, exitPicker, __test__isPicking } from "./element-picker";

const sendMessageMock = vi.fn();

beforeEach(() => {
  sendMessageMock.mockReset();
  document.body.innerHTML = `<button id="b">Create issue</button><div id="d">x</div>`;
  // @ts-expect-error mock
  globalThis.chrome = { runtime: { sendMessage: sendMessageMock } };
  // @ts-expect-error
  globalThis.location = { href: "https://example.com" };
});

afterEach(() => {
  exitPicker();
  document.documentElement.querySelectorAll("[data-pie-quote-picker]").forEach((el) => el.remove());
});

describe("element picker", () => {
  it("enter → picking=true; overlay host appears", () => {
    enterPicker();
    expect(__test__isPicking()).toBe(true);
    expect(document.documentElement.querySelector("[data-pie-quote-picker]")).not.toBeNull();
  });

  it("exit → picking=false; overlay host removed", () => {
    enterPicker();
    exitPicker();
    expect(__test__isPicking()).toBe(false);
    expect(document.documentElement.querySelector("[data-pie-quote-picker]")).toBeNull();
  });

  it("click on element → sendMessage quote-element-captured then exit", () => {
    enterPicker();
    const b = document.getElementById("b")!;
    const evt = new MouseEvent("click", { bubbles: true, cancelable: true });
    b.dispatchEvent(evt);
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    const call = sendMessageMock.mock.calls[0][0];
    expect(call.type).toBe("quote-element-captured");
    expect(call.payload.role).toBe("button");
    expect(call.payload.accessibleName).toBe("Create issue");
    expect(__test__isPicking()).toBe(false);
  });

  it("Esc → exit", () => {
    enterPicker();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(__test__isPicking()).toBe(false);
  });

  it("right-click (contextmenu) → exit", () => {
    enterPicker();
    document.dispatchEvent(new MouseEvent("contextmenu"));
    expect(__test__isPicking()).toBe(false);
  });

  it("click is consumed (preventDefault) so site handlers do NOT fire", () => {
    let siteHandlerFired = false;
    document.getElementById("b")!.addEventListener("click", () => {
      siteHandlerFired = true;
    });
    enterPicker();
    document.getElementById("b")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(siteHandlerFired).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `pnpm vitest run src/content/quote/element-picker.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/content/quote/element-picker.ts`:

```typescript
import { extractElementQuotePayload } from "./bbox-extractor";

const HOST_ATTR = "data-pie-quote-picker";

let picking = false;
let host: HTMLElement | null = null;
let outline: HTMLDivElement | null = null;
let label: HTMLDivElement | null = null;
let lastTarget: Element | null = null;

function ensureOverlay(): void {
  if (host) return;
  host = document.createElement("div");
  host.setAttribute(HOST_ATTR, "");
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; position: fixed; inset: 0; z-index: 2147483646; pointer-events: none; }
      .o {
        position: absolute;
        border: 2px solid #6bd49f;
        box-shadow: 0 0 0 3px rgba(107,212,159,0.18);
        background: transparent;
        pointer-events: none;
        transition: none;
      }
      .l {
        position: absolute;
        background: #6bd49f;
        color: #0b1f15;
        font: 600 10.5px/1 ui-monospace, "SF Mono", monospace;
        padding: 2px 8px;
        border-radius: 4px;
        white-space: nowrap;
        pointer-events: none;
      }
    </style>
    <div class="o" hidden></div>
    <div class="l" hidden></div>
  `;
  outline = shadow.querySelector<HTMLDivElement>(".o");
  label = shadow.querySelector<HTMLDivElement>(".l");
  document.documentElement.appendChild(host);
}

function destroyOverlay(): void {
  host?.remove();
  host = null;
  outline = null;
  label = null;
  lastTarget = null;
}

function onMouseMove(e: MouseEvent): void {
  if (!picking || !outline || !label) return;
  // Use elementFromPoint to find the topmost element (overlay is pointer-events:none)
  const target = document.elementFromPoint(e.clientX, e.clientY);
  if (!target || target === lastTarget) return;
  lastTarget = target;
  const r = target.getBoundingClientRect();
  outline.style.top = `${r.top}px`;
  outline.style.left = `${r.left}px`;
  outline.style.width = `${r.width}px`;
  outline.style.height = `${r.height}px`;
  outline.hidden = false;
  const role = (target.getAttribute("role") || target.tagName.toLowerCase());
  const name = (target.getAttribute("aria-label") || target.textContent?.trim().slice(0, 40) || "");
  label.textContent = `<${role}>${name ? " · " + JSON.stringify(name) : ""}`;
  label.style.top = `${Math.max(0, r.top - 22)}px`;
  label.style.left = `${r.left}px`;
  label.hidden = false;
}

function onClickCapture(e: MouseEvent): void {
  if (!picking) return;
  // Ignore overlay clicks (pointer-events: none, so this shouldn't fire from overlay).
  const target = document.elementFromPoint(e.clientX, e.clientY);
  if (!target) return;
  e.preventDefault();
  e.stopPropagation();
  const payload = extractElementQuotePayload(target, location.href);
  void chrome.runtime.sendMessage({ type: "quote-element-captured", payload });
  exitPicker();
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key === "Escape") exitPicker();
}

function onContextMenu(e: MouseEvent): void {
  e.preventDefault();
  exitPicker();
}

export function enterPicker(): void {
  if (picking) return;
  picking = true;
  ensureOverlay();
  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("click", onClickCapture, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("contextmenu", onContextMenu, true);
}

export function exitPicker(): void {
  if (!picking) return;
  picking = false;
  document.removeEventListener("mousemove", onMouseMove, true);
  document.removeEventListener("click", onClickCapture, true);
  document.removeEventListener("keydown", onKeyDown, true);
  document.removeEventListener("contextmenu", onContextMenu, true);
  destroyOverlay();
}

export function __test__isPicking(): boolean {
  return picking;
}
```

- [ ] **Step 4: Run test, verify PASS**

Run: `pnpm vitest run src/content/quote/element-picker.test.ts`
Expected: PASS, 6 cases.

(If `document.elementFromPoint` returns null in happy-dom for the synthetic click test, the implementation falls back to `e.target` — extend if needed. Drop the test only as a last resort.)

- [ ] **Step 5: Commit**

```bash
git add src/content/quote/element-picker.ts src/content/quote/element-picker.test.ts
git commit -m "feat(quotes): element picker overlay + click/Esc/contextmenu exits"
```

---

## Task 10: Content script entry + manifest

**Files:**
- Create: `src/content/quote/index.ts`
- Modify: `src/content/index.ts` (existing placeholder)
- Modify: `manifest.json`

**Context:** Wire the 3 page-side modules. Listen for `chrome.runtime.onMessage` from SW: `picker:enter` → `enterPicker()`, `picker:exit` → `exitPicker()`. Attach selection listener at module load (W-1). No DOMContentLoaded gate.

- [ ] **Step 1: Write `src/content/quote/index.ts`**

```typescript
import { attachSelectionListener } from "./selection-listener";
import { enterPicker, exitPicker } from "./element-picker";

attachSelectionListener();

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || typeof msg !== "object") return;
  const m = msg as { type?: string };
  if (m.type === "picker:enter") enterPicker();
  else if (m.type === "picker:exit") exitPicker();
});
```

- [ ] **Step 2: Replace `src/content/index.ts`**

```typescript
// Content Script — registered via manifest content_scripts.
// Currently only loads the page-content-reference (Issue #38 v1) feature.
import "./quote";
```

- [ ] **Step 3: Add `content_scripts` to `manifest.json`**

Append (top-level), after `"action"`:

```json
"content_scripts": [
  {
    "matches": ["<all_urls>"],
    "js": ["src/content/index.ts"],
    "run_at": "document_idle",
    "all_frames": false,
    "match_origin_as_fallback": false
  }
],
```

- [ ] **Step 4: Build smoke check**

Run: `pnpm build`
Expected: success; `dist/` contains a bundled content script entry. Inspect `dist/manifest.json` to confirm `content_scripts[0].js[0]` points at the bundled file (crxjs rewrites the path).

- [ ] **Step 5: Manual smoke (optional, document only)**

In `chrome://extensions`, reload the unpacked extension from `dist/`. Open any HTTP page, select text — bubble should appear. (No assertion required at this step; the cross-layer test in Task 14 will exercise the wire programmatically.)

- [ ] **Step 6: Commit**

```bash
git add src/content/quote/index.ts src/content/index.ts manifest.json
git commit -m "feat(quotes): register content script + wire SW picker enter/exit"
```

---

## Task 11: useSession quotes state

**Files:**
- Modify: `src/sidepanel/hooks/useSession/runtime-map.ts`
- Modify: `src/sidepanel/hooks/useSession/index.ts`
- Create/append: `src/sidepanel/hooks/useSession/runtime-map.test.ts` (if exists) or add an inline test

**Context:** Add `quotes: Quote[]` to `SessionRuntimeSlot` and `EMPTY_SLOT`. Add `addQuote(sessionId, quote)`, `removeQuote(sessionId, quoteId)`, `clearQuotes(sessionId)` helper functions exported from `useSession/index.ts`. Wire `port.onMessage` `quote-added` handler in the existing per-session port subscription in `useSession/index.ts` (the panel side). On send, call `clearQuotes(activeSessionId)`.

- [ ] **Step 1: Write the failing test**

Create `src/sidepanel/hooks/useSession/runtime-map.test.ts` (or append):

```typescript
import { describe, it, expect } from "vitest";
import { EMPTY_SLOT, withSlot } from "./runtime-map";
import type { Quote } from "@/types";

describe("SessionRuntimeSlot quotes field", () => {
  it("EMPTY_SLOT.quotes defaults to empty array", () => {
    expect(EMPTY_SLOT.quotes).toEqual([]);
  });

  it("withSlot can append a quote", () => {
    const q: Quote = { id: "1", kind: "text", text: "x", sourceUrl: "u", sourceTabId: 1 };
    const prev = new Map();
    const next = withSlot(prev, "S1", (s) => ({ quotes: [...s.quotes, q] }));
    expect(next.get("S1")!.quotes).toEqual([q]);
  });

  it("withSlot can clear quotes (set to [])", () => {
    const q: Quote = { id: "1", kind: "text", text: "x", sourceUrl: "u", sourceTabId: 1 };
    const seeded = withSlot(new Map(), "S1", { quotes: [q] });
    const cleared = withSlot(seeded, "S1", { quotes: [] });
    expect(cleared.get("S1")!.quotes).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `pnpm vitest run src/sidepanel/hooks/useSession/runtime-map.test.ts`
Expected: FAIL — `quotes` is missing.

- [ ] **Step 3: Edit `runtime-map.ts`**

Modify `src/sidepanel/hooks/useSession/runtime-map.ts`:

```typescript
import type { DisplayMessage } from "@/types";
import type { Quote } from "@/types";

export type SessionRuntimeSlot = {
  streaming: boolean;
  streamingText: string;
  error: string | null;
  toast: { level: "warn" | "error" | "info"; text: string } | null;
  messages: DisplayMessage[];
  accumulated: string;
  streamFinished: boolean;
  quotes: Quote[];
};

export const EMPTY_SLOT: SessionRuntimeSlot = {
  streaming: false,
  streamingText: "",
  error: null,
  toast: null,
  messages: [],
  accumulated: "",
  streamFinished: true,
  quotes: [],
};

// withSlot, deriveActiveView unchanged.
```

- [ ] **Step 4: Run test, verify PASS**

Run: `pnpm vitest run src/sidepanel/hooks/useSession/runtime-map.test.ts`
Expected: PASS.

- [ ] **Step 5: Add quote handlers to `useSession/index.ts`**

Add inside the existing `useSession` hook body (where other patch helpers live):

```typescript
import type { Quote, QuoteAddedMessage } from "@/types";

const addQuote = useCallback((sessionId: string, q: Quote) => {
  setSlots((prev) => withSlot(prev, sessionId, (s) => ({ quotes: [...s.quotes, q] })));
}, []);

const removeQuote = useCallback((sessionId: string, quoteId: string) => {
  setSlots((prev) =>
    withSlot(prev, sessionId, (s) => ({ quotes: s.quotes.filter((q) => q.id !== quoteId) })),
  );
}, []);

const clearQuotes = useCallback((sessionId: string) => {
  setSlots((prev) => withSlot(prev, sessionId, { quotes: [] }));
}, []);
```

And in the port `onMessage` handler (where `chat-chunk`, `agent-step`, etc. are dispatched), add:

```typescript
} else if (msg.type === "quote-added") {
  const m = msg as QuoteAddedMessage;
  if (activeIdRef.current) addQuote(activeIdRef.current, m.quote);
}
```

Export the new functions from the hook's return shape:

```typescript
return {
  // ...existing
  addQuote,
  removeQuote,
  clearQuotes,
  quotes: active.quotes,
};
```

- [ ] **Step 6: Add `quote-added` integration test**

Append to `src/sidepanel/hooks/useSession/runtime-map.test.ts` — actually a behavior test belongs in a sibling file. Create `src/sidepanel/hooks/useSession/quote-port.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
// Adjust this import to whatever useSession export shape is used in existing tests.
import { useSession } from "./index";
import { chromeMock } from "@/test/setup";

beforeEach(() => {
  chromeMock.reset();
});

describe("useSession quote-added", () => {
  it("addQuote appends to active session quotes", () => {
    const { result } = renderHook(() => useSession());
    act(() => {
      result.current.setActiveSession("S1");
      result.current.addQuote("S1", {
        id: "q1",
        kind: "text",
        text: "hi",
        sourceUrl: "https://x",
        sourceTabId: 1,
      });
    });
    expect(result.current.quotes).toHaveLength(1);
    expect(result.current.quotes[0]).toMatchObject({ id: "q1", text: "hi" });
  });

  it("removeQuote drops by id", () => {
    const { result } = renderHook(() => useSession());
    act(() => {
      result.current.setActiveSession("S1");
      result.current.addQuote("S1", { id: "q1", kind: "text", text: "hi", sourceUrl: "u", sourceTabId: 1 });
      result.current.addQuote("S1", { id: "q2", kind: "text", text: "yo", sourceUrl: "u", sourceTabId: 1 });
      result.current.removeQuote("S1", "q1");
    });
    expect(result.current.quotes.map((q) => q.id)).toEqual(["q2"]);
  });

  it("clearQuotes empties active session", () => {
    const { result } = renderHook(() => useSession());
    act(() => {
      result.current.setActiveSession("S1");
      result.current.addQuote("S1", { id: "q1", kind: "text", text: "hi", sourceUrl: "u", sourceTabId: 1 });
      result.current.clearQuotes("S1");
    });
    expect(result.current.quotes).toEqual([]);
  });

  it("quotes are per-session (S1 ≠ S2)", () => {
    const { result } = renderHook(() => useSession());
    act(() => {
      result.current.setActiveSession("S1");
      result.current.addQuote("S1", { id: "q1", kind: "text", text: "in-s1", sourceUrl: "u", sourceTabId: 1 });
      result.current.setActiveSession("S2");
    });
    expect(result.current.quotes).toEqual([]); // S2 active sees nothing
    act(() => result.current.setActiveSession("S1"));
    expect(result.current.quotes.map((q) => q.id)).toEqual(["q1"]);
  });
});
```

(Adjust `result.current.setActiveSession` to the actual API name — the existing `useSession` test in the codebase will reveal it.)

- [ ] **Step 7: Run all useSession tests, verify PASS**

Run: `pnpm vitest run src/sidepanel/hooks/useSession`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/sidepanel/hooks/useSession/
git commit -m "feat(quotes): useSession quotes per-session state + port handler"
```

---

## Task 12: QuoteChip component

**Files:**
- Create: `src/sidepanel/components/QuoteChip.tsx`
- Test: `src/sidepanel/components/QuoteChip.test.tsx`

**Context:** Render a chip for text or element quote. Hover popover shows full content (text + sourceUrl, or role/name/textContent + thumbnail). Element with `imageDataUrl: null` shows "[截图不可用]" in popover. × button calls `onRemove(id)`.

- [ ] **Step 1: Write the failing test**

Create `src/sidepanel/components/QuoteChip.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QuoteChip } from "./QuoteChip";
import type { Quote } from "@/types";

describe("QuoteChip", () => {
  it("text chip shows truncated label + sourceUrl on hover", () => {
    const q: Quote = {
      id: "q1",
      kind: "text",
      text: "Hello world this is a fairly long quote about something",
      sourceUrl: "https://example.com/page",
      sourceTabId: 1,
    };
    render(<QuoteChip quote={q} onRemove={vi.fn()} />);
    expect(screen.getByRole("button", { name: /移除引用/ })).toBeInTheDocument();
    expect(screen.getByText(/Hello world/)).toBeInTheDocument();
  });

  it("element chip shows role · accessibleName", () => {
    const q: Quote = {
      id: "q2",
      kind: "element",
      role: "button",
      accessibleName: "Create issue",
      textContent: "Create issue",
      outerHTMLTruncated: "<button>Create issue</button>",
      imageDataUrl: "data:image/jpeg;base64,xxxx",
      sourceUrl: "https://github.com",
      sourceTabId: 1,
    };
    render(<QuoteChip quote={q} onRemove={vi.fn()} />);
    expect(screen.getByText(/button.*Create issue/)).toBeInTheDocument();
  });

  it("element chip with null imageDataUrl shows [截图不可用]", async () => {
    const q: Quote = {
      id: "q3",
      kind: "element",
      role: "button",
      accessibleName: "X",
      textContent: "X",
      outerHTMLTruncated: "<button>X</button>",
      imageDataUrl: null,
      sourceUrl: "https://example.com",
      sourceTabId: 1,
    };
    render(<QuoteChip quote={q} onRemove={vi.fn()} />);
    // Popover triggered by hover or click; assume hover.
    const chip = screen.getByText(/button.*X/);
    fireEvent.mouseEnter(chip);
    expect(screen.getByText(/截图不可用/)).toBeInTheDocument();
  });

  it("× button calls onRemove with id", () => {
    const onRemove = vi.fn();
    const q: Quote = { id: "qr", kind: "text", text: "x", sourceUrl: "u", sourceTabId: 1 };
    render(<QuoteChip quote={q} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: /移除引用/ }));
    expect(onRemove).toHaveBeenCalledWith("qr");
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `pnpm vitest run src/sidepanel/components/QuoteChip.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/sidepanel/components/QuoteChip.tsx`:

```typescript
import { useState } from "react";
import type { Quote } from "@/types";

const TEXT_LABEL_MAX = 28;

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "…";
}

type Props = {
  quote: Quote;
  onRemove: (id: string) => void;
};

export function QuoteChip({ quote, onRemove }: Props) {
  const [hovered, setHovered] = useState(false);

  const isText = quote.kind === "text";
  const borderClass = isText ? "border-info" : "border-ok";
  const icon = isText ? '"' : "⊞";

  const label = isText
    ? truncate(quote.text, TEXT_LABEL_MAX)
    : `${quote.role} · "${truncate(quote.accessibleName, TEXT_LABEL_MAX)}"`;

  return (
    <span
      className={`chip ${borderClass}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: "relative" }}
    >
      <span className="ico">{icon}</span>
      <span className="lbl">{label}</span>
      <button
        type="button"
        aria-label="移除引用"
        onClick={() => onRemove(quote.id)}
        className="x"
      >
        ×
      </button>
      {hovered && (
        <div className="quote-popover" role="tooltip">
          {isText ? (
            <>
              <div className="full">{quote.text}</div>
              <div className="src">{quote.sourceUrl}</div>
            </>
          ) : (
            <>
              {quote.imageDataUrl ? (
                <img src={quote.imageDataUrl} alt="" style={{ maxWidth: 200, maxHeight: 120 }} />
              ) : (
                <div className="placeholder">[截图不可用]</div>
              )}
              <div>role: {quote.role}</div>
              <div>name: {quote.accessibleName}</div>
              <div className="content">{quote.textContent}</div>
              <div className="src">{quote.sourceUrl}</div>
            </>
          )}
        </div>
      )}
    </span>
  );
}
```

(Reuse existing chip / popover styles where the codebase defines them — the className names above are illustrative. Match the Phase 5 image chip's visual idiom.)

- [ ] **Step 4: Run test, verify PASS**

Run: `pnpm vitest run src/sidepanel/components/QuoteChip.test.tsx`
Expected: PASS, 4 cases.

- [ ] **Step 5: Commit**

```bash
git add src/sidepanel/components/QuoteChip.tsx src/sidepanel/components/QuoteChip.test.tsx
git commit -m "feat(quotes): QuoteChip component with hover popover"
```

---

## Task 13: Chat.tsx composer integration

**Files:**
- Modify: `src/sidepanel/components/Chat.tsx`
  - The chip row (existing image attach row lines 978-1049) — add `QuoteChip` renders
  - The composer button row (lines 1269-1380) — add "拾取元素" button next to "📎 上传"
- Test: append to `src/sidepanel/components/Chat.test.tsx`

**Context:** Render `useSession().quotes` as `<QuoteChip>` instances in the existing chip row container, BEFORE the image attach thumbnails. Add a "拾取元素" button that toggles label between "拾取元素" and "拾取中… (Esc 取消)" based on a local state `pickerActive`. Clicking sends `picker:start` / `picker:stop` to SW via the existing panel port.

- [ ] **Step 1: Write the failing test**

Append to `src/sidepanel/components/Chat.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Chat } from "./Chat";
import { makeSession } from "./Chat.test"; // existing helper

describe("Chat composer quotes", () => {
  it("renders QuoteChip for each quote in active session", () => {
    const session = makeSession({
      quotes: [
        { id: "qa", kind: "text", text: "alpha", sourceUrl: "u", sourceTabId: 1 },
        { id: "qb", kind: "text", text: "beta", sourceUrl: "u", sourceTabId: 1 },
      ],
    });
    render(<Chat session={session as any} />);
    expect(screen.getByText(/alpha/)).toBeInTheDocument();
    expect(screen.getByText(/beta/)).toBeInTheDocument();
  });

  it("拾取元素 button sends picker:start to SW", () => {
    const postMessage = vi.fn();
    const session = makeSession({ port: { postMessage } });
    render(<Chat session={session as any} />);
    fireEvent.click(screen.getByRole("button", { name: /拾取元素/ }));
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "picker:start" }));
  });

  it("拾取元素 toggles label to 拾取中… while pickerActive", () => {
    const session = makeSession({});
    render(<Chat session={session as any} />);
    fireEvent.click(screen.getByRole("button", { name: /拾取元素/ }));
    expect(screen.getByRole("button", { name: /拾取中/ })).toBeInTheDocument();
  });

  it("clicking × on QuoteChip calls removeQuote", () => {
    const removeQuote = vi.fn();
    const session = makeSession({
      quotes: [{ id: "qx", kind: "text", text: "x", sourceUrl: "u", sourceTabId: 1 }],
      removeQuote,
    });
    render(<Chat session={session as any} />);
    fireEvent.click(screen.getByRole("button", { name: /移除引用/ }));
    expect(removeQuote).toHaveBeenCalledWith(session.id, "qx");
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `pnpm vitest run src/sidepanel/components/Chat.test.tsx`
Expected: FAIL — no chip renders, no button.

- [ ] **Step 3: Modify Chat.tsx**

Inside the chip row container (where image attach thumbnails render today, around lines 978-1049), render quote chips first:

```typescript
import { QuoteChip } from "./QuoteChip";

// inside the chip row JSX, BEFORE the image attach thumbnails:
{session.quotes.map((q) => (
  <QuoteChip key={q.id} quote={q} onRemove={(id) => session.removeQuote(session.id, id)} />
))}
```

Add the picker button next to the upload button (around the composer button row):

```typescript
const [pickerActive, setPickerActive] = useState(false);

async function onPickElementClick() {
  const tab = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tab[0]?.id;
  if (typeof tabId !== "number") return;
  if (!pickerActive) {
    session.port.postMessage({ type: "picker:start", tabId });
    setPickerActive(true);
  } else {
    session.port.postMessage({ type: "picker:stop", tabId });
    setPickerActive(false);
  }
}

// Exit picker UI when a quote-element arrives (chip added) — wire via useEffect
useEffect(() => {
  if (pickerActive && session.quotes.some((q) => q.kind === "element")) {
    // The most recent element addition implies the SW finished a picker round.
    setPickerActive(false);
  }
}, [session.quotes, pickerActive]);

// Render:
<button type="button" onClick={onPickElementClick}>
  {pickerActive ? "拾取中… (Esc 取消)" : "拾取元素"}
</button>
```

- [ ] **Step 4: Run test, verify PASS**

Run: `pnpm vitest run src/sidepanel/components/Chat.test.tsx`
Expected: PASS.

- [ ] **Step 5: Build smoke check**

Run: `pnpm build`
Expected: no TS errors.

- [ ] **Step 6: Commit**

```bash
git add src/sidepanel/components/Chat.tsx src/sidepanel/components/Chat.test.tsx
git commit -m "feat(quotes): composer chip row renders quotes + 拾取元素 button"
```

---

## Task 14: Chat.tsx pre-submit serialize

**Files:**
- Modify: `src/sidepanel/components/Chat.tsx` (send handler around line 513-532)
- Test: append to `src/sidepanel/components/Chat.test.tsx`

**Context:** When the user clicks Send, build the user message `content` array in this order (W-8):
1. image content blocks: for each chip in add order, if it's an element quote with `imageDataUrl !== null`, emit an image block; then user-uploaded image attach (existing Phase 5 path).
2. text content block: concatenate `<untrusted_page_quote>` / `<untrusted_page_element>` wrappers (in chip add order) + a blank line + the textarea text.

After build, call `clearQuotes(activeSessionId)` and the existing image-attach clear function. Both wrappers' attribute values must go through `escapeWrapperAttribute()` for `source_url` / `name`.

- [ ] **Step 1: Write the failing test**

Append to `src/sidepanel/components/Chat.test.tsx`:

```typescript
import { escapeWrapperAttribute } from "@/lib/agent/untrusted-wrappers";

describe("Chat send-time serialize", () => {
  it("text-only quote → user text contains untrusted_page_quote wrapper", async () => {
    const sendChat = vi.fn();
    const session = makeSession({
      quotes: [
        { id: "qa", kind: "text", text: "Hello", sourceUrl: "https://x", sourceTabId: 1 },
      ],
      sendChat,
    });
    render(<Chat session={session as any} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "what is this?" } });
    fireEvent.click(screen.getByRole("button", { name: /发送/ }));
    expect(sendChat).toHaveBeenCalled();
    const sent = sendChat.mock.calls[0][0];
    // sent should be the user message content array; verify the text block:
    const textBlock = sent.find((b: any) => b.type === "text");
    expect(textBlock.text).toContain(`<untrusted_page_quote source_url="https://x">`);
    expect(textBlock.text).toContain("Hello");
    expect(textBlock.text).toContain("what is this?");
  });

  it("element quote with imageDataUrl → image block precedes text block", async () => {
    const sendChat = vi.fn();
    const session = makeSession({
      quotes: [
        {
          id: "qe", kind: "element",
          role: "button", accessibleName: "Create",
          textContent: "Create", outerHTMLTruncated: "<button>Create</button>",
          imageDataUrl: "data:image/jpeg;base64,aaaa",
          sourceUrl: "https://gh.test", sourceTabId: 1,
        },
      ],
      sendChat,
    });
    render(<Chat session={session as any} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "?" } });
    fireEvent.click(screen.getByRole("button", { name: /发送/ }));
    const content = sendChat.mock.calls[0][0];
    expect(content[0].type).toBe("image");
    expect(content[content.length - 1].type).toBe("text");
    const text = content[content.length - 1].text;
    expect(text).toContain(`<untrusted_page_element source_url="https://gh.test" role="button" name="Create">`);
  });

  it("escapeWrapperAttribute applied to sourceUrl containing dangerous chars", async () => {
    const sendChat = vi.fn();
    const dangerous = `https://x.test/?q="><tag`;
    const session = makeSession({
      quotes: [{ id: "qd", kind: "text", text: "x", sourceUrl: dangerous, sourceTabId: 1 }],
      sendChat,
    });
    render(<Chat session={session as any} />);
    fireEvent.click(screen.getByRole("button", { name: /发送/ }));
    const text = sendChat.mock.calls[0][0].find((b: any) => b.type === "text").text;
    expect(text).toContain(escapeWrapperAttribute(dangerous));
    expect(text).not.toContain(`"><tag`);
  });

  it("send clears quotes from session", async () => {
    const clearQuotes = vi.fn();
    const session = makeSession({
      quotes: [{ id: "qc", kind: "text", text: "x", sourceUrl: "u", sourceTabId: 1 }],
      clearQuotes,
    });
    render(<Chat session={session as any} />);
    fireEvent.click(screen.getByRole("button", { name: /发送/ }));
    expect(clearQuotes).toHaveBeenCalledWith(session.id);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `pnpm vitest run src/sidepanel/components/Chat.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement serialize**

Add to Chat.tsx:

```typescript
import { escapeWrapperAttribute } from "@/lib/agent/untrusted-wrappers";
import type { Quote, TextQuote, ElementQuote } from "@/types";

function serializeQuotesToWire(
  quotes: Quote[],
  uploadedImages: { dataUrl: string; mediaType: string }[],
  textareaText: string,
): Array<
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "text"; text: string }
> {
  const content: any[] = [];

  // 1. Image blocks: element quote screenshots (in chip add order) THEN uploaded images.
  for (const q of quotes) {
    if (q.kind === "element" && q.imageDataUrl) {
      const [meta, b64] = q.imageDataUrl.split(",");
      const mediaType = meta.match(/data:([^;]+)/)?.[1] ?? "image/jpeg";
      content.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data: b64 },
      });
    }
  }
  for (const img of uploadedImages) {
    const [, b64] = img.dataUrl.split(",");
    content.push({
      type: "image",
      source: { type: "base64", media_type: img.mediaType, data: b64 },
    });
  }

  // 2. Text block: wrappers in chip add order, then textarea text.
  const parts: string[] = [];
  for (const q of quotes) {
    if (q.kind === "text") {
      parts.push(
        `<untrusted_page_quote source_url="${escapeWrapperAttribute(q.sourceUrl)}">\n${q.text}\n</untrusted_page_quote>`,
      );
    } else {
      parts.push(
        `<untrusted_page_element source_url="${escapeWrapperAttribute(q.sourceUrl)}" role="${escapeWrapperAttribute(q.role)}" name="${escapeWrapperAttribute(q.accessibleName)}">\ntext_content: ${JSON.stringify(q.textContent)}\nouter_html: ${JSON.stringify(q.outerHTMLTruncated)}\n</untrusted_page_element>`,
      );
    }
  }
  if (textareaText.trim()) parts.push(textareaText);
  content.push({ type: "text", text: parts.join("\n\n") });
  return content;
}
```

Replace the existing send handler's user-message-content build to call `serializeQuotesToWire(session.quotes, attachments, textValue)`. After dispatch, call `session.clearQuotes(session.id)` alongside the existing image-attach clear.

- [ ] **Step 4: Run test, verify PASS**

Run: `pnpm vitest run src/sidepanel/components/Chat.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sidepanel/components/Chat.tsx src/sidepanel/components/Chat.test.tsx
git commit -m "feat(quotes): serialize quotes into user message (image + wrapper)"
```

---

## Task 15: Cross-layer integration test

**Files:**
- Create: `src/sidepanel/components/__tests__/cross-layer-quote.test.tsx`

**Context:** This is the P0 test per CLAUDE.md "cross-layer integration test 模板" feedback. Walks content → SW → panel → DisplayMessage. We don't load actual chrome APIs; we wire the modules together with mocks and assert that a `quote-text-captured` from a fake content sender arrives in a panel's `quotes[]` and gets serialized correctly into the next send.

- [ ] **Step 1: Write the test**

Create `src/sidepanel/components/__tests__/cross-layer-quote.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock MUST be top-level (hoisted before imports).
vi.mock("@/lib/images/crop-bbox", () => ({
  cropBboxToJpegDataUrl: vi.fn(async () => "data:image/jpeg;base64,Y3JvcA=="),
}));

import {
  handleQuoteTextCaptured,
  handleQuoteElementCaptured,
} from "@/background/quote-bridge";

beforeEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error
  globalThis.chrome = {
    tabs: {
      get: vi.fn(async (id: number) => ({ id, windowId: 1 })),
      captureVisibleTab: vi.fn(async () => "data:image/png;base64,raw"),
      sendMessage: vi.fn(),
    },
  };
  // @ts-expect-error
  globalThis.crypto = { randomUUID: () => "u-cross" };
});

describe("cross-layer quote", () => {
  it("content text capture → SW → quote-added shape matches panel expectations", async () => {
    const out = await handleQuoteTextCaptured(
      { tab: { id: 99 } } as chrome.runtime.MessageSender,
      { text: "hello", sourceUrl: "https://example.com" },
    );
    expect(out).toEqual({
      type: "quote-added",
      quote: {
        id: "u-cross",
        kind: "text",
        text: "hello",
        sourceUrl: "https://example.com",
        sourceTabId: 99,
      },
    });
  });

  it("content element capture → SW returns element quote with cropped image", async () => {
    const out = await handleQuoteElementCaptured(
      { tab: { id: 99 } } as chrome.runtime.MessageSender,
      {
        bbox: { x: 0, y: 0, width: 10, height: 10 },
        devicePixelRatio: 2,
        role: "button",
        accessibleName: "Go",
        textContent: "Go",
        outerHTMLTruncated: "<button>Go</button>",
        sourceUrl: "https://example.com",
      },
    );
    if (out?.quote.kind !== "element") throw new Error("guard");
    expect(out.quote.imageDataUrl).toBe("data:image/jpeg;base64,Y3JvcA==");
    expect(out.quote.role).toBe("button");
  });

  it("serializeQuotesToWire produces wrappers + image block in correct order", async () => {
    // Import the helper exported from Chat.tsx (export it if not already).
    const { serializeQuotesToWire } = await import("@/sidepanel/components/Chat-serialize");
    const quotes = [
      { id: "1", kind: "text", text: "hi", sourceUrl: "https://x", sourceTabId: 1 } as const,
      {
        id: "2",
        kind: "element",
        role: "button",
        accessibleName: "Go",
        textContent: "Go",
        outerHTMLTruncated: "<button>Go</button>",
        imageDataUrl: "data:image/jpeg;base64,aaaa",
        sourceUrl: "https://x",
        sourceTabId: 1,
      } as const,
    ];
    const content = serializeQuotesToWire(quotes, [], "What is this?");
    expect(content[0].type).toBe("image");
    const text = content[content.length - 1];
    expect(text.type).toBe("text");
    expect((text as any).text).toContain("<untrusted_page_quote source_url=\"https://x\">");
    expect((text as any).text).toContain("<untrusted_page_element");
    expect((text as any).text).toContain("What is this?");
  });
});
```

- [ ] **Step 2: Extract `serializeQuotesToWire` to its own file**

If the helper currently lives inside `Chat.tsx`, extract it to `src/sidepanel/components/Chat-serialize.ts` and re-import in `Chat.tsx`. This is the only way the cross-layer test can import it cleanly.

- [ ] **Step 3: Run test, verify PASS**

Run: `pnpm vitest run src/sidepanel/components/__tests__/cross-layer-quote.test.tsx`
Expected: PASS, 3 cases.

- [ ] **Step 4: Commit**

```bash
git add src/sidepanel/components/__tests__/cross-layer-quote.test.tsx src/sidepanel/components/Chat-serialize.ts src/sidepanel/components/Chat.tsx
git commit -m "test(quotes): cross-layer content→SW→panel→wire integration"
```

---

## Task 16: Release notes + ROADMAP update

**Files:**
- Create: `docs/release-notes/v0.10.0.md`
- Modify: `docs/ROADMAP.md` §12 #38 row
- Modify: `manifest.json` `version` → `0.10.0`

**Context:** Wrap up the feature, document for users, mark backlog entry done.

- [ ] **Step 1: Write release notes**

Create `docs/release-notes/v0.10.0.md`:

```markdown
# v0.10.0 — Page content reference (Issue #38 v1)

## What's new

- **划词引用页内文字**：在任意网页选中文字，浮出"添加为引用"按钮一键加入 chat 输入框。
- **元素拾取**：点 composer 上的"拾取元素"按钮 → 进入元素拾取模式 → 在页面 hover 高亮 → 点击选定该元素（自动截图 + 抽取 role / name / textContent）。Esc 取消。
- **多 chip 输入**：文字 / 元素 / 图片 chip 共享同一输入区，可混合发送。
- **跨 tab 引用**：引用与 pinned tab 解耦，可来自任意当前 tab。
- **多会话隔离**：引用绑当前 active session；切 session 互不污染。

## Implementation notes

- 首个常驻 content script (`src/content/quote/`)，仅承担引用功能；click/type/snapshot 等现有 DOM 工具不迁。
- 引用送 LLM 时走新 untrusted wrapper `<untrusted_page_quote>` / `<untrusted_page_element>`，复用 R15 boundary。
- chip 不持久化：send 后 / 切 session / SW 重启即清空（与 textarea 草稿同行为）。

## Deferred to v2

- 划词智能组件边界高亮
- iframe 内引用
- Canvas / OCR 兜底
- 引用快捷键
- chip 容量上限 / 持久化
```

- [ ] **Step 2: Update ROADMAP**

In `docs/ROADMAP.md` §12 Open feat issues table, change the row for #38 to:

```markdown
| ✅ | [#38](https://github.com/WiseriaAI/Pie/issues/38) | feat: 输入时支持引用页内内容（组件元素、文字、图片）及划词显示组件 | **SHIPPED 2026-05-14 v1** (v0.10.0) — A 文字 + B 元素截图 + D chip 行；首个常驻 content script。划词智能边界 / iframe / Canvas / OCR / 引用快捷键 推 v2。Spec `docs/specs/2026-05-14-issue-38-page-content-reference-design.md`；Plan `docs/plans/2026-05-14-issue-38-page-content-reference.md` |
```

In §推荐推进顺序 末尾的"已交付路径"列表追加：

```markdown
- ✅ 页内内容引用 v1（§12 #38）— 2026-05-14 (v0.10.0)
```

- [ ] **Step 3: Bump manifest version**

Modify `manifest.json`:

```json
"version": "0.10.0",
```

- [ ] **Step 4: Final smoke**

Run: `pnpm test && pnpm build`
Expected: all green, dist/ builds.

- [ ] **Step 5: Commit**

```bash
git add docs/release-notes/v0.10.0.md docs/ROADMAP.md manifest.json
git commit -m "docs(release): v0.10.0 page content reference (issue #38 v1)"
```

---

## Self-Review

**Spec coverage check** (skim `docs/specs/2026-05-14-issue-38-page-content-reference-design.md`):

| Spec §ref | Covered by task |
|---|---|
| §2 Architecture 3 layers | T7-10 (content) / T5-6 (SW) / T11-14 (panel) |
| §2.1 invariants W-1..W-8 | T7 (W-1/W-2), T5 (W-3/W-4/W-5), T11 (W-6/W-7), T14 (W-8) |
| §3 Content script | T3 / T7 / T8 / T9 / T10 |
| §3.1-3.5 manifest, picker, bubble, bbox, screenshot | T10 / T9 / T7 / T3 / T4-5 |
| §3.6 SPA / CSP | T7 (Shadow DOM), T10 (run_at) |
| §4 SW QuoteBridge | T5 / T6 |
| §5 Sidepanel UI | T11 / T12 / T13 |
| §5.3 Quote types | T1 |
| §5.4 Pre-submit serialize | T14 |
| §6 LLM wire protocol | T2 (wrappers) / T14 (serialize) / T15 (integration) |
| §7 error handling | T5 (capture fail), T9 (Esc), T11 (per-session) |
| §8 testing | each task has unit; T15 = cross-layer |
| §9 v1 punt list | not implemented — by design |
| §10 file list | matches "File Structure" above |

**Placeholder scan:** all code blocks have complete implementations; tests assert specific values; no "TODO" / "TBD" / "similar to" references.

**Type consistency:** `Quote` / `TextQuote` / `ElementQuote` shapes defined in T1 are referenced consistently in T3 (extractor returns the wire payload, not the full quote), T5 (SW adds `id` + `sourceTabId`), T11 (state field), T12 (chip props), T14 (serialize).

---

## Execution Handoff

Plan saved to `docs/plans/2026-05-14-issue-38-page-content-reference.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch fresh subagent per task; two-stage review between tasks; cleaner context boundaries; surfaces task-level test failures early.
2. **Inline Execution** — execute tasks sequentially in this session via `superpowers:executing-plans`; checkpoints for human review.

Which approach?
