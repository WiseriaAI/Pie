---
title: Phase 5 multimodal image input — manual-acceptance integration-gap bugs
date: 2026-05-04
category: integration-issues
module: multimodal-image-input
problem_type: integration_issue
component: assistant
symptoms:
  - "screenshot capture_fullpage_tab failed: no-pinned-tab on first task of a fresh session"
  - "confirm card renders without thumbnail despite SW correctly attaching screenshotPreview to wire payload"
  - "Approve action stalls when confirm card has no preview (UX confusion stops the user clicking)"
root_cause: async_timing
resolution_type: code_fix
severity: high
related_components:
  - background_job
  - frontend_stimulus
tags:
  - cross-layer
  - integration-gap
  - confirm-card
  - screenshot
  - pinned-tab
  - race-condition
  - multimodal
  - subagent-driven-development
branch: feat/multimodal-image-input
pull_request: 20
status: solved
related:
  - 2026-05-04-multimodal-image-input-v1.md
  - 2026-05-03-multi-session-invariant-trace.md
---

# Phase 5 multimodal image input — manual-acceptance integration-gap bugs

## Problem

Two cross-layer integration bugs surfaced during manual acceptance of Phase 5 multimodal image input v1, **after** the feature had passed final code review with 448 unit tests and a "Ready to merge" verdict. Both were classic "each layer's unit test passed but the cross-layer flow was broken" failures.

- **Bug 1**: SW screenshot pre-capture short-circuited with `no-pinned-tab` on the very first task of a fresh session because the panel-side pin write is fire-and-forget and the SW closure-read happened before the patch landed.
- **Bug 2**: The `screenshotPreview` thumbnail bytes — emitted correctly by the SW onto the `agent-confirm-request` wire — were silently dropped at three consecutive panel transit hops before reaching `AgentConfirmCard`, so confirm cards rendered without preview.

The shared lesson — **subagent-driven development with high unit-test counts does not catch cross-layer data-flow gaps** — is the load-bearing finding worth compounding for future phases.

## Symptoms

**Bug 1 — first-task pin race**

- Tool call `capture_fullpage_tab` (or `capture_visible_tab`) returned LLM observation: `screenshot capture_fullpage_tab failed: no-pinned-tab` on the first message of a fresh session.
- Agent step UI showed the tool with empty args (`{}`) and the failure observation.
- User confirmed: "UI 里正常显示了 Pinned Tab 是有内容的" — sidepanel's Pinned indicator showed correct tab. The race was purely between panel's fire-and-forget storage write and SW's closure-captured meta read.

**Bug 2 — panel screenshotPreview transit drop**

- Confirm card rendered with correct tool name, R5/R6 risk reason text, and arg display, but **no thumbnail image**.
- User report verbatim: `⚠ capture_visible_tab — HIGH RISK ... Screenshot tools require explicit user approval per capture (R5/R6) — pixel data cannot be sanitized. tag <> args {} — 谈了确认框，但是没有缩略图，并且后续流程也不执行`.
- "后续流程不执行": user instinctively didn't click Approve on a thumbnailless card (UX confusion), stalling the task.

## What Didn't Work

**Wrong initial diagnosis on Bug 2**: First instinct was that the LLM had fallen through to the generic risk-classify code path because the confirm card's reason text matched the risk classifier's R5/R6 language. Wasted two grep cycles before realizing that exact string is what the Phase 5 screenshot dispatch in `loop.ts:1549-1550` itself sets via the `riskReason` field of `sendConfirmRequest`. **Lesson**: when a reason string matches multiple possible code paths, grep for the exact string before guessing the path.

**Why high-unit-test-count subagent-driven development missed both bugs**:

Each layer had unit tests and passed them in isolation:

