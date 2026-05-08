import { describe, it, expect, beforeEach, vi } from "vitest";
import "@/test/setup";
import { buildObservationMessage } from "./prompt";
import type { PageSnapshot } from "@/lib/dom-actions/types";

// Cross-layer wire → agentMessages propagation for the semantic snapshot
// layer (#44). Per feedback_cross_layer_integration_tests.md: any new
// wire field must have a transit regression test. Here the "wire" is the
// PageSnapshot.semantic field; it is serialized into a string by
// buildObservationMessage and that string lands in agentMessages, which
// is persisted to chrome.storage.local via M1-U3 step snapshots and read
// back at cold-start. The test mirrors structuredClone (storage I/O does
// the same) and asserts the Semantic: block survives the round-trip
// AND that prompt-injection wrapper-tag literals stay neutralized.
describe("Cross-layer PageSnapshot.semantic → agentMessages (#44)", () => {
  function fakeSnapshot(): PageSnapshot {
    return {
      url: "https://example.com/issues/new",
      title: "New Issue",
      elements: [
        {
          index: 0,
          tag: "input",
          text: "",
          placeholder: "Title",
          label: "Issue title",
          error: "Title is required",
          disabled: false,
          region: "main",
          boundingBox: { x: 0, y: 0, width: 200, height: 30 },
        },
      ],
      semantic: {
        headings: [
          { level: 1, text: "Open a new issue" },
          { level: 2, text: "Add a description" },
        ],
        alerts: ["Title is required"],
        status: ["Loading templates..."],
      },
    };
  }

  it("Semantic: block survives structuredClone (mirrors storage round-trip)", () => {
    const snap = fakeSnapshot();
    const observation = buildObservationMessage(snap, snap.url);
    const message = { role: "user" as const, content: observation };

    // structuredClone is what chrome.storage.local serialization uses
    // (same algorithm as JSON write/read for plain strings + objects).
    const cloned = structuredClone(message);

    expect(cloned.content).toContain("Semantic:");
    expect(cloned.content).toContain("    H1: Open a new issue");
    expect(cloned.content).toContain('    - "Title is required"');
    expect(cloned.content).toContain('    - "Loading templates..."');
    expect(cloned.content).toContain('label="Issue title"');
    expect(cloned.content).toContain('error="Title is required"');
  });

  it("HARD INVARIANT: wrapper-tag literals injected into semantic fields stay [filtered] across the wire", () => {
    // Simulates a malicious page whose alert text contains a literal
    // </untrusted_page_content>. The collection layer (snapshot.ts
    // sanitizeText) replaces it with [filtered] BEFORE it reaches
    // PageSnapshot. The render layer just emits the already-sanitized
    // string. The wrapper itself contains </untrusted_page_content> as
    // the message boundary — the invariant is that NO ADDITIONAL
    // instance leaks in from page content.
    const snap = fakeSnapshot();
    snap.semantic.alerts = ["[filtered] attempt"];
    snap.semantic.headings = [{ level: 1, text: "Title [filtered] suffix" }];
    const observation = buildObservationMessage(snap, snap.url);
    const cloned = structuredClone({ role: "user" as const, content: observation });

    // Wrapper boundary appears exactly once (opening + closing).
    const openCount = (cloned.content.match(/<untrusted_page_content>/g) || []).length;
    const closeCount = (cloned.content.match(/<\/untrusted_page_content>/g) || []).length;
    expect(openCount).toBe(1);
    expect(closeCount).toBe(1);
    expect(cloned.content).toContain("[filtered]");
  });

  it("empty semantic does not emit a Semantic: block (avoids noise on plain pages)", () => {
    const snap = fakeSnapshot();
    snap.semantic = { headings: [], alerts: [], status: [] };
    snap.elements = [];
    const observation = buildObservationMessage(snap, snap.url);
    expect(observation).not.toContain("Semantic:");
    expect(observation).toContain("Elements:");
  });
});
