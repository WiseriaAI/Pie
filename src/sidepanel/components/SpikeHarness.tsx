// PHASE-2.5-SPIKE: throwaway harness UI for validating CDP keyboard simulation
// + clipboard paste baseline. Remove this entire file after spike concludes.
// See docs/plans/2026-04-28-001-feat-phase2.5-cdp-keyboard-simulation-plan.md

import { useState } from "react";

interface SpikeResult {
  ok: boolean;
  notes: string[];
  error?: string;
  ranAt: string;
  method: string;
}

export default function SpikeHarness() {
  const [text, setText] = useState("hello from CDP spike");
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<SpikeResult[]>([]);

  async function run(method: string, payload: Record<string, unknown>) {
    setRunning(method);
    try {
      const response = await chrome.runtime.sendMessage({
        type: "spike-run",
        method,
        ...payload,
      });
      const result: SpikeResult = {
        ok: !!response?.ok,
        notes: response?.notes ?? [],
        error: response?.error,
        ranAt: new Date().toLocaleTimeString(),
        method,
      };
      setResults((prev) => [result, ...prev].slice(0, 10));
    } catch (e) {
      setResults((prev) =>
        [
          {
            ok: false,
            notes: [],
            error: e instanceof Error ? e.message : String(e),
            ranAt: new Date().toLocaleTimeString(),
            method,
          },
          ...prev,
        ].slice(0, 10),
      );
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-700 bg-amber-950/50 px-4 py-3 text-sm text-amber-300">
        <strong>Spike harness (throwaway):</strong> validates Phase 2.5 CDP +
        paste paths in the active tab. Open a target editor (飞书 Docs / Google
        Docs / Notion / contenteditable) and click into it BEFORE pressing a
        button. Yellow debug bar will appear during CDP runs.
      </div>

      <section className="space-y-2">
        <label className="block text-xs uppercase tracking-wide text-neutral-400">
          Text to insert / paste
        </label>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-neutral-500 focus:outline-none"
          placeholder="Text payload"
        />
      </section>

      <section className="space-y-2">
        <p className="text-xs text-neutral-400">
          Tap a button, then look at the editor in the active tab. Notes log
          appears below.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            disabled={running !== null}
            onClick={() => run("cdp-insert-text", { text })}
            className="rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {running === "cdp-insert-text" ? "Running…" : "CDP insertText"}
          </button>
          <button
            disabled={running !== null}
            onClick={() => run("cdp-press-enter", {})}
            className="rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {running === "cdp-press-enter" ? "Running…" : "CDP press Enter"}
          </button>
          <button
            disabled={running !== null}
            onClick={() => run("clipboard-paste", { text })}
            className="rounded bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {running === "clipboard-paste"
              ? "Running…"
              : "Clipboard + paste (baseline)"}
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-300">Recent runs</h3>
        {results.length === 0 && (
          <p className="text-sm text-neutral-500">No runs yet.</p>
        )}
        <ul className="space-y-2">
          {results.map((r, idx) => (
            <li
              key={idx}
              className={`rounded border px-3 py-2 text-xs ${
                r.ok
                  ? "border-emerald-800 bg-emerald-950/30"
                  : "border-rose-800 bg-rose-950/30"
              }`}
            >
              <div className="flex justify-between text-neutral-300">
                <span>
                  <strong>{r.method}</strong> · {r.ok ? "ok" : "fail"}
                </span>
                <span className="text-neutral-500">{r.ranAt}</span>
              </div>
              {r.error && (
                <div className="mt-1 text-rose-300">error: {r.error}</div>
              )}
              {r.notes.length > 0 && (
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-neutral-400">
                  {r.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
