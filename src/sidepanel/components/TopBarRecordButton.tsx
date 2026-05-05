interface TopBarRecordButtonProps {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}

export default function TopBarRecordButton({ active, disabled, onClick }: TopBarRecordButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={active ? "Recording in progress" : "Start recording"}
      aria-label={active ? "Recording" : "Record"}
      style={{
        background: active ? "var(--c-pending, #f0f)" : "transparent",
        border: "1px solid var(--c-line, #ccc)",
        color: active ? "white" : "inherit",
        cursor: disabled ? "not-allowed" : "pointer",
        padding: "4px 8px",
        borderRadius: 4,
      }}
    >
      ● {active ? "Rec" : "Record"}
    </button>
  );
}
