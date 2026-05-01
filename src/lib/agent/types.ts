import type { PageSnapshot, ActionResult } from "../dom-actions/types";

export type RiskLevel = "low" | "high";

export interface RiskAssessment {
  level: RiskLevel;
  reason?: string;
}

/**
 * Phase 3 — confirm-time TabTarget snapshot injected into the handler context
 * for cross-tab tools. K-8 confirm-time origin re-verify: handlers compare
 * the live tab origin (chrome.tabs.get inside the handler) against this
 * map's origin (which the user saw on the confirm card), NOT against
 * pinnedOrigin. If a tab navigated to another origin between approval and
 * dispatch, the handler skips it (stale).
 *
 * Loop dispatch builds this map from tabTargets (after approval) and passes
 * it on the same call as ctx; non-tab tools see undefined.
 */
export interface ConfirmedTabTarget {
  origin: string;
  title: string;
}

export interface ToolHandlerContext {
  tabId: number;
  snapshot: PageSnapshot;
  confirmedTabTargets?: Map<number, ConfirmedTabTarget>;
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema object
  handler: (args: unknown, ctx: ToolHandlerContext) => Promise<ActionResult>;
}
