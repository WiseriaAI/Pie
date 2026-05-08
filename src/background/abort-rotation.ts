/**
 * Per-port abort controller with explicit per-task rotation.
 *
 * Issue #24 (Bug 1) root cause: `AbortController` / `AbortSignal` are
 * one-shot — once `abort()` fires, the signal is permanently aborted and
 * there is no API to reset it. A port-level `const` controller therefore
 * breaks every chat-start after the user clicks Stop, because
 * `runAgentLoop` (`src/lib/agent/loop.ts:887`) bails on `ctx.signal.aborted`
 * and exits straight into its "任务已取消" finally branch.
 *
 * Fix: rotate to a fresh controller before each task dispatch
 * (chat-start / resume-task). The prior controller is dropped; in-flight
 * `handleChatStream` calls keep their own reference to the specific
 * instance they were dispatched with, so rotating doesn't affect them.
 *
 * `onDrain` lets the caller clean up any pending state when
 * the prior controller wasn't already aborted (panel-state desync — the
 * panel `streaming` guard normally prevents stacked chat-starts but
 * defense-in-depth still has to handle it). Pending resolvers must
 * receive `reason='aborted'` — abort is triggered by panel disconnect or Stop button.
 */
export interface AbortRotation {
  current: AbortController;
}

export function createAbortRotation(): AbortRotation {
  return { current: new AbortController() };
}

export function rotateAbortController(
  rotation: AbortRotation,
  onDrain: () => void,
): void {
  if (!rotation.current.signal.aborted) {
    rotation.current.abort();
    onDrain();
  }
  rotation.current = new AbortController();
}
