// M5 — Pin state machine helpers (pure functions, no I/O).
//
// Three-mode pin model:
//   - 'auto': pin is not persisted; UI live-previews active tab. R7 registry
//             skips. Default for new + post-task sessions.
//   - 'task': pin frozen at chat-start. emitDone clears it back to auto.
//             R7 registry includes. Drift check fires.
//   - 'user': user explicitly chose a pin via the dropdown. Survives task
//             end. R7 registry includes. Drift check skipped (user intent
//             is fixed by definition).
//
// Migration: legacy sessions (pinMode field undefined) go through
// getEffectivePinMode which infers from agent.stepIndex (in-flight legacy
// session = 'task'; otherwise = 'auto'). Storage layer then persists the
// inferred mode on next setSessionMeta write (lazy normalization).

import type { SessionMeta, SessionAgentState } from "./types";

export type PinMode = "auto" | "task" | "user";

/**
 * Returns the effective pin mode for a session.
 *
 * - If `meta.pinMode` is set, return it verbatim.
 * - Else infer from legacy fields:
 *    - has `pinnedTabId` AND agent has `stepIndex > 0` (in-flight) → 'task'
 *    - otherwise → 'auto' (next setSessionMeta will clear stale legacy pin)
 *
 * The agent parameter is null when the caller doesn't have access to agent
 * state (e.g. UI components reading meta only). In that case we default to
 * 'auto' rather than guessing — the storage normalize-on-write path will
 * upgrade to 'task' later if it has the agent state available.
 */
export function getEffectivePinMode(
  meta: SessionMeta,
  agent: SessionAgentState | null,
): PinMode {
  if (meta.pinMode) return meta.pinMode;
  if (
    typeof meta.pinnedTabId === "number" &&
    agent !== null &&
    agent.stepIndex > 0
  ) {
    return "task";
  }
  return "auto";
}

/**
 * emitDone helper — if the session is currently in 'task' mode (or legacy
 * with a stale pin), downgrade to 'auto' and clear pinnedTabId/Origin.
 *
 * Idempotent: 'auto' / 'user' modes are returned unchanged (identity).
 *
 * Legacy session with no explicit pinMode but a leftover pinnedTabId is
 * treated as a 'task' that just ended — clears the pin to keep storage
 * consistent with the post-M5 invariant ("auto mode never has pinnedTabId").
 */
export function clearTaskPinIfActive(meta: SessionMeta): SessionMeta {
  // Already auto and clean — nothing to do.
  if (meta.pinMode === "auto") return meta;
  // User mode is the user's explicit choice — never auto-clear.
  if (meta.pinMode === "user") return meta;
  // Fresh session with no pin to clear — nothing to do.
  if (
    meta.pinMode === undefined &&
    meta.pinnedTabId === undefined &&
    meta.pinnedOrigin === undefined
  ) {
    return meta;
  }
  // task mode OR legacy session with stale pin → downgrade to auto + clear.
  const next: SessionMeta = { ...meta, pinMode: "auto" };
  delete next.pinnedTabId;
  delete next.pinnedOrigin;
  return next;
}

/**
 * UI dropdown handler — set a user-locked pin. Overrides any prior task or
 * user pin. Mode becomes 'user'; subsequent task-end clears do not affect
 * this pin.
 */
export function setUserPin(
  meta: SessionMeta,
  pin: { tabId: number; origin: string },
): SessionMeta {
  return {
    ...meta,
    pinMode: "user",
    pinnedTabId: pin.tabId,
    pinnedOrigin: pin.origin,
  };
}

/**
 * UI dropdown handler — user clicked the "Auto" option. Only meaningful
 * when the current mode is 'user' (the only mode the user manages directly).
 *
 * No-op for 'task' mode — the loop owns task-mode pins, the UI shouldn't
 * yank them out from under an in-flight task. (If the user wants to abort
 * the task, they use the Stop button; emitDone then clears the pin.)
 */
export function clearUserPin(meta: SessionMeta): SessionMeta {
  if (meta.pinMode !== "user") return meta;
  const next: SessionMeta = { ...meta, pinMode: "auto" };
  delete next.pinnedTabId;
  delete next.pinnedOrigin;
  return next;
}