- **Bug 1**: SW pre-capture was unit-tested with a mock `ctx.pinned` already populated. The race against panel-side fire-and-forget pin write (`useSession.ts:760-790`) was outside any test scope. No test ever started from a truly-zero-pin state while also simulating the panel's async storage write.
- **Bug 2**: SW wire emission was tested. `useSession` message handling was tested. `AgentConfirmCard` prop rendering was tested. **No test exercised the full SW-wire → `useSession` destructure → `DisplayMessage` state → JSX prop chain as a single assertion**. The 3-spot field drop survived all 460 tests.

**Final code review missed both**: PR #20's `compound-engineering:code-reviewer` final review traced R1-R15 against code and verified all 14 specific checks (Section A-G), but the verification grain was per-requirement, not per-data-flow. R7 ("SW pre-capture confirm thumbnail") was verified by reading the SW emit path — which was correct. The downstream panel transit was not in scope.

## Solution

### Bug 1 — Three-tier fallback via `resolveEffectivePinned`

Commit `0927031`.

**New file**: `src/background/effective-pinned.ts` — pure, DI-injectable function with three fallback tiers.

```ts
// src/background/effective-pinned.ts (lines 27-57)
export async function resolveEffectivePinned(
  closurePinned: PinnedCtx | undefined,
  sessionId: string,
  getMetaFn: GetSessionMetaFn,
  queryActiveTabFn: QueryActiveTabFn,
  isRestrictedUrlFn: (url: string) => boolean,
): Promise<PinnedCtx | null> {
  // Tier 1: closure already has it (hot path, no I/O)
  if (closurePinned) return closurePinned;

  // Tier 2: re-read sessionMeta — panel pin patch may have landed since chat-start
  try {
    const fresh = await getMetaFn(sessionId);
    if (fresh?.pinnedTabId !== undefined && fresh.pinnedOrigin) {
      return { tabId: fresh.pinnedTabId, origin: fresh.pinnedOrigin };
    }
  } catch {}

  // Tier 3: active-tab query — same fallback the agent loop uses
  try {
    const [activeTab] = await queryActiveTabFn();
    if (!activeTab?.id || !activeTab.url) return null;
    if (isRestrictedUrlFn(activeTab.url)) return null;
    let origin: string;
    try { origin = new URL(activeTab.url).origin; } catch { return null; }
    return { tabId: activeTab.id, origin };
  } catch { return null; }
}
```

**Both `sendConfirmRequest` definitions** in `src/background/index.ts` (resume path ~line 580, chat-stream path ~line 1071) replaced their hard `if (!pinned)` early-return with the three-tier resolver:

```ts
// Before
if (isScreenshotTool && !pinned) {
  return { approved: false, reason: "pre-capture-failed", failureReason: "no-pinned-tab" };
}

// After
const effectivePinned = await resolveEffectivePinned(pinned, sessionId);
if (!effectivePinned) {
  return { approved: false, reason: "pre-capture-failed", failureReason: "no-pinned-tab" };
}
const captureCtx = { sessionId, taskId: ..., pinnedTabId: effectivePinned.tabId };
```

`isRestrictedUrl` in `src/lib/agent/loop.ts:334` was made `export` (was module-private) so the helper can reuse the canonical scheme list (`chrome://`, `chrome-extension://`, `about:`, `blob:`, `file:`, `data:`, `view-source:`).

**Tests**: 9 regression tests in `src/background/effective-pinned.test.ts` covering all 3 tiers + edge cases (meta throws, malformed URL, restricted URL, empty tab list, all-tiers-fail).

### Bug 2 — Field added at all 3 panel transit hops

Commit `517435d`. Three independent fixes:

**Fix 2a** — `src/types/messages.ts` (line 126): add field to `agent-confirm` DisplayMessage variant.

```ts
| {
    role: "agent-confirm";
    confirmationId: string;
    tool: string;
    args: unknown;
    resolvedElement: ResolvedElement;
    riskReason: string;
    resolved?: "approved" | "rejected";
    metaSkillPreview?: { existing: SkillDefinition | null; effective: SkillDefinition };
    screenshotPreview?: ScreenshotConfirmExtras;  // ← added
  }
```

