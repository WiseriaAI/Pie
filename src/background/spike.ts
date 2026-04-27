// PHASE-2.5-SPIKE: throwaway harness for validating CDP keyboard simulation
// + clipboard paste baseline. Remove this entire file after spike concludes.
// See docs/plans/2026-04-28-001-feat-phase2.5-cdp-keyboard-simulation-plan.md

export type SpikeCommand =
  | { type: "spike-run"; method: "cdp-insert-text"; text: string }
  | { type: "spike-run"; method: "cdp-press-enter" }
  | { type: "spike-run"; method: "clipboard-paste"; text: string };

export interface SpikeResponse {
  type: "spike-result";
  ok: boolean;
  notes: string[];
  error?: string;
}

async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab");
  if (
    !tab.url ||
    tab.url.startsWith("chrome://") ||
    tab.url.startsWith("chrome-extension://") ||
    tab.url.startsWith("about:") ||
    tab.url.startsWith("edge://")
  ) {
    throw new Error(`Cannot run spike on this URL: ${tab.url || "(empty)"}`);
  }
  return tab.id;
}

async function attachDebugger(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, "1.3", () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message || "attach failed"));
      else resolve();
    });
  });
}

async function detachDebugger(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    chrome.debugger.detach({ tabId }, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

async function sendCommand(
  tabId: number,
  method: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message || `${method} failed`));
      else resolve(result);
    });
  });
}

async function runCdpInsertText(text: string): Promise<SpikeResponse> {
  const notes: string[] = [];
  const tabId = await getActiveTabId();
  notes.push(`active tab id: ${tabId}`);

  const t0 = performance.now();
  await attachDebugger(tabId);
  notes.push(`attached in ${Math.round(performance.now() - t0)}ms`);

  try {
    await sendCommand(tabId, "Input.insertText", { text });
    notes.push(`Input.insertText sent, length=${text.length}`);

    // Brief wait so user can see the result before yellow bar disappears.
    // Removed in real implementation; spike-only.
    await new Promise((r) => setTimeout(r, 400));

    return { type: "spike-result", ok: true, notes };
  } finally {
    await detachDebugger(tabId);
    notes.push("detached");
  }
}

async function runCdpPressEnter(): Promise<SpikeResponse> {
  const notes: string[] = [];
  const tabId = await getActiveTabId();
  notes.push(`active tab id: ${tabId}`);

  await attachDebugger(tabId);
  notes.push("attached");

  try {
    const keyParams = {
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    };
    await sendCommand(tabId, "Input.dispatchKeyEvent", {
      type: "keyDown",
      ...keyParams,
    });
    await sendCommand(tabId, "Input.dispatchKeyEvent", {
      type: "keyUp",
      ...keyParams,
    });
    notes.push("keyDown + keyUp Enter sent");

    await new Promise((r) => setTimeout(r, 400));
    return { type: "spike-result", ok: true, notes };
  } finally {
    await detachDebugger(tabId);
    notes.push("detached");
  }
}

// Self-contained injected function: tries clipboard.writeText then paste.
// If writeText rejects (permission / no user gesture), falls back to a
// document.execCommand('copy') hack on a hidden textarea.
function pasteInjected(text: string): {
  setClipboard: "navigator" | "execCommand-copy" | "failed";
  setError?: string;
  pasteResult: boolean;
  activeTagBefore: string;
  activeTagAfter: string;
  isTrustedHint: string;
} {
  const before = document.activeElement;
  const activeTagBefore = before
    ? `${before.tagName.toLowerCase()}${before.id ? "#" + before.id : ""}`
    : "(none)";

  let setClipboard: "navigator" | "execCommand-copy" | "failed" = "failed";
  let setError: string | undefined;

  // Strategy 1: navigator.clipboard.writeText (modern, requires permission)
  try {
    // Note: this is async, but we don't await — we'll try the synchronous
    // fallback as well to maximize the chance clipboard is set when paste runs.
    // For spike purposes this is OK; results below will tell us which worked.
    void navigator.clipboard.writeText(text).catch((e: unknown) => {
      setError = e instanceof Error ? e.message : String(e);
    });
    setClipboard = "navigator";
  } catch (e) {
    setError = e instanceof Error ? e.message : String(e);
  }

  // Strategy 2: hidden textarea + execCommand('copy') hack (synchronous,
  // more reliable in extension contexts but uses deprecated API)
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const copyOk = document.execCommand("copy");
    document.body.removeChild(ta);
    if (copyOk) setClipboard = "execCommand-copy";
  } catch {
    // ignore — strategy 1 may have worked
  }

  // Restore focus to the original active element so paste targets it
  if (before instanceof HTMLElement) before.focus();

  // Try paste
  let pasteResult = false;
  try {
    pasteResult = document.execCommand("paste");
  } catch (e) {
    setError = (setError ? setError + "; " : "") +
      "paste threw: " + (e instanceof Error ? e.message : String(e));
  }

  const after = document.activeElement;
  const activeTagAfter = after
    ? `${after.tagName.toLowerCase()}${after.id ? "#" + after.id : ""}`
    : "(none)";

  // We can't easily detect whether the editor consumed the paste — the user
  // will visually inspect the doc. We can detect whether execCommand returned
  // true (browser thinks it dispatched).
  const isTrustedHint =
    "paste events triggered via execCommand are isTrusted=true; canvas editors may still ignore them if they bind to keydown rather than paste.";

  return {
    setClipboard,
    setError,
    pasteResult,
    activeTagBefore,
    activeTagAfter,
    isTrustedHint,
  };
}

async function runClipboardPaste(text: string): Promise<SpikeResponse> {
  const notes: string[] = [];
  const tabId = await getActiveTabId();
  notes.push(`active tab id: ${tabId}`);

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: pasteInjected,
    args: [text],
  });

  const r = results[0]?.result as ReturnType<typeof pasteInjected> | undefined;
  if (!r) {
    return {
      type: "spike-result",
      ok: false,
      notes,
      error: "executeScript returned no result",
    };
  }

  notes.push(`activeElement before paste: ${r.activeTagBefore}`);
  notes.push(`activeElement after paste: ${r.activeTagAfter}`);
  notes.push(`clipboard set via: ${r.setClipboard}`);
  if (r.setError) notes.push(`clipboard error: ${r.setError}`);
  notes.push(`document.execCommand('paste') returned: ${r.pasteResult}`);
  notes.push(r.isTrustedHint);
  notes.push(
    "Verdict: visually check the editor — if text appeared, paste path works.",
  );

  return { type: "spike-result", ok: r.pasteResult, notes };
}

export async function handleSpike(cmd: SpikeCommand): Promise<SpikeResponse> {
  try {
    switch (cmd.method) {
      case "cdp-insert-text":
        return await runCdpInsertText(cmd.text);
      case "cdp-press-enter":
        return await runCdpPressEnter();
      case "clipboard-paste":
        return await runClipboardPaste(cmd.text);
    }
  } catch (e) {
    return {
      type: "spike-result",
      ok: false,
      notes: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
