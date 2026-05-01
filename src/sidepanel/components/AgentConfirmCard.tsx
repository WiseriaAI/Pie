import type { ResolvedElement } from "@/types";

interface AgentConfirmCardProps {
  tool: string;
  args: unknown;
  resolvedElement: ResolvedElement;
  riskReason: string;
  resolved?: "approved" | "rejected";
  onApprove: () => void;
  onReject: () => void;
}

/**
 * Redact sensitive values before display. The risk classifier already flagged
 * this as high-risk because the target is a sensitive field (password/CC/OTP).
 * Showing the plaintext value in the confirm card would defeat the redaction
 * that type.ts already applies to the tool_result observation.
 */
function redactArgsForDisplay(tool: string, args: unknown, riskReason: string): unknown {
  if (tool !== "type") return args;
  if (!riskReason.toLowerCase().includes("sensitive")) return args;
  if (!args || typeof args !== "object") return args;
  const redacted: Record<string, unknown> = { ...(args as Record<string, unknown>) };
  if ("text" in redacted) redacted.text = "[redacted]";
  return redacted;
}

function safeStringifyArgs(args: unknown): string {
  try {
    const s = JSON.stringify(args, null, 2) ?? "null";
    return s.length > 2000 ? s.slice(0, 2000) + "\n... (truncated)" : s;
  } catch {
    return "(non-serializable)";
  }
}

/** Phase 2.6 — meta tool detection (P0-D). For create_skill / update_skill the
 *  args object IS the trust-decision artifact, so the 2000-char cap and the
 *  generic args block must be bypassed in favor of full-content per-field
 *  rendering. */
function isSkillMetaTool(tool: string): boolean {
  return tool === "create_skill" || tool === "update_skill";
}

function safeStringifyForPanel(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "null";
  } catch {
    return "(non-serializable)";
  }
}

/**
 * Render the full skill content under review for a create_skill / update_skill
 * confirm card. NO 2000-char cap — the user must see everything they're
 * approving (P0-D). Each field gets a dedicated scrollable panel with
 * max-h to keep the card from blowing up the side panel.
 */