**Fix 2b** — `src/sidepanel/hooks/useSession.ts:391-421`: destructure + spread into DisplayMessage.

```ts
// Before — destructure missing screenshotPreview
const {
  confirmationId, tool, args, resolvedElement,
  riskReason, metaSkillPreview,
} = message;

// After
const {
  confirmationId, tool, args, resolvedElement,
  riskReason, metaSkillPreview,
  screenshotPreview,                 // ← added
} = message;
// ... and inside the DisplayMessage construction:
...(screenshotPreview ? { screenshotPreview } : {}),
```

**Fix 2c** — `src/sidepanel/components/Chat.tsx:626`: forward prop to `AgentConfirmCard`.

```tsx
<AgentConfirmCard
  tool={msg.tool}
  args={msg.args}
  resolvedElement={msg.resolvedElement}
  riskReason={msg.riskReason}
  resolved={msg.resolved}
  metaSkillPreview={msg.metaSkillPreview}
  screenshotPreview={msg.screenshotPreview}   // ← added
  onApprove={() => resolveConfirm(msg.confirmationId, true)}
  onReject={() => resolveConfirm(msg.confirmationId, false)}
/>
```

**Regression test** in `src/sidepanel/hooks/useSession.test.ts` (the most useful test in this whole fix — pins the wire→state hop, the hardest of the three to notice):

```ts
it("threads screenshotPreview from agent-confirm-request to the agent-confirm DisplayMessage (Phase 5)", async () => {
  const { result } = renderHook(() => useSession());
  await waitFor(() => expect(result.current.ready).toBe(true));

  const port = chromeMock.runtime.__ports[0]!;
  act(() =>
    emitWithSession(port, {
      type: "agent-confirm-request",
      confirmationId: "c-screenshot",
      tool: "capture_visible_tab",
      args: {},
      resolvedElement: { text: "", tag: "" },
      riskReason: "Screenshot tools require explicit user approval per capture (R5/R6) — pixel data cannot be sanitized.",
      screenshotPreview: {
        thumbnail: "/9j/4AAQSkZJRg==",
        mediaType: "image/jpeg",
        width: 1568,
        height: 880,
        capturedAt: Date.now(),
      },
    } as never, result.current.sessionId!),
  );

  expect(result.current.messages).toEqual([
    expect.objectContaining({
      role: "agent-confirm",
      confirmationId: "c-screenshot",
      tool: "capture_visible_tab",
      screenshotPreview: expect.objectContaining({
        thumbnail: "/9j/4AAQSkZJRg==",
        mediaType: "image/jpeg",
        width: 1568,
        height: 880,
      }),
    }),
  ]);
});
```

Test count: 460 → 461.

## Why This Works

**Bug 1**: The three-tier fallback closes the race window. Tier 1 is zero-cost. Tier 2 handles the common first-task case — by the time screenshot dispatch fires (after LLM round-trip), the panel's fire-and-forget storage write has almost certainly landed. Tier 3 mirrors the agent loop's existing `chrome.tabs.query` fallback for DOM tools — was always correct, just not reachable from screenshot pre-capture before. All-tiers-fail still emits a clear `no-pinned-tab` for genuinely unpinnable sessions (`chrome://`, `blob:`).

**Bug 2**: Adding the field at all three transit hops is necessary AND sufficient because each hop is an independent type boundary that drops undeclared fields. The wire `AgentConfirmRequestMessage` and the React `DisplayMessage` are separate interfaces; the JSX prop list is a third gate. The regression test pins the middle hop (the hardest to notice) so a future destructure-rebase doesn't silently break this again.

## Prevention

### 1. Cross-layer flow assertion tests for every new wire field

For any field that originates SW-side and must reach a React component, write at least one regression test asserting the field survives the full hop. The new `useSession.test.ts` test is the template:

