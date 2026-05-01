// Pure name registry. Exported separately from BUILT_IN_TOOLS (which has
// handlers + chrome.* dependencies) so UI / sidepanel can validate
// allowedTools without pulling the agent runtime into the panel bundle.
//
// IMPORTANT: keep in sync when adding tools.
//   - KNOWN_BUILT_IN_TOOL_NAMES ↔ BUILT_IN_TOOLS (src/lib/agent/tools.ts)
//   - KNOWN_KEYBOARD_TOOL_NAMES ↔ KEYBOARD_TOOL_NAMES (src/lib/agent/tools/keyboard.ts)

export const KNOWN_BUILT_IN_TOOL_NAMES = [
  // Phase 2 originals
  "click",
  "type",
  "scroll",
  "select",
  "wait",
  "done",
  "fail",
  // Phase 2.6 skill meta tools
  "create_skill",
  "update_skill",
  "delete_skill",
  "list_skills",
] as const;

export const KNOWN_KEYBOARD_TOOL_NAMES = [
  "dispatch_keyboard_input",
  "press_key",
] as const;

/**
 * Set of every tool name that is allowed to appear in a skill's
 * `allowedTools` whitelist (P1-G validation). Excludes skill-resolved
 * tool names (R3 forbids skills calling other skills); those are checked
 * separately at write time.
 */
export const ALL_KNOWN_NON_SKILL_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
  ...KNOWN_BUILT_IN_TOOL_NAMES,
  ...KNOWN_KEYBOARD_TOOL_NAMES,
]);
