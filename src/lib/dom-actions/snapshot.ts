import type { PageSnapshot } from "./types";

/**
 * Self-contained function injected via chrome.scripting.executeScript.
 * NO imports, NO closures, NO outer-scope references at runtime.
 * All helpers are nested inside this function.
 *
 * Issue #27 — async with two settle waits before extraction:
 *
 * Symptom: after a click that triggers a navigation (Turbo/Hotwire form
 * submit, SPA route change, or a real cross-document nav), the next loop
 * iteration's observation reported the NEW `Current URL:` (from
 * chrome.tabs.get) but the OLD interactive elements list (from this
 * function via chrome.scripting.executeScript). Two Chrome APIs see
 * different moments of the navigation lifecycle: tab metadata updates at
 * commit / pushState, while the scripting target's DOM may still be the
 * outgoing document or be mid-swap. The model treated this as "page
 * unchanged" and re-clicked the submit button — issue #27.
 *
 * Fix: page-side stability wait inside the injected function so the
 * snapshot only reads DOM after the page has settled. Two phases:
 *   1. readyState !== 'complete' → await `load` event (max 2000ms)
 *   2. MutationObserver on document.body until 200ms of quiet
 *      childList/subtree mutations, capped at 1500ms
 *
 * MV3 chrome.scripting.executeScript awaits Promises returned by `func`;
 * the resolved value lands in `results[0].result`. No call-site change in
 * loop.ts needed. Steady-state cost is ~200ms (the quiet window) per
 * iteration; on a navigation the worst case is ~3500ms but it eliminates
 * the "stale snapshot" failure mode entirely.
 *
 * Order matters: stability waits run BEFORE the cleanup of the
 * `data-chrome-ai-agent-idx` attribute. If cleanup ran first the
 * MutationObserver would observe its own attribute removals as page
 * activity and never reach the quiet threshold.
 */
