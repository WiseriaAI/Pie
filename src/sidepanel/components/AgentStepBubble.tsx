import type { ResolvedElement } from "@/types";

interface AgentStepBubbleProps {
  stepIndex: number;
  tool: string;
  args: unknown;
  resolvedElement?: ResolvedElement;
  status: "pending" | "ok" | "error";
  observation?: string;
}

export default function AgentStepBubble({
  stepIndex,
  tool,
  args,
  resolvedElement,
  status,
  observation,
}: AgentStepBubbleProps) {
  const containerBorder =
    status === "pending"
      ? "border-accent-line"
      : status === "error"
        ? "border-warning-line"
        : "border-line";

  return (
    <div className={`flex flex-col gap-2.5 rounded-lg border bg-surface p-3.5 ${containerBorder}`}>
      <div className="flex items-center gap-2.5">
        <StatusIcon status={status} />
        <span className="font-mono text-[11px] tabular text-fg-3">
          {String(stepIndex).padStart(2, "0")}
        </span>
        <code className="font-mono text-[12px] text-fg-1">{tool}</code>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.08em]">
          <StatusLabel status={status} />
        </span>
      </div>

      {resolvedElement && (
        <div className="font-mono text-[11px] leading-4 text-fg-2">
          &lt;{resolvedElement.tag}&gt;{" "}
          {resolvedElement.text && (
            <span className="text-fg-3">
              "
              {resolvedElement.text.length > 60
                ? resolvedElement.text.slice(0, 57) + "..."
                : resolvedElement.text}
              "
            </span>
          )}
        </div>
      )}

      <details className="group">
        <summary className="flex cursor-pointer select-none items-center gap-1 font-mono text-[11px] text-fg-3 hover:text-fg-2">
          <span className="transition-transform group-open:rotate-90">›</span>
          <span>ARGS</span>
        </summary>
        <pre className="mt-2 overflow-x-auto rounded border border-line bg-field p-2 font-mono text-[11px] leading-4 text-fg-2">
          {safeStringify(args)}
        </pre>
      </details>

      {observation && (
        <div className="border-t border-line pt-2 text-[12px] leading-[18px] text-fg-2">
          {observation}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: "pending" | "ok" | "error" }) {
  if (status === "pending") {
    return (
      <div className="relative flex h-4 w-4 items-center justify-center">
        <div className="absolute inset-0 rounded-full border border-accent-line" />
        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="flex h-4 w-4 items-center justify-center">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 3L9 9M9 3L3 9" stroke="var(--c-warning)" strokeWidth="1.25" strokeLinecap="round" />
        </svg>
      </div>
    );
  }
  return (
    <div className="flex h-4 w-4 items-center justify-center">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path
          d="M2.5 6L5 8.5L9.5 4"
          stroke="var(--c-fg-2)"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function StatusLabel({ status }: { status: "pending" | "ok" | "error" }) {
  if (status === "pending") return <span className="text-accent">RUNNING</span>;
  if (status === "error") return <span className="text-warning">ERROR</span>;
  return <span className="text-fg-2">OK</span>;
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return "(non-serializable)";
  }
}
