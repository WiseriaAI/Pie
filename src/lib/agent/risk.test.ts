import { describe, it, expect } from "vitest";
import { classifyRisk } from "./risk";
import type { PageSnapshot } from "@/lib/dom-actions/types";

const emptySnapshot: PageSnapshot = { url: "https://example.com", title: "", elements: [] };

describe("Phase 5 — screenshot risk", () => {
  it("capture_visible_tab is always high (R5)", () => {
    const r = classifyRisk("capture_visible_tab", {}, emptySnapshot);
    expect(r.level).toBe("high");
    expect(r.reason).toMatch(/screenshot/i);
  });
  it("capture_fullpage_tab is always high (R6)", () => {
    const r = classifyRisk("capture_fullpage_tab", {}, emptySnapshot);
    expect(r.level).toBe("high");
    expect(r.reason).toMatch(/screenshot/i);
  });
});
