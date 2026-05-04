import { describe, it, expect, vi, beforeEach } from "vitest";
import { dispatchCaptureVisibleTab, _resetBudgetForTests } from "./screenshot";

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

  it("rejects 'capture-failed' when chrome.tabs.captureVisibleTab throws", async () => {
    (globalThis as any).chrome.tabs.captureVisibleTab.mockRejectedValueOnce(
      new Error("API call failed"),
    );
    const res = await dispatchCaptureVisibleTab({
      sessionId: "s1",
      taskId: "t1",
      pinnedTabId: 42,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("capture-failed");
  });
});
