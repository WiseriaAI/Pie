import { useState } from "react";
import type { Provider, ModelMeta } from "@/lib/model-router";
import { getProviderMeta } from "@/lib/model-router";
import ModelDropdown from "./ModelDropdown";

export interface InstanceFormPayload {
  nickname: string;
  apiKey: string;
  model: string;
}

interface Props {
  mode: "create" | "edit";
  provider: Provider;
  initialNickname: string;
  initialModel?: string;
  initialCustomModels?: string[];
  fetchedModels?: ModelMeta[];
  fetchedAt?: number;
  isFetching?: boolean;
  maskedKey?: string;
  onSave: (payload: InstanceFormPayload) => void;
  onTest: (payload: InstanceFormPayload) => void;
  onDelete?: () => void;
  onAddCustomModel?: (id: string) => void;
  onRemoveCustomModel?: (id: string) => void;
  onRefreshModels?: () => void;
  saveLabel?: string;
}

export default function InstanceForm(props: Props) {
  const meta = getProviderMeta(props.provider);
  const [nickname, setNickname] = useState(props.initialNickname);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState(props.initialModel ?? "");

  const canSave = apiKey.trim().length > 0 && model.trim().length > 0;

  const payload: InstanceFormPayload = { nickname, apiKey, model };

  return (
    <div className="flex flex-col gap-3 px-3.5 py-3.5">
      <Field label="NICKNAME">
        <input
          aria-label="nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          className="rounded border border-line bg-field px-3 py-2 text-[12px] text-fg-1"
        />
      </Field>

      <Field label="PROVIDER" hint={meta?.defaultBaseUrl}>
        <div className="flex items-center gap-2 rounded border border-line bg-field px-3 py-2 text-[12px] text-fg-2">
          <span className="text-fg-1">{meta?.name ?? props.provider}</span>
          <span className="ml-auto font-mono text-[10px] text-fg-3">LOCKED</span>
        </div>
      </Field>

      <Field label="API KEY" hint={props.maskedKey ? `Current ${props.maskedKey}` : undefined}>
        <div className="flex gap-1.5">
          <input
            aria-label="api key"
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={meta?.placeholder ?? ""}
            className="flex-1 rounded border border-line bg-field px-3 py-2 text-[12px] text-fg-1"
          />
          <button
            onClick={() => setShowKey(!showKey)}
            className="rounded border border-line bg-field px-2.5 text-[11px] text-fg-2"
          >
            {showKey ? "Hide" : "Show"}
          </button>
        </div>
      </Field>

      <Field label="MODEL">
        <ModelDropdown
          provider={props.provider}
          value={model}
          customModels={props.initialCustomModels ?? []}
          fetchedModels={props.fetchedModels}
          fetchedAt={props.fetchedAt}
          isFetching={props.isFetching}
          onChange={setModel}
          onAddCustom={(id) => { setModel(id); props.onAddCustomModel?.(id); }}
          onRemoveCustom={props.onRemoveCustomModel}
          onRefresh={props.onRefreshModels ?? (() => {})}
        />
      </Field>

      <div className="flex flex-wrap gap-1.5 pt-1">
        <button
          onClick={() => props.onTest(payload)}
          disabled={!canSave}
          className="rounded border border-line bg-transparent px-3 py-1.5 text-[11px] text-fg-2 hover:border-fg-3 disabled:opacity-30"
        >
          Test
        </button>
        <button
          onClick={() => props.onSave(payload)}
          disabled={!canSave}
          className="rounded bg-fg-1 px-3 py-1.5 text-[11px] font-medium text-canvas disabled:opacity-30"
        >
          {props.saveLabel ?? "Save"}
        </button>
        {props.mode === "edit" && props.onDelete && (
          <button
            onClick={() => props.onDelete!()}
            className="ml-auto rounded border border-warning-line bg-transparent px-3 py-1.5 text-[11px] text-warning hover:bg-warning-tint"
          >
            Forget config
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-3">{label}</span>
        {hint && <span className="font-mono text-[10px] text-fg-3">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
