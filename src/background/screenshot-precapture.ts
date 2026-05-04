import type { CaptureOutcome } from "@/lib/agent/tools/screenshot";
import type { ImageAttachment } from "@/lib/images";

/**
 * Phase 5 — pre-captured screenshot cache. SW pre-captures BEFORE sending
 * the confirm card to the panel so the user sees the EXACT bytes the LLM
 * will receive (K-1 informed-approval). Cache is keyed by confirmationId
 * and consumed exactly once when the user resolves the confirm.
 *
 * 5 s stale invalidate: if the user approves more than 5 seconds after
 * pre-capture, the cached bytes are discarded and the loop layer re-issues
 * the tool call (loop sees `stale: true`).
 *
 * Cleanup: discardPreCapture must be called from every cleanup path the
 * confirm-flow has — reject-side resolver, port.onDisconnect, abort signal.
 */
export const PRE_CAPTURE_STALE_MS = 5_000;

interface CacheEntry {
  outcome: CaptureOutcome;
  capturedAt: number;
}

const cache = new Map<string, CacheEntry>();

export function setPreCapture(confirmationId: string, outcome: CaptureOutcome): void {
  cache.set(confirmationId, { outcome, capturedAt: Date.now() });
}

export type ConsumeResult =
  | { hit: false }
  | { hit: true; stale: boolean; image: ImageAttachment | null };

export function consumePreCapture(
  confirmationId: string,
  now: number = Date.now(),
): ConsumeResult {
  const entry = cache.get(confirmationId);
  if (!entry) return { hit: false };
  cache.delete(confirmationId);
  if (now - entry.capturedAt > PRE_CAPTURE_STALE_MS) {
    return { hit: true, stale: true, image: null };
  }
  if (!entry.outcome.ok) return { hit: true, stale: false, image: null };
  return { hit: true, stale: false, image: entry.outcome.value };
}

export function discardPreCapture(confirmationId: string): void {
  cache.delete(confirmationId);
}

export function _resetForTests(): void {
  cache.clear();
}
