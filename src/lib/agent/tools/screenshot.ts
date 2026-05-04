import { resizeSW } from "@/lib/images/resize-sw";
import type { ImageAttachment } from "@/lib/images";
import type { CdpSession } from "@/background/cdp-session";

const SCREENSHOT_BUDGET_PER_TASK = 5;

// Map<taskId, count> — reset on emitDone (wired by loop.ts caller in Task 11).
// Module-level state survives across handler invocations within a task; cleared
// when resetTaskBudget(taskId) is called or the SW restarts.
const budgetByTask = new Map<string, number>();

export type CaptureOutcome =
  | { ok: true; value: ImageAttachment }
  | {
      ok: false;
      reason:
        | "pinned-tab-not-visible"
        | "screenshot-budget-exceeded"
        | "capture-failed"
        | "decode-failed"
        | "byte-too-large"
        | "edge-too-large"
        | "unsupported-mime-type";
    };

export interface CaptureContext {
  sessionId: string;
  taskId: string;
  pinnedTabId: number;
}

/**
 * R5 — capture_visible_tab handler.
 *
 * 1. Budget check (5 per task, shared with capture_fullpage_tab in Task 9)
 * 2. Verify pinned tab is active in its window (chrome.tabs.captureVisibleTab
 *    fails on non-active tabs; we fail-fast with a structured observation
 *    so the LLM can decide whether to activate_tab first)
 * 3. Capture as JPEG (lower base64 inflation than PNG default)
 * 4. Decode data URL → Blob → resize via SW path (q85, max-edge 1568)
 * 5. Return ImageAttachment with stable id
 *
 * NEVER silent-activates the tab — that would defeat per-session sandboxing.
 */
export async function dispatchCaptureVisibleTab(
  ctx: CaptureContext,
): Promise<CaptureOutcome> {
  // Budget check first (R5/R6 budget invariant)
  const used = budgetByTask.get(ctx.taskId) ?? 0;
  if (used >= SCREENSHOT_BUDGET_PER_TASK) {
    return { ok: false, reason: "screenshot-budget-exceeded" };
  }

  // pinned-tab-not-visible early fail
  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.get(ctx.pinnedTabId);
  } catch {
    return { ok: false, reason: "pinned-tab-not-visible" };
  }
  if (!tab.active) {
    return { ok: false, reason: "pinned-tab-not-visible" };
  }

  // Capture as JPEG (chrome.tabs.captureVisibleTab default is PNG; explicit JPEG
  // for smaller wire payload + matches our resize-sw output mediaType).
  let dataUrl: string;
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "jpeg",
      quality: 90,
    });
  } catch {
    return { ok: false, reason: "capture-failed" };
  }

  // Decode data URL → Blob → resize via SW path
  const blob = dataUrlToBlob(dataUrl);
  const resized = await resizeSW(blob);
  if (!resized.ok) return { ok: false, reason: resized.reason };

  // Increment budget AFTER success (failed captures don't consume quota)
  budgetByTask.set(ctx.taskId, used + 1);

  const id = `img_screenshot_${crypto.randomUUID()}`;
  return {
    ok: true,
    value: {
      kind: "image",
      id,
      mediaType: "image/jpeg",
      data: resized.value.data,
      width: resized.value.width,
      height: resized.value.height,
      byteLength: resized.value.byteLength,
    },
  };
}

/** Called from loop.ts emitDone (Task 11) to free per-task quota. */
export function resetTaskBudget(taskId: string): void {
  budgetByTask.delete(taskId);
}

/** Test seam — clear all tasks' budgets. */
export function _resetBudgetForTests(): void {
  budgetByTask.clear();
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(",");
  const mime = header.match(/:([^;]+);/)?.[1] ?? "image/jpeg";
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/**
 * DI for CDP session acquisition. Task 11 wires this against the real
 * `acquireCdpSession` from `@/background/cdp-session`. Tests mock the
 * shape directly. Keeps screenshot.ts free of @/background/* imports
 * so it stays unit-testable without the SW lifecycle.
 */
export interface CdpAcquirer {
  acquireSession: (token: {
    sessionId: string;
    tabId: number;
    abortSignal?: AbortSignal;
  }) => Promise<CdpSession>;
}

/**
 * R6 — capture_fullpage_tab handler via CDP.
 *
 * Task-scope attach: first call within a task triggers acquireSession,
 * subsequent calls reuse the live session (the real acquireCdpSession
 * is idempotent for the same ownerToken). emitDone (Task 11) detaches.
 *
 * 1. Budget check (shared with capture_visible_tab — same 5/task limit)
 * 2. Acquire CDP via DI — failure → capture-failed
 * 3. Page.captureScreenshot { captureBeyondViewport, format: 'jpeg', quality: 85 }
 *    captureBeyondViewport=true is the load-bearing flag — without it CDP
 *    only captures the visible region (degenerates to capture_visible_tab).
 * 4. Decode raw base64 → Blob → resize via SW path (Task 3)
 * 5. Return ImageAttachment with stable id
 */
export async function dispatchCaptureFullPageTab(
  ctx: CaptureContext,
  cdp: CdpAcquirer,
): Promise<CaptureOutcome> {
  const used = budgetByTask.get(ctx.taskId) ?? 0;
  if (used >= SCREENSHOT_BUDGET_PER_TASK) {
    return { ok: false, reason: "screenshot-budget-exceeded" };
  }

  let session: CdpSession;
  try {
    session = await cdp.acquireSession({
      sessionId: ctx.sessionId,
      tabId: ctx.pinnedTabId,
    });
  } catch {
    return { ok: false, reason: "capture-failed" };
  }

  let result: { data: string } | undefined;
  try {
    result = (await session.send("Page.captureScreenshot", {
      captureBeyondViewport: true,
      format: "jpeg",
      quality: 85,
    })) as { data: string };
  } catch {
    return { ok: false, reason: "capture-failed" };
  }
  if (!result?.data) return { ok: false, reason: "capture-failed" };

  // CDP returns raw base64 (no data: prefix). Decode → Blob for resize-sw.
  const bytes = atob(result.data);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: "image/jpeg" });

  const resized = await resizeSW(blob);
  if (!resized.ok) return { ok: false, reason: resized.reason };

  budgetByTask.set(ctx.taskId, used + 1);

  const id = `img_screenshot_${crypto.randomUUID()}`;
  return {
    ok: true,
    value: {
      kind: "image",
      id,
      mediaType: "image/jpeg",
      data: resized.value.data,
      width: resized.value.width,
      height: resized.value.height,
      byteLength: resized.value.byteLength,
    },
  };
}
