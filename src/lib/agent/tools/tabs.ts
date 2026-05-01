import type { ActionResult } from "../../dom-actions/types";
import type { ConfirmedTabTarget, Tool, ToolHandlerContext } from "../types";
import { escapeUntrustedWrappers } from "../untrusted-wrappers";

/**
 * Phase 3 — parse a chrome.tabs.Tab.url into an origin string. Returns ""
 * for unparseable / restricted URLs so the caller can compare against the
 * confirm-time origin without false positives. Inline (not imported from
 * loop.ts) because tabs.ts handlers are agent-runtime code; loop.ts is the
 * SW dispatch surface — keeping origin parsing local avoids a cycle.
 */
function parseTabOrigin(url: string | undefined): string {
  if (!url) return "";
  try {
    const o = new URL(url).origin;
    if (!o || o === "null") return "";
    return o;
  } catch {
    return "";
  }
}

/**
 * Phase 3 K-8 — confirm-time origin re-verify. Compares the LIVE tab origin
 * (chrome.tabs.get inside the handler) against the map carried via ctx
 * (what the user saw on the confirm card). Returns:
 *   - { ok: true, tab } when the tab still exists AND its origin matches
 *     what the user approved
 *   - { ok: false, reason: "missing" | "navigated" | "no-confirm-record" }
 *     otherwise
 *
 * Handlers use this BEFORE calling chrome.tabs.{remove, group, ungroup,
 * move, update} on a target id — skip the id and report it in the
 * partial-completion observation when ok=false.
 */
async function verifyConfirmedOrigin(
  tabId: number,
  confirmed: Map<number, ConfirmedTabTarget> | undefined,
): Promise<
  | { ok: true; tab: chrome.tabs.Tab; origin: string }
  | { ok: false; reason: "missing" | "navigated" | "no-confirm-record" }
> {
  if (!confirmed) {
    return { ok: false, reason: "no-confirm-record" };
  }
  const expected = confirmed.get(tabId);
  if (!expected) {
    return { ok: false, reason: "no-confirm-record" };
  }
  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return { ok: false, reason: "missing" };
  }
  const live = parseTabOrigin(tab.url);
  if (!live || live !== expected.origin) {
    return { ok: false, reason: "navigated" };
  }
  return { ok: true, tab, origin: live };
}

/**
 * Phase 3 cross-tab tools. Implementation lands incrementally:
 *  - Unit 1 (this file's first version): list_tabs only
 *  - Unit 3 will add close_tabs, activate_tab
 *  - Unit 4 will add group_tabs, ungroup_tabs, move_tabs
 *  - Unit 5 will add get_tab_content
 *
 * All tools share the per-call cross-origin args introspection in risk.ts
 * (Phase 3 invariant P3-A) — each handler is responsible for its own stale
 * tab detection and partial-completion semantics (P3-H), but the loop's
 * confirm wire shape (Unit 2) carries the multi-tab informed-approval
 * payload uniformly.
 *
 * G-1 acceptance gate: any new entry here MUST also be added to TAB_TOOL_NAMES
 * in tool-names.ts AND have a matching always-high (or args-introspection)
 * branch in risk.ts. If a future PR adds a low-risk cross-tab tool, it must
 * first upgrade SkillDefinition.allowedTools schema (see plan K-3 / G-1).
 */

const LIST_TABS_MAX = 50;
const TITLE_MAX_LEN = 100;
const DOMAIN_MAX_LEN = 50;
const RESTRICTED_URL_PREFIXES = [
  "chrome://",
  "chrome-extension://",
  "chrome-search://",
  "edge://",
  "about:",
  "data:",
  "javascript:",
  "view-source:",
];

// Strip control chars except tab (\x09) and the line breaks we replace
// before this — \n \r \v \f are handled separately because we replace
// them with spaces (preserves word boundaries) instead of stripping.
// \x7f is DEL.
const CONTROL_CHARS_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
const LINE_BREAK_RE = /[\n\r\v\f]/g;

interface ListTabsArgs {
  scope?: "currentWindow" | "allWindows";
  limit?: number;
}

interface TabMetadataEntry {
  id: number;
  title: string;
  domain: string;
  active: boolean;
  pinned: boolean;
  groupId: number; // -1 = no group
  lastAccessed?: number;
  windowId: number;
}

