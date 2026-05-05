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
// v1.5 (Path A multi-pin): helpers operate exclusively on `pinnedTabs[]`.
// Legacy `pinnedTabId` / `pinnedOrigin` fields are @deprecated and no longer
// written or read by these helpers. Consumers migrate in Tasks 2-9; Task 10
// deletes the deprecated field declarations.

import type { SessionMeta, SessionAgentState } from "./types";

export type PinMode = "auto" | "task" | "user";
export type Pin = { tabId: number; origin: string };

/** Read the primary (oldest) pin. Returns undefined when no pin. */
export function getPrimaryPin(meta: SessionMeta): Pin | undefined {
  if (meta.pinnedTabs && meta.pinnedTabs.length > 0) return meta.pinnedTabs[0];
  return undefined;
}

/**
 * Append a pin. Idempotent on duplicate tabId. Caller is responsible for
 * pinMode (open_url during agent execution invariantly has mode='task').
 */
export function addPinToMeta(meta: SessionMeta, pin: Pin): SessionMeta {
  const current = meta.pinnedTabs ?? [];
  if (current.some((p) => p.tabId === pin.tabId)) return meta;
  return { ...meta, pinnedTabs: [...current, pin] };
}

/** Remove the entry matching tabId. No-op when absent. */
export function removePinFromMeta(meta: SessionMeta, tabId: number): SessionMeta {
  const current = meta.pinnedTabs ?? [];
  if (!current.some((p) => p.tabId === tabId)) return meta;
  return { ...meta, pinnedTabs: current.filter((p) => p.tabId !== tabId) };
}

/**
 * Effective pin mode. Reads explicit pinMode if set; else infers:
 *   - non-empty pinnedTabs[] AND in-flight agent → 'task'
 *   - otherwise → 'auto'
 */
export function getEffectivePinMode(
  meta: SessionMeta,
  agent: SessionAgentState | null,
): PinMode {
  if (meta.pinMode) return meta.pinMode;
  const hasPin = meta.pinnedTabs !== undefined && meta.pinnedTabs.length > 0;
  if (hasPin && agent !== null && agent.stepIndex > 0) return "task";
  return "auto";
}

/**
 * emitDone helper. Task mode → flip to auto + clear array. user/auto → identity.
 */
export function clearTaskPinIfActive(meta: SessionMeta): SessionMeta {
  if (meta.pinMode !== "task") return meta;
  const next: SessionMeta = { ...meta, pinMode: "auto" };
  delete next.pinnedTabs;
  return next;
}

/**
 * UI dropdown handler — toggle a tab's membership in user-mode pinnedTabs[].
 *
 * Semantics:
 *   - From `auto`: adds pin, flips mode → `user`.
 *   - From `user` containing pin: removes pin. If pinnedTabs becomes empty,
 *     flips back to `auto` (clears the array).
 *   - From `user` not containing pin: appends pin (multi-select).
 *   - From `task`: refuses (returns identity) — loop owns task-mode pins.
 */
export function togglePinTabUserMode(meta: SessionMeta, pin: Pin): SessionMeta {
  if (meta.pinMode === "task") return meta;
  const current = meta.pinnedTabs ?? [];
  const has = current.some((p) => p.tabId === pin.tabId);
  if (has) {
    const remaining = current.filter((p) => p.tabId !== pin.tabId);
    if (remaining.length === 0) {
      const next: SessionMeta = { ...meta, pinMode: "auto" };
      delete next.pinnedTabs;
      return next;
    }
    return { ...meta, pinMode: "user", pinnedTabs: remaining };
  }
  return { ...meta, pinMode: "user", pinnedTabs: [...current, pin] };
}

/**
 * UI dropdown "Auto" row handler — flip user → auto, clear all pins.
 * No-op for non-user modes (loop owns task-mode pins; auto is already cleared).
 */
export function clearUserPin(meta: SessionMeta): SessionMeta {
  if (meta.pinMode !== "user") return meta;
  const next: SessionMeta = { ...meta, pinMode: "auto" };
  delete next.pinnedTabs;
  return next;
}