function SkillContentDetails({ tool, args }: { tool: string; args: unknown }) {
  const a = (args && typeof args === "object" ? (args as Record<string, unknown>) : {}) as Record<string, unknown>;
  const isUpdate = tool === "update_skill";
  const source = isUpdate
    ? ((a.patch && typeof a.patch === "object" ? (a.patch as Record<string, unknown>) : {}) as Record<string, unknown>)
    : a;

  const id = isUpdate && typeof a.id === "string" ? a.id : undefined;
  const name = typeof source.name === "string" ? source.name : undefined;
  const description = typeof source.description === "string" ? source.description : undefined;
  const promptTemplate = typeof source.promptTemplate === "string" ? source.promptTemplate : undefined;
  const parameters = source.parameters;
  const allowedTools = Array.isArray(source.allowedTools)
    ? (source.allowedTools as unknown[]).map((t) => String(t))
    : undefined;

  return (
    <div className="space-y-2.5">
      {isUpdate && (
        <div className="rounded bg-amber-950/40 border border-amber-700/60 px-2 py-1 text-xs text-amber-300">
          Updating an existing skill. After approval the skill is re-marked as agent-authored, and the user will be asked to re-confirm on its next execution.
        </div>
      )}
      {id !== undefined && (
        <div>
          <div className="text-xs text-neutral-500">id:</div>
          <code className="font-mono text-xs text-neutral-300 break-all">{id}</code>
        </div>
      )}
      {name !== undefined && (
        <div>
          <div className="text-xs text-neutral-500">name:</div>
          <div className="text-neutral-200">{name}</div>
        </div>
      )}
      {description !== undefined && (
        <div>
          <div className="text-xs text-neutral-500">description:</div>
          <div className="text-neutral-300 whitespace-pre-wrap break-words">{description}</div>
        </div>
      )}
      {promptTemplate !== undefined && (
        <div>
          <div className="text-xs text-neutral-500">promptTemplate ({promptTemplate.length} chars):</div>
          <pre className="max-h-64 overflow-auto rounded bg-neutral-950 p-2 font-mono text-xs text-neutral-300 whitespace-pre-wrap break-words">
            {promptTemplate}
          </pre>
        </div>
      )}
      {parameters !== undefined && (
        <div>
          <div className="text-xs text-neutral-500">parameters (JSON Schema):</div>
          <pre className="max-h-48 overflow-auto rounded bg-neutral-950 p-2 font-mono text-xs text-neutral-300">
            {safeStringifyForPanel(parameters)}
          </pre>
        </div>
      )}
      {allowedTools !== undefined && (
        <div>
          <div className="text-xs text-neutral-500">allowedTools:</div>
          {allowedTools.length === 0 ? (
            <div className="text-xs italic text-neutral-500">(empty — only done / fail callable inside this skill's scope)</div>
          ) : (
            <div className="mt-1 flex flex-wrap gap-1">
              {allowedTools.map((t, i) => (
                <code
                  key={i}
                  className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-xs text-neutral-300"
                >
                  {t}
                </code>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AgentConfirmCard({
  tool,
  args,
  resolvedElement,
  riskReason,
  resolved,
  onApprove,
  onReject,
}: AgentConfirmCardProps) {
  function handleKeyDown(e: React.KeyboardEvent) {
    // Prevent Enter from accidentally triggering Approve
    if (e.key === "Enter") {
      e.preventDefault();
    }
  }

  const isMeta = isSkillMetaTool(tool);

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="rounded bg-red-950/30 border border-red-800 p-3 text-sm"
      onKeyDown={handleKeyDown}
    >
      {/* Heading */}
      <div className="mb-2 font-semibold text-red-400">
        [!] Confirm action
      </div>

      {/* Risk reason */}
      <div className="mb-2 text-xs text-red-300">{riskReason}</div>

      {/* Tool name */}
      <div className="mb-2">
        <span className="text-neutral-400 text-xs">Tool: </span>
        <code className="font-mono text-neutral-200">{tool}</code>
      </div>

      {/* Resolved element — only for DOM-targeted tools (skip for meta tools whose
          resolvedElement is a placeholder { text: "", tag: "" } or { text: skill.name, tag: "skill" }) */}
      {!isMeta && (
        <div className="mb-2 space-y-0.5 text-xs">
          <div>
            <span className="text-neutral-500">tag: </span>
            <code className="font-mono text-neutral-300">
              {"<"}
              {resolvedElement.tag}
              {">"}
            </code>
          </div>
          {resolvedElement.text && (
            <div>
              <span className="text-neutral-500">text: </span>
              <span className="text-neutral-300">{resolvedElement.text}</span>
            </div>
          )}
          {resolvedElement.ariaLabel && (
            <div>
              <span className="text-neutral-500">aria-label: </span>
              <span className="text-neutral-300">{resolvedElement.ariaLabel}</span>
            </div>
          )}
          {resolvedElement.type && (
            <div>
              <span className="text-neutral-500">type: </span>
              <span className="text-neutral-300">{resolvedElement.type}</span>
            </div>
          )}
          {resolvedElement.href && (
            <div>
              <span className="text-neutral-500">href: </span>
              <span className="text-neutral-300 break-all">{resolvedElement.href}</span>
            </div>
          )}
        </div>
      )}

      {/* Args — meta tools render full skill content per-field (P0-D no cap);
          everything else uses the generic 2000-char-capped JSON pretty-print. */}
      <div className="mb-3">
        {isMeta ? (
          <SkillContentDetails tool={tool} args={args} />
        ) : (
          <>
            <div className="mb-0.5 text-xs text-neutral-500">args:</div>
            <pre className="overflow-x-auto rounded bg-neutral-950 p-1.5 font-mono text-xs text-neutral-300">
              {safeStringifyArgs(redactArgsForDisplay(tool, args, riskReason))}
            </pre>
          </>
        )}
      </div>

      {/* Action buttons or resolved status */}
      {resolved ? (
        <div
          className={`text-xs font-mono ${
            resolved === "approved" ? "text-green-400" : "text-neutral-400"
          }`}
        >
          {resolved === "approved" ? "Approved" : "Rejected"}
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={onReject}
            autoFocus
            className="rounded bg-neutral-700 px-3 py-1.5 text-xs text-neutral-100 hover:bg-neutral-600 focus:outline focus:outline-2 focus:outline-neutral-500"
          >
            Reject
          </button>
          <button
            onClick={onApprove}
            className="rounded bg-red-700 px-3 py-1.5 text-xs text-white hover:bg-red-600 focus:outline focus:outline-2 focus:outline-red-500"
          >
            Approve
          </button>
        </div>
      )}
    </div>
  );
}
