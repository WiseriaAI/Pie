/**
 * Tests for untrusted-wrappers.ts.
 *
 * Includes:
 *  1. Functional tests for escapeUntrustedWrappers
 *  2. Scenario 8 (dual-list lock-step): every tag in UNTRUSTED_WRAPPER_TAGS
 *     must also appear in snapshot.ts inline replace() chain.
 *     This is a build-time coherence check enforced as a vitest assertion.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";
import { escapeUntrustedWrappers, UNTRUSTED_WRAPPER_TAGS } from "./untrusted-wrappers";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// --- Dual-list lock-step assertion (Scenario 8 / Integration) ---
describe("dual-list lock-step: UNTRUSTED_WRAPPER_TAGS ↔ snapshot.ts sanitizeText", () => {
  it("every tag in UNTRUSTED_WRAPPER_TAGS must appear in snapshot.ts inline replace() chain", () => {
    const snapshotPath = path.resolve(
      __dirname,
      "../../lib/dom-actions/snapshot.ts",
    );
    const snapshotSource = fs.readFileSync(snapshotPath, "utf-8");

    for (const tag of UNTRUSTED_WRAPPER_TAGS) {
      // Each tag must appear in the sanitizeText chain as:
      //   .replace(/<\/?TAG>/gi, "[filtered]")
      // Use string.includes to match the exact literal (regex escaping of backslash
      // in RegExp constructor is error-prone; includes is unambiguous here).
      const needle = `replace(/<\\/?${tag}>/gi, "[filtered]")`;
      expect(
        snapshotSource.includes(needle),
        `snapshot.ts is missing .replace(/<\\/?${tag}>/gi, "[filtered]") — dual-list lock-step broken`,
      ).toBe(true);
    }
  });
});

// --- Functional tests for escapeUntrustedWrappers ---
describe("escapeUntrustedWrappers", () => {
  it("escapes ASCII closing tag for all known wrapper tags", () => {
    for (const tag of UNTRUSTED_WRAPPER_TAGS) {
      const input = `before</${tag}>after`;
      const result = escapeUntrustedWrappers(input);
      expect(result).not.toContain(`</${tag}>`);
      expect(result).toContain("&lt;");
    }
  });

  it("escapes opening tag", () => {
    const result = escapeUntrustedWrappers("<untrusted_page_content>");
    expect(result).not.toContain("<untrusted_page_content>");
    expect(result).toContain("&lt;");
  });

  it("returns empty string for empty input", () => {
    expect(escapeUntrustedWrappers("")).toBe("");
  });

  it("passes through text without wrapper tags unchanged", () => {
    const text = "normal text without any wrapper tags";
    expect(escapeUntrustedWrappers(text)).toBe(text);
  });

  it("strips zero-width characters", () => {
    // U+200B zero-width space injected inside tag literal
    const input = "<un​trusted_page_content>";
    // After ZW stripping → "<untrusted_page_content>" → gets escaped
    const result = escapeUntrustedWrappers(input);
    // Should not still contain raw zero-width chars inside a tag
    expect(result).not.toContain("​");
  });
});
