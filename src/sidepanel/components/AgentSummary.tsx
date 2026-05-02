import MarkdownContent from "./Markdown";

interface AgentSummaryProps {
  success: boolean;
  summary: string;
  stepCount: number;
}

export default function AgentSummary({
  success,
  summary,
  stepCount,
}: AgentSummaryProps) {
  return (
    <div className="flex flex-col gap-2.5 pt-2">
      <div className="flex items-center gap-2">
        <div
          className={`h-1 w-1 rounded-full ${
            success ? "bg-accent" : "bg-warning"
          }`}
        />
        <span
          className={`caps ${success ? "text-fg-2" : "text-warning"}`}
        >
          {success ? `DONE · ${stepCount} STEPS` : `FAILED AT STEP ${stepCount}`}
        </span>
      </div>
      <div className="text-[13px] leading-5 text-fg-1">
        <MarkdownContent content={summary} />
      </div>
    </div>
  );
}
