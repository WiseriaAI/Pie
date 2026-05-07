import { describe, expect, it, vi } from "vitest";
import { createPortHandlers } from "./port-handlers";
import { EMPTY_SLOT, type SessionRuntimeSlot } from "./runtime-map";
import type { PortMessageToPanel } from "@/types";

function makeDeps() {
  const slotsRef = { current: new Map<string, SessionRuntimeSlot>() };
  const setSlots = vi.fn((updater: any) => {
    slotsRef.current =
      typeof updater === "function" ? updater(slotsRef.current) : updater;
  });
  const persistMessages = vi.fn(async () => {});
  return { slotsRef, setSlots, persistMessages };
}

describe("port-handlers — handleMessage routing", () => {
  describe("chat-chunk", () => {
    it("appends text to the slot identified by message.sessionId", () => {
      const deps = makeDeps();
      const { handleMessage } = createPortHandlers(deps);
      handleMessage({ type: "chat-chunk", text: "hi", sessionId: "s1" } as PortMessageToPanel);
      expect(deps.slotsRef.current.get("s1")?.accumulated).toBe("hi");
      expect(deps.slotsRef.current.get("s1")?.streamingText).toBe("hi");
    });

    it("does not touch other sessions' slots", () => {
      const deps = makeDeps();
      deps.slotsRef.current.set("s2", { ...EMPTY_SLOT, accumulated: "existing" });
      const { handleMessage } = createPortHandlers(deps);
      handleMessage({ type: "chat-chunk", text: "x", sessionId: "s1" } as PortMessageToPanel);
      expect(deps.slotsRef.current.get("s2")?.accumulated).toBe("existing");
    });
  });

  describe("chat-error", () => {
    it("flushes partial text and stores the error string", async () => {
      const deps = makeDeps();
      deps.slotsRef.current.set("s1", {
        ...EMPTY_SLOT,
        accumulated: "partial",
        streaming: true,
        streamFinished: false,
      });
      const { handleMessage } = createPortHandlers(deps);
      handleMessage({ type: "chat-error", error: "boom", sessionId: "s1" } as PortMessageToPanel);
      const slot = deps.slotsRef.current.get("s1")!;
      expect(slot.error).toBe("boom");
      expect(slot.streaming).toBe(false);
      expect(slot.streamFinished).toBe(true);
      expect(slot.messages).toEqual([{ role: "assistant", content: "partial" }]);
      expect(deps.persistMessages).toHaveBeenCalledWith(
        "s1",
        [{ role: "assistant", content: "partial" }],
      );
    });
  });
});

describe("chat-done", () => {
  it("flushes accumulated text into messages and resets streaming", async () => {
    const deps = makeDeps();
    deps.slotsRef.current.set("s1", {
      ...EMPTY_SLOT,
      accumulated: "hello world",
      streamingText: "hello world",
      streaming: true,
      streamFinished: false,
    });
    const { handleMessage } = createPortHandlers(deps);
    handleMessage({ type: "chat-done", sessionId: "s1" } as PortMessageToPanel);
    const slot = deps.slotsRef.current.get("s1")!;
    expect(slot.messages).toEqual([{ role: "assistant", content: "hello world" }]);
    expect(slot.accumulated).toBe("");
    expect(slot.streamingText).toBe("");
    expect(slot.streaming).toBe(false);
    expect(slot.streamFinished).toBe(true);
    // persistMessages called with the new messages array
    expect(deps.persistMessages).toHaveBeenCalledWith(
      "s1",
      [{ role: "assistant", content: "hello world" }],
    );
  });

  it("does not append an empty assistant message when accumulated is whitespace", () => {
    const deps = makeDeps();
    deps.slotsRef.current.set("s1", {
      ...EMPTY_SLOT,
      accumulated: "   ",
      streaming: true,
      streamFinished: false,
    });
    const { handleMessage } = createPortHandlers(deps);
    handleMessage({ type: "chat-done", sessionId: "s1" } as PortMessageToPanel);
    const slot = deps.slotsRef.current.get("s1")!;
    expect(slot.messages).toEqual([]);
    expect(slot.streaming).toBe(false);
  });
});