```ts
it("threads <field> from <wire-type> to the <display-variant> DisplayMessage", async () => {
  // 1. Emit the wire message with the field populated
  act(() => emitWithSession(port, {
    type: "...", myNewField: <value>,
  } as never, sessionId));
  // 2. Assert the field survived into React state
  expect(result.current.messages).toEqual([
    expect.objectContaining({ myNewField: <value> }),
  ]);
});
```

10 lines; catches the most common failure mode (destructure-and-forget at `useSession`).

### 2. Destructure-vs-spread tradeoff for forwarding wire payloads

**Explicit destructure** (current pattern) catches rename bugs at compile time but silently drops fields not listed:

```ts
// Dangerous when adding fields: every new field requires 3 edits (this was Bug 2's exact failure mode)
const { confirmationId, tool, args, riskReason } = message;
setMessages(prev => [...prev, { role: "agent-confirm", confirmationId, tool, args, riskReason }]);
```

**Spread with type narrowing** automatically flows new fields but bypasses TS structural checks:

```ts
// Safer for additive fields; enforce type at the next boundary instead
const { type: _type, sessionId: _sid, ...rest } = message;
setMessages(prev => [...prev, { role: "agent-confirm", ...rest }]);
```

Recommendation: **use spread for fields forwarded verbatim through a transformer layer like `useSession`**, and enforce type narrowing at the render boundary (JSX prop type). Confines the 3-edit tax to the render layer, which has TS prop checking as a natural backstop.

### 3. Document fire-and-forget races AND require consumer-side fallbacks

`useSession.ts:760-790` already documents the pin-write race. The missing piece: when Phase 5 added a new consumer of `pinned` (SW screenshot pre-capture), no check enforced that the new consumer had a fallback. Add to review checklist for any SW code reading closure-captured panel-written state: **"Does this path have a fallback if the panel write hasn't landed?"**

### 4. Manual acceptance is the gate, not the optional follow-up

Both bugs survived `compound-engineering:code-reviewer`'s final "Ready to merge" verdict because all unit tests passed. The integration bugs were invisible to static analysis and unit tests. **Manual acceptance test of representative end-user flows BEFORE declaring done is the only way to catch these.** PR #20's manual-acceptance checklist (in `2026-05-04-multimodal-image-input-v1.md`) was the right artifact, but it was treated as post-merge follow-up rather than pre-merge gate.

### 5. Code review checklist: name the cross-layer flow test

Add to `compound-engineering:ce-review` standard checklist:

> **For any feature spanning panel ↔ SW, name the test that asserts the full wire→state data flow. If no such test exists, block merge.**

This makes the absence of integration tests visible at review time, not at acceptance time.

### 6. Subagent-driven development specific: ask reviewers for cross-layer trace

When a feature spans 3+ tasks dispatched to separate subagents (Phase 5 spanned 15), the reviewer should be asked to trace at least one end-to-end data flow from origin to consumer, naming each hop. The Task 14 review (DisplayMessage → render) and Task 12 review (SW wire emit) each verified their own hop; nobody verified the chain. A single explicit "trace this field from SW to JSX prop" instruction in the final review prompt would catch the gap.

## Related Issues

- **Parent design doc**: `docs/solutions/2026-05-04-multimodal-image-input-v1.md` — Phase 5 implementation notes (Task 10 defines the `screenshot-precapture.ts` mechanism Bug 1 regressed; Task 12 defines the SW wire emit path Bug 2's panel transit fails to honor).
- **M3-U2 pin-anchor invariant**: `docs/solutions/2026-05-03-multi-session-invariant-trace.md` — defines `captureActivePinned` contract + pin-lock-on-send timing. Bug 1's fix must not regress this; Tier 2 (re-read meta) explicitly defers to whatever `captureActivePinned` produced.
- **PR**: [WiseriaAI/Pie#20](https://github.com/WiseriaAI/Pie/pull/20)
- **Fix commits**: `0927031` (pin race fallback), `517435d` (panel transit field).
