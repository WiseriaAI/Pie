import { useState, useEffect } from "react";
import type { Provider, ModelMeta } from "@/lib/model-router";
import { getProviderMeta } from "@/lib/model-router";

interface Props {
  provider: Provider;
  value: string;
  customModels: string[];
  fetchedModels?: ModelMeta[];
  fetchedAt?: number;
  isFetching?: boolean;
  onChange: (modelId: string) => void;
  onAddCustom: (modelId: string) => void;
  onRemoveCustom?: (modelId: string) => void;
  onRefresh: () => void;
}

export default function ModelDropdown(props: Props) {
  const meta = getProviderMeta(props.provider);
  const registryModels = meta?.models ?? [];
  const fetched = props.fetchedModels ?? [];
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  // Lazy fetch on first open if registry empty and no fetched cache
  useEffect(() => {
    if (open && registryModels.length === 0 && fetched.length === 0 && !props.isFetching) {
      props.onRefresh();
    }
  }, [open, registryModels.length, fetched.length, props.isFetching]);

  // Combined sorted list
  const baseList: { id: string; meta?: ModelMeta; isCustom: boolean }[] = [
    ...registryModels.map((m) => ({ id: m.id, meta: m, isCustom: false })),
    ...fetched.map((m) => ({ id: m.id, meta: m, isCustom: false })),
    ...props.customModels.map((id) => ({ id, isCustom: true })),
  ];
  // Dedupe by id (registry wins over custom if collision)
  const seen = new Set<string>();
  const list = baseList.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));

  const isLazy = registryModels.length === 0;

  return (
    <div className="flex flex-col gap-1.5">
      <button
        aria-label={props.value || "(选择模型)"}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded border border-line bg-field px-3 py-2 text-left text-[12px] text-fg-1 hover:border-fg-3"
      >
        <span className="font-mono">{props.value || "(选择模型)"}</span>
        <span className="ml-auto text-fg-3">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="rounded border border-line bg-surface">
          {isLazy && (
            <div className="flex items-center justify-between border-b border-line px-3 py-1.5 text-[10px] text-fg-3">
              <span className="font-mono">{props.fetchedAt ? new Date(props.fetchedAt).toLocaleString() : "未拉取"}</span>
              <button onClick={() => props.onRefresh()} className="hover:text-fg-1">
                {props.isFetching ? "拉取中…" : "↻ 刷新"}
              </button>
            </div>
          )}
          {list.length === 0 && (
            <div className="px-3 py-2 text-[11px] text-fg-3">{props.isFetching ? "拉取中…" : "(空 — 用 + 添加自定义)"}</div>
          )}
          {list.map((m) => (
            <button
              key={m.id}
              onClick={() => { props.onChange(m.id); setOpen(false); }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-field ${m.id === props.value ? "bg-field" : ""}`}
            >
              <span className="font-mono text-fg-1">{m.id}</span>
              {m.meta?.vision && <span className="rounded bg-line px-1 text-[9px] text-fg-3">vision</span>}
              {m.meta?.tools && <span className="rounded bg-line px-1 text-[9px] text-fg-3">tools</span>}
              {m.isCustom && (
                <>
                  <span className="rounded bg-line px-1 text-[9px] text-fg-3">custom</span>
                  {props.onRemoveCustom && (
                    <span
                      onClick={(e) => { e.stopPropagation(); props.onRemoveCustom!(m.id); }}
                      className="ml-auto text-fg-3 hover:text-warning"
                    >
                      ×
                    </span>
                  )}
                </>
              )}
            </button>
          ))}

          <div className="border-t border-line">
            {!adding ? (
              <button
                onClick={() => setAdding(true)}
                className="w-full px-3 py-2 text-left text-[11px] text-accent hover:bg-field"
              >
                + 添加自定义模型
              </button>
            ) : (
              <div className="flex gap-1.5 p-2">
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="model id"
                  className="flex-1 rounded border border-line bg-field px-2 py-1 font-mono text-[11px] text-fg-1"
                />
                <button
                  disabled={!draft.trim()}
                  onClick={() => { props.onAddCustom(draft.trim()); setDraft(""); setAdding(false); }}
                  className="rounded bg-fg-1 px-2 py-1 text-[10px] text-canvas disabled:opacity-30"
                >
                  保存
                </button>
                <button
                  onClick={() => { setDraft(""); setAdding(false); }}
                  className="rounded border border-line px-2 py-1 text-[10px] text-fg-3"
                >
                  取消
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
