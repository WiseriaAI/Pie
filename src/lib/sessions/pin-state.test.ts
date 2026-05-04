import { describe, expect, it } from "vitest";
import "@/test/setup";
import {
  getEffectivePinMode,
  clearTaskPinIfActive,
  setUserPin,
  clearUserPin,
} from "./pin-state";
import type { SessionMeta, SessionAgentState } from "./types";

const baseMeta = (overrides: Partial<SessionMeta> = {}): SessionMeta => ({
  id: "abc",
  createdAt: 0,
  lastAccessedAt: 0,
  status: "active",
  messages: [],
  ...overrides,
});

const baseAgent = (overrides: Partial<SessionAgentState> = {}): SessionAgentState => ({
  agentMessages: [],
  stepIndex: 0,
  skillExecutionScopeStack: [],
  hasImageContent: false,
  ...overrides,
});

describe("getEffectivePinMode — explicit pinMode field wins", () => {
  it("returns 'auto' when set explicitly", () => {
    expect(getEffectivePinMode(baseMeta({ pinMode: "auto" }), null)).toBe("auto");
  });

  it("returns 'task' when set explicitly", () => {
    expect(
      getEffectivePinMode(
        baseMeta({ pinMode: "task", pinnedTabId: 5, pinnedOrigin: "https://x.com" }),
        baseAgent({ stepIndex: 3 }),
      ),
    ).toBe("task");
  });

  it("returns 'user' when set explicitly", () => {
    expect(
      getEffectivePinMode(
        baseMeta({ pinMode: "user", pinnedTabId: 5, pinnedOrigin: "https://x.com" }),
        null,
      ),
    ).toBe("user");
  });
});

describe("getEffectivePinMode — legacy migration inference", () => {
  it("infers 'task' for legacy session with pinnedTabId + in-flight stepIndex > 0", () => {
    const meta = baseMeta({ pinnedTabId: 7, pinnedOrigin: "https://legacy.com" });
    const agent = baseAgent({ stepIndex: 5 });
    expect(getEffectivePinMode(meta, agent)).toBe("task");
  });

  it("infers 'auto' for legacy session with pinnedTabId but stepIndex === 0 (stale pin)", () => {
    const meta = baseMeta({ pinnedTabId: 7, pinnedOrigin: "https://legacy.com" });
    const agent = baseAgent({ stepIndex: 0 });
    expect(getEffectivePinMode(meta, agent)).toBe("auto");
  });

  it("infers 'auto' for fresh session (no pinnedTabId, no agent state)", () => {
    expect(getEffectivePinMode(baseMeta(), null)).toBe("auto");
  });

  it("infers 'auto' when pinnedTabId is set but agent is null", () => {
    // Defensive: agent null means storage was inconsistent; default to auto
    // and let next setSessionMeta normalize away the stale pin.
    const meta = baseMeta({ pinnedTabId: 7, pinnedOrigin: "https://legacy.com" });
    expect(getEffectivePinMode(meta, null)).toBe("auto");
  });
});

describe("clearTaskPinIfActive", () => {
  it("downgrades 'task' to 'auto' and clears pinnedTabId/Origin", () => {
    const meta = baseMeta({
      pinMode: "task",
      pinnedTabId: 9,
      pinnedOrigin: "https://x.com",
    });
    const result = clearTaskPinIfActive(meta);
    expect(result.pinMode).toBe("auto");
    expect(result.pinnedTabId).toBeUndefined();
    expect(result.pinnedOrigin).toBeUndefined();
  });

  it("is a no-op for 'user' mode (preserves user's explicit choice)", () => {
    const meta = baseMeta({
      pinMode: "user",
      pinnedTabId: 9,
      pinnedOrigin: "https://x.com",
    });
    const result = clearTaskPinIfActive(meta);
    expect(result.pinMode).toBe("user");
    expect(result.pinnedTabId).toBe(9);
    expect(result.pinnedOrigin).toBe("https://x.com");
  });

  it("is a no-op for 'auto' mode (already cleared)", () => {
    const meta = baseMeta({ pinMode: "auto" });
    const result = clearTaskPinIfActive(meta);
    expect(result).toBe(meta); // identity — no allocation
  });

  it("is a no-op when pinMode is undefined and no pinnedTabId (fresh session)", () => {
    const meta = baseMeta();
    const result = clearTaskPinIfActive(meta);
    expect(result).toBe(meta);
  });

  it("downgrades a legacy in-flight session (pinMode undefined + has pin) by clearing pin and setting mode=auto", () => {
    // emitDone called on a legacy session that never wrote pinMode but has a
    // stale legacy pin. We treat this as a 'task' that just ended.
    const meta = baseMeta({ pinnedTabId: 9, pinnedOrigin: "https://x.com" });
    const result = clearTaskPinIfActive(meta);
    expect(result.pinMode).toBe("auto");
    expect(result.pinnedTabId).toBeUndefined();
    expect(result.pinnedOrigin).toBeUndefined();
  });

  it("preserves other meta fields verbatim", () => {
    const meta = baseMeta({
      pinMode: "task",
      pinnedTabId: 9,
      pinnedOrigin: "https://x.com",
      title: "my task",
      messages: [{ role: "user", content: "hi" } as never],
    });
    const result = clearTaskPinIfActive(meta);
    expect(result.title).toBe("my task");
    expect(result.messages).toHaveLength(1);
    expect(result.id).toBe(meta.id);
    expect(result.createdAt).toBe(meta.createdAt);
  });
});

describe("setUserPin", () => {
  it("sets pinMode='user' and writes pinnedTabId/Origin", () => {
    const meta = baseMeta();
    const result = setUserPin(meta, { tabId: 42, origin: "https://example.com" });
    expect(result.pinMode).toBe("user");
    expect(result.pinnedTabId).toBe(42);
    expect(result.pinnedOrigin).toBe("https://example.com");
  });

  it("overrides an existing 'task' pin (user explicitly takes over)", () => {
    const meta = baseMeta({
      pinMode: "task",
      pinnedTabId: 1,
      pinnedOrigin: "https://old.com",
    });
    const result = setUserPin(meta, { tabId: 99, origin: "https://new.com" });
    expect(result.pinMode).toBe("user");
    expect(result.pinnedTabId).toBe(99);
    expect(result.pinnedOrigin).toBe("https://new.com");
  });

  it("preserves other meta fields", () => {
    const meta = baseMeta({ title: "my session" });
    const result = setUserPin(meta, { tabId: 1, origin: "https://x.com" });
    expect(result.title).toBe("my session");
  });
});

describe("clearUserPin", () => {
  it("downgrades 'user' to 'auto' and clears pinnedTabId/Origin", () => {
    const meta = baseMeta({
      pinMode: "user",
      pinnedTabId: 9,
      pinnedOrigin: "https://x.com",
    });
    const result = clearUserPin(meta);
    expect(result.pinMode).toBe("auto");
    expect(result.pinnedTabId).toBeUndefined();
    expect(result.pinnedOrigin).toBeUndefined();
  });

  it("is a no-op for 'task' mode (only user mode is the user's choice to clear)", () => {
    const meta = baseMeta({
      pinMode: "task",
      pinnedTabId: 9,
      pinnedOrigin: "https://x.com",
    });
    const result = clearUserPin(meta);
    // task pin is loop-managed, should not be cleared by UI dropdown's "Auto" click
    expect(result).toBe(meta);
  });

  it("is a no-op for 'auto' mode", () => {
    const meta = baseMeta({ pinMode: "auto" });
    const result = clearUserPin(meta);
    expect(result).toBe(meta);
  });
});
