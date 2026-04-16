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

      {/* Resolved element */}
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

      {/* Args */}
      <div className="mb-3">
        <div className="mb-0.5 text-xs text-neutral-500">args:</div>
        <pre className="overflow-x-auto rounded bg-neutral-950 p-1.5 font-mono text-xs text-neutral-300">
          {JSON.stringify(args, null, 2)}
        </pre>
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