function sanitizeTabTitle(rawTitle: string | undefined): string {
  if (!rawTitle) return "(untitled)";
  // 1. Replace line breaks with spaces — wrapper output is line-oriented
  //    "[id] \"title\" | domain" and embedded newlines would let an attacker
  //    break the format.
  let cleaned = rawTitle.replace(LINE_BREAK_RE, " ");
  // 2. Strip remaining control chars.
  cleaned = cleaned.replace(CONTROL_CHARS_RE, "");
  // 3. Truncate.
  if (cleaned.length > TITLE_MAX_LEN) {
    cleaned = cleaned.slice(0, TITLE_MAX_LEN) + "…";
  }
  // 4. Escape wrapper-tag literals (P3-O).
  return escapeUntrustedWrappers(cleaned);
}

function computeDomain(rawUrl: string | undefined): string {
  if (!rawUrl) return "(no-url)";
  // Restricted URLs have no real hostname — surface them as "(restricted)" so
  // the LLM sees they exist as data but won't try to navigate / extract them.
  if (RESTRICTED_URL_PREFIXES.some((p) => rawUrl.startsWith(p))) {
    return "(restricted)";
  }
  let hostname = "";
  try {
    hostname = new URL(rawUrl).hostname;
  } catch {
    return "(invalid-url)";
  }
  // Take the last two labels: docs.rs → docs.rs, www.foo.com → foo.com.
  // Public-suffix list parsing isn't worth the dependency for confirm-card
  // display; the agent gets full URL context elsewhere.
  const parts = hostname.split(".");
  const tail = parts.length >= 2 ? parts.slice(-2).join(".") : hostname;
  let cleaned = tail;
  if (cleaned.length > DOMAIN_MAX_LEN) {
    cleaned = cleaned.slice(0, DOMAIN_MAX_LEN) + "…";
  }
  return escapeUntrustedWrappers(cleaned);
}

/**
 * Wrap an array of tab metadata entries in <untrusted_tab_metadata> for the
 * LLM observation. Format (one tab per line):
 *
 *   <untrusted_tab_metadata>
 *   scope=currentWindow, total=12
 *   [12] "GitHub - foo/bar" | github.com (active, group:3, idle:5min)
 *   [13] "tokio docs"        | tokio.rs
 *   ...
 *   </untrusted_tab_metadata>
 *
 * Per Phase 3 invariant P3-C, every value inside this wrapper is third-party
 * data (page-controlled tab title, page-controlled URL); the LLM must treat
 * everything in this block as data, never instructions. The system prompt's
 * tab-tools section calls this out explicitly.
 */
export function wrapTabMetadata(
  tabs: TabMetadataEntry[],
  totals: { totalCount: number; truncated: boolean; scope: "currentWindow" | "allWindows" },
): string {
  const header = `scope=${totals.scope}, total=${totals.totalCount}${totals.truncated ? ", truncated=true" : ""}`;
  if (tabs.length === 0) {
    return `<untrusted_tab_metadata>\n${header}\n(no tabs visible to the agent)\n</untrusted_tab_metadata>`;
  }
  const now = Date.now();
  const lines = tabs.map((t) => {
    const tags: string[] = [];
    if (t.active) tags.push("active");
    if (t.pinned) tags.push("pinned");
    if (t.groupId !== -1) tags.push(`group:${t.groupId}`);
    if (t.lastAccessed) {
      const idleMs = now - t.lastAccessed;
      const mins = Math.floor(idleMs / 60_000);
      if (mins >= 1) tags.push(`idle:${mins}min`);
    }
    const tagSuffix = tags.length > 0 ? ` (${tags.join(", ")})` : "";
    return `[${t.id}] "${t.title}" | ${t.domain}${tagSuffix}`;
  });
  return `<untrusted_tab_metadata>\n${header}\n${lines.join("\n")}\n</untrusted_tab_metadata>`;
}

/**
 * list_tabs — return tab metadata for the agent to reason about.
 *
 * Risk classification (in risk.ts):
 *   - scope = "currentWindow" (default) → low (no confirm)
 *   - scope = "allWindows"              → high + reason "crossWindowTabExposure" (Phase 3 P3-T)
 *
 * Limits:
 *   - default 50, max 50 (P3-I)
 *   - if more tabs exist, returns first 50 + total_count + truncated:true
 *
 * Privacy invariant P3-K: incognito-window tabs are NOT visible because the
 * extension manifest deliberately omits "incognito": "spanning". Tested in
 * Unit 1 verification.
 */
