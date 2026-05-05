import type { RecordedAction } from "@/lib/recording/types";

interface RecordingModeProps {
  active: boolean;
  actions: RecordedAction[];
  lastAbortReason:
    | "sw-restart"
    | "session-switched"
    | "panel-disconnect"
    | "tab-closed"
    | "csp-blocked"
    | "user-discard"
    | null;
  onFinish: () => void;
  onDiscard: () => void;
}

export default function RecordingMode({
  active,
  actions,
  lastAbortReason,
  onFinish,
  onDiscard,
}: RecordingModeProps) {
  if (!active && lastAbortReason) {
    return (
      <div style={{ padding: 12 }}>
        <h3>Recording aborted</h3>
        <p>Reason: {lastAbortReason}. Please start a new recording.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <strong>● Recording…</strong>
        <div>
          <button type="button" onClick={onFinish} disabled={actions.length === 0}>
            Finish
          </button>
          <button type="button" onClick={onDiscard} style={{ marginLeft: 8 }}>
            Discard
          </button>
        </div>
      </div>
      <ol style={{ marginTop: 12 }}>
        {actions.map((action, idx) => (
          <li key={idx}>
            第 {idx + 1} 步：{action.type} — {action.label}
            {action.unstable && <span style={{ color: "orange", marginLeft: 4 }}>[unstable]</span>}
            {action.redacted && <span style={{ color: "gray", marginLeft: 4 }}>(redacted)</span>}
          </li>
        ))}
        {actions.length === 0 && <li style={{ color: "#888" }}>(operate the page; events appear here)</li>}
      </ol>
    </div>
  );
}
