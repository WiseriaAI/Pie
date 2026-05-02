/**
 * Shared title-derivation helper used by both the panel side (useSession)
 * and the SW side (background/index.ts) to compute the fallback title from
 * the first user message.
 *
 * Typed as Array<{role: string; content: string}> rather than the panel's
 * DisplayMessage[] or the SW's ChatMessage[] so both call sites compile
 * without importing each other's types.
 *
 * M2-U3: This helper is the "expected fallback" sentinel used by the
 * race-guard in maybeUpgradeFallbackTitle — if title still equals this
 * string, the LLM-generated title can overwrite it.
 */

export type TitleableMessage = { role: string; content: string };

/**
 * Derives a fallback title from the first user message in msgs.
 * Returns undefined when no user message with non-empty content is found.
 * Max 40 chars + ellipsis.
 */
export function deriveTitleFromMessages(
  msgs: TitleableMessage[],
): string | undefined {
  for (const m of msgs) {
    if (m.role !== "user") continue;
    const collapsed = m.content.trim().replace(/\s+/g, " ");
    if (collapsed.length === 0) continue;
    if (collapsed.length <= 40) return collapsed;
    return collapsed.slice(0, 40).trimEnd() + "…";
  }
  return undefined;
}