const listTabsTool: Tool = {
  name: "list_tabs",
  description:
    "List open browser tabs with metadata (id, title, domain, active state, group). " +
    "Default scope is currentWindow (low risk). scope='allWindows' exposes tabs across " +
    "all windows and triggers a high-risk user confirmation. Max 50 tabs returned per call.",
  parameters: {
    type: "object",
    properties: {
      scope: {
        type: "string",
        enum: ["currentWindow", "allWindows"],
        description:
          "currentWindow (default): tabs in the agent's window only. allWindows: tabs across every browser window — requires user confirmation.",
      },
      limit: {
        type: "number",
        description: `Max tabs to return (default ${LIST_TABS_MAX}, hard cap ${LIST_TABS_MAX}).`,
      },
    },
    additionalProperties: false,
  },
  handler: async (args: unknown): Promise<ActionResult> => {
    const a = (args ?? {}) as ListTabsArgs;
    const scope = a.scope === "allWindows" ? "allWindows" : "currentWindow";
    const requestedLimit =
      typeof a.limit === "number" && Number.isFinite(a.limit) && a.limit > 0
        ? Math.min(Math.floor(a.limit), LIST_TABS_MAX)
        : LIST_TABS_MAX;

    const queryInfo: chrome.tabs.QueryInfo =
      scope === "currentWindow" ? { currentWindow: true } : {};
    const allTabs = await chrome.tabs.query(queryInfo);

    // Filter tabs without an id or windowId (chrome occasionally surfaces
    // partial tabs during navigation transitions) — we can't safely act on
    // them. URL may legitimately be undefined for chrome:// pages without
    // tabs permission elevation, but we have the permission, so this is rare.
    const usable = allTabs.filter(
      (t): t is chrome.tabs.Tab & { id: number; windowId: number } =>
        typeof t.id === "number" && typeof t.windowId === "number",
    );

    const totalCount = usable.length;
    const truncated = totalCount > requestedLimit;
    const sliced = usable.slice(0, requestedLimit);

    const entries: TabMetadataEntry[] = sliced.map((t) => ({
      id: t.id,
      title: sanitizeTabTitle(t.title),
      domain: computeDomain(t.url),
      active: t.active,
      pinned: t.pinned,
      groupId: typeof t.groupId === "number" ? t.groupId : -1,
      lastAccessed: t.lastAccessed,
      windowId: t.windowId,
    }));

    const observation = wrapTabMetadata(entries, {
      totalCount,
      truncated,
      scope,
    });

    return {
      success: true,
      observation,
    };
  },
};

// ── Unit 3 — close_tabs / activate_tab ──────────────────────────────────────

const CLOSE_TABS_MAX = 50;

interface CloseTabsArgs {
  tabIds: number[];
}

interface ActivateTabArgs {
  tabId: number;
}

interface PartialCompletionResult {
  ok: number[];
  skipped: Array<{ id: number; reason: string }>;
  errors: Array<{ id: number; message: string }>;
}

function summarizePartial(
  toolName: string,
  result: PartialCompletionResult,
): string {
  const lines: string[] = [];
  lines.push(`${toolName}: ${result.ok.length} succeeded`);
  if (result.skipped.length > 0) {
    lines.push(
      `skipped (${result.skipped.length}): ${result.skipped
        .map((s) => `[${s.id}: ${s.reason}]`)
        .join(", ")}`,
    );
  }
  if (result.errors.length > 0) {
    lines.push(
      `errors (${result.errors.length}): ${result.errors
        .map((e) => `[${e.id}: ${e.message}]`)
        .join(", ")}`,
    );
  }
  return lines.join("\n");
}

