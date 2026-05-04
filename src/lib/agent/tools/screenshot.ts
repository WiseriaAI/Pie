import { resizeSW } from "@/lib/images/resize-sw";
import type { ImageAttachment } from "@/lib/images";

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
    dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId!, {
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