export async function snapshotInteractiveElements(): Promise<PageSnapshot> {
  // ── Helpers (all nested; captured when Chrome serializes this function) ──

  function waitForReadyComplete(maxMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      if (document.readyState === "complete") {
        resolve();
        return;
      }
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        window.removeEventListener("load", finish);
        resolve();
      };
      window.addEventListener("load", finish, { once: true });
      // Hard cap so a stuck `load` (e.g. a hung sub-resource) doesn't
      // wedge the agent loop. The page may still snapshot correctly even
      // without `load` having fired — readyState 'interactive' usually
      // has the interactive elements in place.
      setTimeout(finish, maxMs);
    });
  }

  function waitForDomStable(quietMs: number, maxMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      // No body yet (very early page state) — nothing to observe; let the
      // extraction below handle the empty-DOM case.
      if (!document.body) {
        resolve();
        return;
      }
      let lastMutationAt = Date.now();
      const startedAt = lastMutationAt;
      const observer = new MutationObserver(() => {
        lastMutationAt = Date.now();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      const tick = () => {
        const now = Date.now();
        if (now - lastMutationAt >= quietMs || now - startedAt >= maxMs) {
          observer.disconnect();
          resolve();
          return;
        }
        setTimeout(tick, 50);
      };
      setTimeout(tick, 50);
    });
  }


  function sanitizeText(str: string, maxLen: number): string {
    if (!str) return "";
    // Filter control chars (\u0000-\u001F) and zero-width chars (\u200B-\u200F)
    let cleaned = str.replace(/[\u0000-\u001F\u200B-\u200F]/g, "");
    // Neutralize the untrusted-content wrapper tags so page text cannot close
    // the <untrusted_*> blocks that the agent prompt builder uses. Without
    // this, a page element with text like "</untrusted_page_content> SYSTEM: ..."
    // could escape the untrusted wrapper and become LLM instructions.
    //
    // NOTE: this function is injected via chrome.scripting.executeScript and
    // cannot import external helpers. The non-injected code path uses the
    // shared escapeUntrustedWrappers helper at src/lib/agent/untrusted-wrappers.ts;
    // both implementations cover the same wrapper-tag set (Phase 3 P3-O).
    // Keep this list in sync with UNTRUSTED_WRAPPER_TAGS in that helper.
    // M2-U3: added untrusted_user_message (R29 LLM title prompt wrapper).
    // U3: added untrusted_prior_task_summary (agent task synth wrapper).
    // A1 fix: added untrusted_continuity_marker (U4 sentinel stub wrapper).
    cleaned = cleaned
      .replace(/<\/?untrusted_page_content>/gi, "[filtered]")
      .replace(/<\/?untrusted_skill_params>/gi, "[filtered]")
      .replace(/<\/?untrusted_tab_metadata>/gi, "[filtered]")
      .replace(/<\/?untrusted_user_message>/gi, "[filtered]")
      .replace(/<\/?untrusted_prior_task_summary>/gi, "[filtered]")
      .replace(/<\/?untrusted_continuity_marker>/gi, "[filtered]");
    if (cleaned.length > maxLen) {
      cleaned = cleaned.slice(0, maxLen) + "...";
    }
    return cleaned;
  }

  function getRegion(el: Element): string {
    let node: Element | null = el;
    while (node && node !== document.body) {
      const tag = node.tagName?.toLowerCase();
      const role = node.getAttribute("role")?.toLowerCase();

      if (tag === "main" || role === "main") return "main";
      if (tag === "nav" || role === "navigation") return "nav";
      if (tag === "header" || role === "banner") return "header";
      if (tag === "footer" || role === "contentinfo") return "footer";
      if (tag === "aside" || role === "complementary") return "aside";

      node = node.parentElement;
    }
    return "other";
  }

  function isVisible(el: Element): boolean {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    // Filter fully-transparent elements — rich-text editors like Feishu Docs
    // and Google Docs use opacity:0 textareas as hidden IME buffers; they're
    // technically in the DOM tree but not user-visible typing targets.
    if (parseFloat(style.opacity) === 0) return false;
    // Tiny inputs/textareas (< 8px on either dimension) are almost always
    // hidden input capture buffers rather than real user inputs.
    const tag = el.tagName.toLowerCase();
    if ((tag === "input" || tag === "textarea") && (rect.width < 8 || rect.height < 8)) {
      return false;
    }
    // offsetParent is null for position:fixed elements too — skip the check for those
    if (style.position !== "fixed" && (el as HTMLElement).offsetParent === null) return false;
    return true;
  }

  function getElementText(el: Element): string {
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel?.trim()) return sanitizeText(ariaLabel.trim(), 200);

    const innerText = (el as HTMLElement).innerText?.trim();
    if (innerText) return sanitizeText(innerText, 200);

    const placeholder = (el as HTMLInputElement).placeholder?.trim();
    if (placeholder) return sanitizeText(placeholder, 200);

    const title = el.getAttribute("title")?.trim();
    if (title) return sanitizeText(title, 200);

    return "";
  }

  // ── Selector set (Phase 0 validated) ──
  const SELECTOR = [
    "a",
    "button",
    "input",
    "select",
    "textarea",
    '[role="button"]',
    '[role="link"]',
    '[role="tab"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="switch"]',
    '[role="menuitem"]',
    '[contenteditable="true"]',
    "summary",
    "[onclick]",
    "[tabindex]:not([tabindex='-1'])",
  ].join(", ");

  const MAX_ELEMENTS = 200;

  // Issue #27 — wait for the page to settle BEFORE the cleanup-then-stamp
  // pass below. The cleanup itself mutates DOM (removes data-chrome-ai-agent-idx
  // attributes), so running it before the MutationObserver-based stability
  // check would self-trigger the observer and indefinitely defer the quiet
  // window. Both helpers are no-throw / capped so they can't wedge the loop.
  try {
    await waitForReadyComplete(2000);
    await waitForDomStable(200, 1500);
  } catch {
    // best-effort settle; fall through to extraction even if waits fail
  }

  // Clean up any previously stamped attributes first
  // Namespaced attribute reduces collision with pages that use their own idx attributes.
  document.querySelectorAll("[data-chrome-ai-agent-idx]").forEach((el) => {
    el.removeAttribute("data-chrome-ai-agent-idx");
  });

  const candidates = Array.from(document.querySelectorAll(SELECTOR));

  // Filter to visible elements, preserving DOM order (querySelectorAll is already DOM order)
  const visible = candidates.filter((el) => isVisible(el));

  // Cap at 200
  const capped = visible.slice(0, MAX_ELEMENTS);

  const elements = capped.map((el, idx) => {
    // Stamp index attribute for action targeting
    el.setAttribute("data-chrome-ai-agent-idx", String(idx));

    const tag = el.tagName.toLowerCase();
    const inputEl = el as HTMLInputElement;
    const type = inputEl.type || undefined;
    const role = el.getAttribute("role") || undefined;
    const ariaLabel = el.getAttribute("aria-label")
      ? sanitizeText(el.getAttribute("aria-label")!.trim(), 200)
      : undefined;
    const placeholder = inputEl.placeholder
      ? sanitizeText(inputEl.placeholder.trim(), 60)
      : undefined;
    const text = getElementText(el);
    const disabled =
      (inputEl as HTMLInputElement).disabled === true ||
      el.getAttribute("aria-disabled") === "true";
    const region = getRegion(el) as
      | "main"
      | "nav"
      | "footer"
      | "aside"
      | "header"
      | "other";
    const rect = el.getBoundingClientRect();

    return {
      index: idx,
      tag,
      ...(type !== undefined ? { type } : {}),
      ...(role !== undefined ? { role } : {}),
      text,
      ...(placeholder !== undefined ? { placeholder } : {}),
      ...(ariaLabel !== undefined ? { ariaLabel } : {}),
      disabled,
      region,
      boundingBox: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };
  });

  return {
    url: location.href,
    title: document.title,
    elements,
  };
}
