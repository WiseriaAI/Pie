import { describe, expect, it } from "vitest";
import {
  EMPTY_SLOT,
  deriveActiveView,
  withSlot,
  type SessionRuntimeSlot,
} from "./runtime-map";

describe("runtime-map", () => {
  describe("EMPTY_SLOT", () => {
    it("matches the documented default state", () => {
      expect(EMPTY_SLOT).toEqual({
        streaming: false,
        streamingText: "",
        error: null,
        toast: null,
        messages: [],
        accumulated: "",
        streamFinished: true,
      });
    });
  });

  describe("withSlot", () => {
    it("creates a new slot from EMPTY_SLOT when id is unknown", () => {
      const out = withSlot(new Map(), "s1", { streaming: true });
      expect(out.get("s1")).toEqual({ ...EMPTY_SLOT, streaming: true });
    });

    it("merges patch object into existing slot", () => {
      const prev = new Map<string, SessionRuntimeSlot>([
        ["s1", { ...EMPTY_SLOT, streaming: true, accumulated: "abc" }],
      ]);
      const out = withSlot(prev, "s1", { streamingText: "hi" });
      expect(out.get("s1")).toEqual({
        ...EMPTY_SLOT,
        streaming: true,
        accumulated: "abc",
        streamingText: "hi",
      });
    });

    it("supports a function patch that reads previous slot", () => {
      const prev = new Map<string, SessionRuntimeSlot>([
        ["s1", { ...EMPTY_SLOT, accumulated: "ab" }],
      ]);
      const out = withSlot(prev, "s1", (s) => ({ accumulated: s.accumulated + "c" }));
      expect(out.get("s1")?.accumulated).toBe("abc");
    });

    it("returns a new Map (immutability)", () => {
      const prev = new Map<string, SessionRuntimeSlot>();
      const out = withSlot(prev, "s1", { streaming: true });
      expect(out).not.toBe(prev);
      expect(prev.size).toBe(0);
    });

    it("does not mutate the previous slot object", () => {
      const original: SessionRuntimeSlot = { ...EMPTY_SLOT, streaming: true };
      const prev = new Map<string, SessionRuntimeSlot>([["s1", original]]);
      withSlot(prev, "s1", { streamingText: "x" });
      expect(original.streamingText).toBe("");
    });
  });

  describe("deriveActiveView", () => {
    it("returns EMPTY_SLOT when activeId is null", () => {
      expect(deriveActiveView(new Map(), null)).toEqual(EMPTY_SLOT);
    });

    it("returns EMPTY_SLOT when slot is missing for activeId", () => {
      expect(deriveActiveView(new Map(), "missing")).toEqual(EMPTY_SLOT);
    });

    it("returns the slot for activeId when present", () => {
      const slot: SessionRuntimeSlot = { ...EMPTY_SLOT, streaming: true };
      const map = new Map([["s1", slot]]);
      expect(deriveActiveView(map, "s1")).toBe(slot);
    });
  });
});
