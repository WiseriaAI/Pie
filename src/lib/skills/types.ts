export type SkillId = string;

export type SkillAuthor = "user" | "agent";

export interface SkillDefinition {
  id: SkillId;
  name: string;
  description: string;
  /** JSON Schema for the tool's parameters object */
  toolSchema: {
    parameters: Record<string, unknown>;
  };
  /**
   * Handlebars-style template: {{key}} is replaced with JSON.stringify(args[key]).
   * The rendered result is wrapped in <untrusted_skill_params> before being
   * returned as an observation, so the LLM sees it as untrusted injected context.
   */
  promptTemplate: string;
  /** Whether this skill is currently enabled. For built-in skills this is the
   *  default; user choice stored in enabled_skills array overrides. */
  enabled: boolean;
  /** true = shipped with extension, cannot be deleted */
  builtIn: boolean;
  /** Origin of this skill. 'user' = manually created via SkillsList;
   *  'agent' = created or last-modified via meta tools (taint propagation, P0-C).
   *  Optional for back-compat with pre-Phase-2.6 storage; defaults to 'user'
   *  when missing. */
  author?: SkillAuthor;
  /** ms timestamp of creation. Used for SkillsList sort and R10 confirm copy.
   *  Built-in skills use 0 (sorts to bottom). Optional for back-compat. */
  createdAt?: number;
  /** Whitelist of tool names callable inside this skill's scope. `null` = no
   *  scope restriction (legacy behavior). Meta tool write path requires a
   *  non-null array (P1-F); read path tolerates null for back-compat. */
  allowedTools?: string[] | null;
  /** ms timestamp of when the user approved the first execution of this skill
   *  after it was authored or last modified by an agent. R10 first-run-confirm
   *  is gated on this field being absent AND author === 'agent'. update_skill
   *  clears this field on every modification (taint propagation defense). */
  firstRunConfirmedAt?: number;
}