const closeTabsTool: Tool = {
  name: "close_tabs",
  description:
    "Close one or more tabs by id. Cannot close the agent's pinned/active tab " +
    "(K-9) — ask the user to close the current tab manually instead. Each tab " +
    "is re-verified against the origin shown on the confirm card; tabs that " +
    "have navigated to a different origin since approval are skipped.",
  parameters: {
    type: "object",
    properties: {
      tabIds: {
        type: "array",
        items: { type: "integer" },
        description: `Tab ids to close (max ${CLOSE_TABS_MAX} per call).`,
      },
    },
    required: ["tabIds"],
    additionalProperties: false,
  },
  handler: async (args: unknown, ctx: ToolHandlerContext): Promise<ActionResult> => {
    const a = (args ?? {}) as CloseTabsArgs;
    if (!Array.isArray(a.tabIds) || a.tabIds.length === 0) {
      return { success: false, error: "close_tabs requires a non-empty tabIds array" };
    }
    if (a.tabIds.length > CLOSE_TABS_MAX) {
      return {
        success: false,
        error: `close_tabs accepts at most ${CLOSE_TABS_MAX} tab ids per call (received ${a.tabIds.length}).`,
      };
    }

    // K-9: never close the pinned tab. The handler refuses up front so the
    // failure is visible in the observation rather than relying on the
    // per-round origin re-check to recover from a closed pinnedTabId.
    if (a.tabIds.includes(ctx.tabId)) {
      return {
        success: false,
        error:
          "close_tabs cannot close the agent's pinned tab. Ask the user to close it manually.",
      };
    }

    const result: PartialCompletionResult = { ok: [], skipped: [], errors: [] };
    const survivors: number[] = [];

    // K-8: confirm-time origin re-verify per id. Skip stale; collect
    // survivors for a single chrome.tabs.remove batch call.
    for (const id of a.tabIds) {
      const verify = await verifyConfirmedOrigin(id, ctx.confirmedTabTargets);
      if (!verify.ok) {
        result.skipped.push({ id, reason: verify.reason });
        continue;
      }
      survivors.push(id);
    }

    if (survivors.length === 0) {
      return {
        success: false,
        observation: `close_tabs: no valid targets (all tabs were stale or unconfirmed).\n${summarizePartial("close_tabs", result)}`,
        error: "noValidTargets",
      };
    }

    try {
      await chrome.tabs.remove(survivors);
      result.ok.push(...survivors);
    } catch (e) {
      // Batch failed — record on every id so the agent sees what didn't go.
      const message = e instanceof Error ? e.message : String(e);
      for (const id of survivors) {
        result.errors.push({ id, message });
      }
    }

    return {
      success: result.ok.length > 0,
      observation: summarizePartial("close_tabs", result),
    };
  },
};

const activateTabTool: Tool = {
  name: "activate_tab",
  description:
    "Switch the user's view to a specific tab. The agent's pinned tab does " +
    "NOT change — subsequent click/type tools still target the original tab. " +
    "Use this only to bring a tab into the user's view; do not assume the " +
    "agent will operate on the activated tab next.",
  parameters: {
    type: "object",
    properties: {
      tabId: {
        type: "integer",
        description: "Tab id to make active.",
      },
    },
    required: ["tabId"],
    additionalProperties: false,
  },
  handler: async (args: unknown, ctx: ToolHandlerContext): Promise<ActionResult> => {
    const a = (args ?? {}) as ActivateTabArgs;
    if (typeof a.tabId !== "number") {
      return { success: false, error: "activate_tab requires a numeric tabId" };
    }

    // For same-origin activate_tab the call is low-risk (no confirm fired),
    // so confirmedTabTargets is undefined — skip K-8 re-verify in that path.
    // For cross-origin activate_tab the loop pre-built confirmedTabTargets;
    // re-verify against it.
    if (ctx.confirmedTabTargets) {
      const verify = await verifyConfirmedOrigin(a.tabId, ctx.confirmedTabTargets);
      if (!verify.ok) {
        return {
          success: false,
          error: `activate_tab skipped: ${verify.reason}`,
        };
      }
    } else {
      // Same-origin path — still need to confirm tab exists before update.
      try {
        await chrome.tabs.get(a.tabId);
      } catch {
        return { success: false, error: `activate_tab: tab ${a.tabId} not found` };
      }
    }

    try {
      await chrome.tabs.update(a.tabId, { active: true });
      return {
        success: true,
        observation: `Activated tab ${a.tabId}. Note: the agent's pinned tab is unchanged; subsequent click/type tools still target the original tab.`,
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "activate_tab failed",
      };
    }
  },
};

export const TAB_TOOLS: Tool[] = [
  listTabsTool,
  closeTabsTool,
  activateTabTool,
  // Unit 4-5 will append: group_tabs, ungroup_tabs, move_tabs, get_tab_content
];
