import { useMemo, useState } from "react";
import type { RecordedAction } from "@/lib/recording/types";
import { serialize, PromptTooLargeError } from "@/lib/recording/serialize";

const PROMPT_TEMPLATE_MAX = 8 * 1024;

interface SaveSkillDialogProps {
  actions: RecordedAction[];
  onSave: (args: {
    skillName: string;
    skillDescription: string;
    finalActions: RecordedAction[];
    finalAllowedTools: string[];
  }) => void;
  onDiscard: () => void;
}

export default function SaveSkillDialog({ actions, onSave, onDiscard }: SaveSkillDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editedActions, setEditedActions] = useState<RecordedAction[]>(actions);

  const serialized = useMemo(() => {
    try {
      return { ok: true as const, ...serialize(editedActions) };
    } catch (e) {
      if (e instanceof PromptTooLargeError) {
        return { ok: false as const, error: `Prompt too long: ${e.actualBytes}/${e.maxBytes} bytes`, bytes: e.actualBytes };
      }
      throw e;
    }
  }, [editedActions]);

  const inferredAllowedTools = serialized.ok ? serialized.allowedTools : ["done", "fail"];
  const [excludedTools, setExcludedTools] = useState<Set<string>>(new Set());
  const finalAllowedTools = inferredAllowedTools.filter((t) => !excludedTools.has(t));

  const promptBytes = serialized.ok ? serialized.promptTemplate.length : (serialized.bytes ?? 0);
  const overLimit = promptBytes > PROMPT_TEMPLATE_MAX;

  const canSave =
    name.trim().length > 0 &&
    description.trim().length > 0 &&
    !overLimit &&
    serialized.ok &&
    editedActions.length > 0;

  function handleDeleteStep(idx: number) {
    setEditedActions((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleToggleTool(tool: string) {
    if (tool === "done" || tool === "fail") return;
    setExcludedTools((prev) => {
      const next = new Set(prev);
      if (next.has(tool)) next.delete(tool);
      else next.add(tool);
      return next;
    });
  }

  function handleSave() {
    if (!canSave) return;
    onSave({
      skillName: name.trim(),
      skillDescription: description.trim(),
      finalActions: editedActions,
      finalAllowedTools,
    });
  }

  return (
    <div role="dialog" aria-label="Save Recorded Skill" style={{ padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>Save Recorded Skill</h2>

      <label>
        Skill Name
        <input
          data-testid="skill-name-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ display: "block", width: "100%", marginBottom: 8 }}
        />
      </label>
      <label>
        Description
        <textarea
          data-testid="skill-description-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ display: "block", width: "100%", marginBottom: 8 }}
        />
      </label>

      <h3>Steps ({editedActions.length})</h3>
      <ol>
        {editedActions.map((action, idx) => (
          <li key={idx} data-testid={`step-row-${idx}`}>
            <span>第 {idx + 1} 步：{action.type} — {action.label}</span>
            <button
              type="button"
              data-testid={`delete-step-${idx}`}
              onClick={() => handleDeleteStep(idx)}
              aria-label={`delete step ${idx + 1}`}
              style={{ marginLeft: 8 }}
            >
              ✕
            </button>
          </li>
        ))}
      </ol>

      <h3>Allowed Tools</h3>
      <div>
        {inferredAllowedTools.map((tool) => (
          <span
            key={tool}
            data-testid={`allowed-tool-chip-${tool}`}
            style={{
              display: "inline-block",
              padding: "2px 6px",
              margin: 2,
              border: "1px solid #888",
              opacity: excludedTools.has(tool) ? 0.4 : 1,
            }}
          >
            {tool}
            {tool !== "done" && tool !== "fail" && (
              <button
                type="button"
                data-testid={`remove-tool-${tool}`}
                onClick={() => handleToggleTool(tool)}
                aria-label={`toggle ${tool}`}
                style={{ marginLeft: 4 }}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>

      <h3>Parameters</h3>
      <ul>
        {serialized.ok &&
          Object.entries(serialized.parameters.properties).map(([k, v]) => (
            <li key={k} data-testid={`param-row-${k}`}>
              <code>{`{{${k}}}`}</code> — {v.type} — {v.description}
            </li>
          ))}
        {serialized.ok && Object.keys(serialized.parameters.properties).length === 0 && (
          <li>(no parameters — recording had no redacted fields)</li>
        )}
      </ul>

      <div
        data-testid="byte-counter"
        data-bytes={promptBytes}
        data-over-limit={String(overLimit)}
        style={{ marginTop: 8, color: overLimit ? "red" : undefined }}
      >
        Prompt size: {promptBytes} / {PROMPT_TEMPLATE_MAX} bytes
        {overLimit && " — over limit; trim some steps."}
      </div>
      {!serialized.ok && (
        <div style={{ color: "red" }}>{serialized.error}</div>
      )}

      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          data-testid="save-skill-button"
          onClick={handleSave}
          disabled={!canSave}
        >
          Save
        </button>
        <button
          type="button"
          data-testid="discard-recording-button"
          onClick={onDiscard}
          style={{ marginLeft: 8 }}
        >
          Discard
        </button>
      </div>
    </div>
  );
}
