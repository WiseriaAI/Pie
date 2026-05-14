import { useState } from "react";
import type { Quote } from "@/types";

const TEXT_LABEL_MAX = 28;

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "…";
}

type Props = {
  quote: Quote;
  onRemove: (id: string) => void;
};

export function QuoteChip({ quote, onRemove }: Props) {
  const [hovered, setHovered] = useState(false);

  const isText = quote.kind === "text";
  const borderClass = isText ? "border-info-line" : "border-ok-line";
  const bgClass = isText ? "bg-info-tint" : "bg-ok-tint";
  const icon = isText ? "\"" : "⊞";

  const label = isText
    ? truncate(quote.text, TEXT_LABEL_MAX)
    : `${quote.role} · "${truncate(quote.accessibleName, TEXT_LABEL_MAX)}"`;

  return (
    <span
      className={`${bgClass} flex items-center gap-1.5 rounded-full border ${borderClass} px-2 py-0.5 text-[11px] text-fg-1`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: "relative" }}
    >
      <span className="text-fg-3 text-[10px]">{icon}</span>
      <span className="max-w-[180px] truncate">{label}</span>
      <button
        type="button"
        aria-label="移除引用"
        onClick={() => onRemove(quote.id)}
        className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-line bg-canvas text-fg-2 hover:border-fg-3 hover:text-fg-1 text-[10px]"
      >
        ×
      </button>
      {hovered && (
        <div
          role="tooltip"
          className="absolute bottom-full left-0 mb-1.5 z-50 rounded-md border border-line bg-canvas p-2 text-[11px] text-fg-1 shadow max-w-[320px]"
          style={{ whiteSpace: "normal" }}
        >
          {isText ? (
            <>
              <div className="max-h-[120px] overflow-auto whitespace-pre-wrap break-words">{quote.text}</div>
              <div className="mt-1 text-fg-3 text-[10px] truncate">{quote.sourceUrl}</div>
            </>
          ) : (
            <>
              {quote.imageDataUrl ? (
                <img src={quote.imageDataUrl} alt="" style={{ maxWidth: 200, maxHeight: 120 }} className="rounded" />
              ) : (
                <div className="text-fg-3 italic">[截图不可用]</div>
              )}
              <div className="mt-1 text-fg-2">role: {quote.role}</div>
              <div className="text-fg-2">name: {quote.accessibleName}</div>
              <div className="max-h-[80px] overflow-auto whitespace-pre-wrap break-words text-fg-2">
                {quote.textContent}
              </div>
              <div className="mt-1 text-fg-3 text-[10px] truncate">{quote.sourceUrl}</div>
            </>
          )}
        </div>
      )}
    </span>
  );
}
