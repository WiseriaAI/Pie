/**
 * Build-time invariant — RecordingSession **never** appears in chrome.storage write
 * payload typeable union.
 *
 * Enforced via grep over the recording module + orchestrator. Both grep regexes
 * REQUIRE the literal `(` after `set` so JSDoc/comments mentioning "chrome.storage
 * .local.set" without a function call don't false-positive (Unit 5 review I-1).
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, files);
    else if (
      (entry.endsWith(".ts") || entry.endsWith(".tsx")) &&
      !entry.endsWith(".test.ts") &&
      !entry.endsWith(".test.tsx")
    )
      files.push(full);
  }
  return files;
}

describe("recording storage invariant", () => {
  it("RecordingSession is not used as chrome.storage.local.set argument anywhere", () => {
    const root = join(__dirname, "..", "..", "..");
    const srcFiles = walk(join(root, "src"));
    const offenders: string[] = [];
    for (const file of srcFiles) {
      const text = readFileSync(file, "utf8");
      // Require open-paren after set so comments don't false-match.
      // Match `chrome.storage.local.set(` followed by anything containing
      // "RecordingSession" up to the next `)`.
      if (/chrome\.storage\.local\.set\s*\([^)]*RecordingSession/.test(text)) {
        offenders.push(file);
      }
    }
    expect(
      offenders,
      `RecordingSession leaked into chrome.storage.local.set in: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("recording-orchestrator.ts does not call chrome.storage.local.set directly", () => {
    // The orchestrator should write skills only via saveSkill (which writes
    // SkillDefinition), never call chrome.storage.local.set directly.
    // Require `(` after `set` so JSDoc mentioning the phrase doesn't false-match.
    const orchPath = join(__dirname, "..", "..", "background", "recording-orchestrator.ts");
    const text = readFileSync(orchPath, "utf8");
    expect(/chrome\.storage\.local\.set\s*\(/.test(text)).toBe(false);
  });
});
