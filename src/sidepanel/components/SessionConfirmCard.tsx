import type { PinnedTabDriftPayload } from "@/types";

/**
 * M1-U5 — session-level confirm card for the R11 drift gate.
 *
 * Renders a single 'Discard task' button — the only safe action when
 * the pinned tab is gone or has navigated to a different origin.
 * Plan K-5 / R11: informed-approval, not silent abort. Two reason
 * variants distinguish "tab closed" vs "origin changed" so the user
 * understands what happened, but the affordance is identical.
 */

interface Props {
  kind: "pinned-tab-drift" | "paused-resume";
  payload: unknown;
  resolved?: "discarded";
  onDiscard: () => void;
}

export default function SessionConfirmCard({
  kind,
  payload,
  resolved,
  onDiscard,
}: Props) {
  if (kind === "pinned-tab-drift") {
    return (
      <DriftCard
        payload={payload as PinnedTabDriftPayload}
        resolved={resolved}
        onDiscard={onDiscard}
      />
    );
  }
  // paused-resume kind reserved for future use; render a minimal
  // fallback so an SW emit doesn't crash the panel.
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3 text-[13px] text-fg-2">
      Session paused — please reopen the side panel to continue.
    </div>
  );
}

function DriftCard({
  payload,
  resolved,
  onDiscard,
}: {
  payload: PinnedTabDriftPayload;
  resolved?: "discarded";
  onDiscard: () => void;
}) {
  const isDiscarded = resolved === "discarded";
  const reasonHeadline =
    payload.reason === "tab-closed"
      ? "PINNED TAB CLOSED"
      : "PAGE NAVIGATED AWAY";

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-warning-line bg-warning-tint px-4 py-3.5 text-[13px]"
      role="dialog"
      aria-labelledby="session-drift-title"
    >
      <div className="flex flex-col gap-1.5">
        <span className="caps text-warning" id="session-drift-title">
          {reasonHeadline}
        </span>
        <p className="leading-5 text-fg-1">
          The agent was working on your task when the side panel went idle.
          The tab it was using has{" "}
          {payload.reason === "tab-closed"
            ? "been closed."
            : "navigated to a different site."}{" "}
          Resume isn't safe — the page is no longer the one you approved.
        </p>
      </div>

      <dl className="flex flex-col gap-1 font-mono text-[11px] text-fg-2">
        <Row label="ORIGINAL GOAL" value={payload.originalTask || "(empty)"} />
        <Row
          label="LAST PINNED TAB"
          value={payload.lastPinnedTabTitle || "(no title)"}
        />
        <Row label="PINNED ORIGIN" value={payload.pinnedOrigin} />
        {payload.reason === "origin-changed" && payload.currentOrigin && (
          <Row label="NOW SHOWS" value={payload.currentOrigin} />
        )}
        <Row
          label="STEPS COMPLETED"
          value={String(payload.lastStepIndex)}
        />
      </dl>

      <button
        onClick={onDiscard}
        disabled={isDiscarded}
        className="self-start rounded border border-warning-line bg-transparent px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-warning hover:bg-warning-tint disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Discard the paused task"
      >
        {isDiscarded ? "DISCARDED" : "DISCARD TASK"}
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-[140px] flex-shrink-0 text-fg-3">{label}</dt>
      <dd className="flex-1 truncate text-fg-1">{value}</dd>
    </div>
  );
}
