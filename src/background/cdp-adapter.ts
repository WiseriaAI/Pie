/**
 * Phase 5 — CDP adapter factory for screenshot pre-capture.
 *
 * Extracted from `index.ts` so `screenshot-cdp-bridge.test.ts` can import
 * and verify the exact `acquireCdpSession(tabId, options)` argument shape
 * without pulling in the whole SW module (which registers Chrome event
 * listeners with side effects at load time).
 *
 * C-1 fix: the previous inline lambda spread-merged the token into a single
 * object (`acquireCdpSession({ ...token, abortSignal: signal })`), but the
 * real signature is two positional args: `(tabId: number, options: {signal,
 * ownerToken, onExternalDetach})`. Every `capture_fullpage_tab` call would
 * throw `TypeError: Cannot destructure property 'signal' of 'undefined'`.
 */
import type { CdpAcquirer } from "@/lib/agent/tools/screenshot";
import { acquireCdpSession } from "./cdp-session";

/**
 * Constructs a `CdpAcquirer` DI shim bridging the SW-level
 * `acquireCdpSession(tabId, options)` signature to the shape expected by
 * `dispatchCaptureFullPageTab`.
 *
 * `abortController` is required (not just the signal) so `onExternalDetach`
 * can call `.abort()` — propagating a CDP-layer detach (yellow-bar cancel)
 * out to the loop's abort signal, matching the keyboard-tools pattern
 * established in `loop.ts:935`.
 */
export function makeCdpAdapterForScreenshot(
  abortController: AbortController,
): CdpAcquirer {
  return {
    acquireSession: (token: { sessionId: string; tabId: number; abortSignal?: AbortSignal }) =>
      acquireCdpSession(token.tabId, {
        signal: token.abortSignal ?? abortController.signal,
        ownerToken: { sessionId: token.sessionId, tabId: token.tabId },
        onExternalDetach: () => abortController.abort(),
      }),
  };
}
