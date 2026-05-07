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

describe("agent-step", () => {
  it("flushes pending accumulated text before appending the step", () => {
    const deps = makeDeps();
    deps.slotsRef.current.set("s1", {
      ...EMPTY_SLOT,
      accumulated: "thinking…",
      streamingText: "thinking…",
      streaming: true,
      streamFinished: false,
    });
    const { handleMessage } = createPortHandlers(deps);
    handleMessage({
      type: "agent-step",
      sessionId: "s1",
      stepIndex: 0,
      tool: "click",
      args: { selector: "#x" },
      status: "pending",
    } as PortMessageToPanel);
    const slot = deps.slotsRef.current.get("s1")!;
    expect(slot.messages).toEqual([
      { role: "assistant", content: "thinking…" },
      {
        role: "agent-step",
        stepIndex: 0,
        tool: "click",
        args: { selector: "#x" },
        resolvedElement: undefined,
        status: "pending",
        observation: undefined,
      },
    ]);
    expect(slot.accumulated).toBe("");
    expect(slot.streamingText).toBe("");
  });

  it("updates the existing trailing step bubble when stepIndex+tool match", () => {
    const deps = makeDeps();
    deps.slotsRef.current.set("s1", {
      ...EMPTY_SLOT,
      messages: [
        {
          role: "agent-step",
          stepIndex: 0,
          tool: "click",
          args: { selector: "#x" },
          resolvedElement: undefined,
          status: "pending",
          observation: undefined,
        },
      ],
    });
    const { handleMessage } = createPortHandlers(deps);
    handleMessage({
      type: "agent-step",
      sessionId: "s1",
      stepIndex: 0,
      tool: "click",
      args: { selector: "#x" },
      status: "ok",
      observation: "clicked",
    } as PortMessageToPanel);
    const slot = deps.slotsRef.current.get("s1")!;
    expect(slot.messages).toHaveLength(1);
    expect(slot.messages[0]).toMatchObject({ status: "ok", observation: "clicked" });
  });

  it("appends a new step when stepIndex differs", () => {
    const deps = makeDeps();
    deps.slotsRef.current.set("s1", {
      ...EMPTY_SLOT,
      messages: [
        {
          role: "agent-step",
          stepIndex: 0,
          tool: "click",
          args: { selector: "#a" },
          resolvedElement: undefined,
          status: "ok",
          observation: "clicked",
        },
      ],
    });
    const { handleMessage } = createPortHandlers(deps);
    handleMessage({
      type: "agent-step",
      sessionId: "s1",
      stepIndex: 1,
      tool: "type",
      args: { text: "hi" },
      status: "pending",
    } as PortMessageToPanel);
    expect(deps.slotsRef.current.get("s1")!.messages).toHaveLength(2);
  });
});
