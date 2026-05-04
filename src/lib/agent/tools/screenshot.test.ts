import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  dispatchCaptureVisibleTab, _resetBudgetForTests, resetTaskBudget,
  dispatchCaptureFullPageTab,
} from "./screenshot";

beforeEach(() => {
  _resetBudgetForTests();
  // Spread existing chrome mock from setup.ts to preserve storage/runtime,
  // then override .tabs with the focused mock for this file.
  (globalThis as any).chrome = {
    ...((globalThis as any).chrome ?? {}),
    tabs: {
      captureVisibleTab: vi.fn(async (_winId: unknown, _opts: unknown) => {
        return "data:image/jpeg;base64," + "A".repeat(8);
      }),
      get: vi.fn(async (id: number) => ({
        id,
        active: true,
        windowId: 1,
        url: "https://example.com/a",
      })),
    },
  };
});

describe("dispatchCaptureVisibleTab", () => {
  it("returns post-resize ImageAttachment", async () => {
    const res = await dispatchCaptureVisibleTab({
      sessionId: "s1",
      taskId: "t1",
      pinnedTabId: 42,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.kind).toBe("image");
      expect(res.value.mediaType).toBe("image/jpeg");
      expect(res.value.byteLength).toBe(245678); // from FakeOffscreenCanvas polyfill in setup.ts
    }
  });

  it("rejects with 'pinned-tab-not-visible' when target tab is not active", async () => {
    (globalThis as any).chrome.tabs.get.mockResolvedValueOnce({
      id: 42,
      active: false,
      windowId: 1,
      url: "https://example.com/a",
    });
    const res = await dispatchCaptureVisibleTab({
      sessionId: "s1",
      taskId: "t1",
      pinnedTabId: 42,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("pinned-tab-not-visible");
  });

  it("enforces per-task budget of 5 captures", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await dispatchCaptureVisibleTab({
        sessionId: "s1",
        taskId: "t1",
        pinnedTabId: 42,
      });
      expect(r.ok).toBe(true);
    }
    const r6 = await dispatchCaptureVisibleTab({
      sessionId: "s1",
      taskId: "t1",
      pinnedTabId: 42,
    });
    expect(r6.ok).toBe(false);
    if (!r6.ok) expect(r6.reason).toBe("screenshot-budget-exceeded");
  });

  it("budget resets per-task — new taskId gets fresh quota", async () => {
    for (let i = 0; i < 5; i++) {
      await dispatchCaptureVisibleTab({ sessionId: "s1", taskId: "t1", pinnedTabId: 42 });
    }
    const fresh = await dispatchCaptureVisibleTab({
      sessionId: "s1",
      taskId: "t2",
      pinnedTabId: 42,
    });
    expect(fresh.ok).toBe(true);
  });

  it("rejects 'capture-failed' when chrome.tabs.captureVisibleTab throws AND does not consume budget", async () => {
    (globalThis as any).chrome.tabs.captureVisibleTab.mockRejectedValueOnce(
      new Error("API call failed"),
    );
    const res = await dispatchCaptureVisibleTab({
      sessionId: "s1", taskId: "t1", pinnedTabId: 42,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("capture-failed");
    // After the failed capture, the LLM still has all 5 captures available
    // (failed captures must NOT consume quota).
    for (let i = 0; i < 5; i++) {
      const r = await dispatchCaptureVisibleTab({
        sessionId: "s1", taskId: "t1", pinnedTabId: 42,
      });
      expect(r.ok).toBe(true);
    }
  });

  it("resetTaskBudget frees per-task quota mid-budget-exhaustion", async () => {
    for (let i = 0; i < 5; i++) {
      await dispatchCaptureVisibleTab({ sessionId: "s1", taskId: "t1", pinnedTabId: 42 });
    }
    // Budget exhausted on t1
    const exhausted = await dispatchCaptureVisibleTab({
      sessionId: "s1", taskId: "t1", pinnedTabId: 42,
    });
    expect(exhausted.ok).toBe(false);
    if (!exhausted.ok) expect(exhausted.reason).toBe("screenshot-budget-exceeded");

    // resetTaskBudget releases t1
    resetTaskBudget("t1");
    const fresh = await dispatchCaptureVisibleTab({
      sessionId: "s1", taskId: "t1", pinnedTabId: 42,
    });
    expect(fresh.ok).toBe(true);
  });
});

describe("dispatchCaptureFullPageTab", () => {
  it("acquires CDP, calls Page.captureScreenshot with captureBeyondViewport+jpeg+q85, returns ImageAttachment", async () => {
    const sendMock = vi.fn(async (method: string) => {
      if (method === "Page.captureScreenshot") {
        return { data: "A".repeat(8) }; // CDP returns raw base64
      }
      return {};
    });
    const acquireMock = vi.fn(async () => ({
      tabId: 42,
      ownerToken: { sessionId: "s1", tabId: 42 },
      generationId: 1,
      isAlive: true,
      detachedReason: null,
      send: sendMock,
      detach: vi.fn(async () => {}),
    } as never));
    const res = await dispatchCaptureFullPageTab(
      { sessionId: "s1", taskId: "t1", pinnedTabId: 42 },
      { acquireSession: acquireMock },
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.kind).toBe("image");
      expect(res.value.mediaType).toBe("image/jpeg");
    }
    expect(sendMock).toHaveBeenCalledWith("Page.captureScreenshot", expect.objectContaining({
      captureBeyondViewport: true,
      format: "jpeg",
      quality: 85,
    }));
  });

  it("returns capture-failed when acquireSession throws", async () => {
    const acquireMock = vi.fn(async () => {
      throw new Error("cdp attach failed");
    });
    const res = await dispatchCaptureFullPageTab(
      { sessionId: "s1", taskId: "t1", pinnedTabId: 42 },
      { acquireSession: acquireMock },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("capture-failed");
  });

  it("returns capture-failed when Page.captureScreenshot throws", async () => {
    const acquireMock = vi.fn(async () => ({
      tabId: 42, ownerToken: { sessionId: "s1", tabId: 42 },
      generationId: 1, isAlive: true, detachedReason: null,
      send: vi.fn(async () => { throw new Error("cdp send failed"); }),
      detach: vi.fn(async () => {}),
    } as never));
    const res = await dispatchCaptureFullPageTab(
      { sessionId: "s1", taskId: "t1", pinnedTabId: 42 },
      { acquireSession: acquireMock },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("capture-failed");
  });

  it("returns capture-failed when CDP returns empty data", async () => {
    const acquireMock = vi.fn(async () => ({
      tabId: 42, ownerToken: { sessionId: "s1", tabId: 42 },
      generationId: 1, isAlive: true, detachedReason: null,
      send: vi.fn(async () => ({})), // no `data` field
      detach: vi.fn(async () => {}),
    } as never));
    const res = await dispatchCaptureFullPageTab(
      { sessionId: "s1", taskId: "t1", pinnedTabId: 42 },
      { acquireSession: acquireMock },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("capture-failed");
  });

  it("shares the per-task budget with capture_visible_tab", async () => {
    // 5 visible captures consume budget — full-page now exceeds.
    for (let i = 0; i < 5; i++) {
      await dispatchCaptureVisibleTab({ sessionId: "s1", taskId: "t1", pinnedTabId: 42 });
    }
    const acquireMock = vi.fn(async () => ({
      send: vi.fn(), detach: vi.fn(),
      ownerToken: { sessionId: "s1", tabId: 42 },
      tabId: 42, generationId: 1, isAlive: true, detachedReason: null,
    } as never));
    const res = await dispatchCaptureFullPageTab(
      { sessionId: "s1", taskId: "t1", pinnedTabId: 42 },
      { acquireSession: acquireMock },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("screenshot-budget-exceeded");
    // acquireMock should NOT have been called when budget is exhausted
    expect(acquireMock).not.toHaveBeenCalled();
  });
});
