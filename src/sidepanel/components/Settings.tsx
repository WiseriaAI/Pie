import { useState, useEffect } from "react";
import type { Provider } from "@/lib/model-router";
import { chat, PROVIDER_REGISTRY } from "@/lib/model-router";
import {
  saveProviderConfig,
  getProviderConfig,
  deleteProviderConfig,
  getActiveProvider,
  setActiveProvider,
} from "@/lib/storage";
import {
  isKeyboardSimulationEnabled,
  setKeyboardSimulationEnabled,
} from "@/lib/keyboard-simulation";
import SkillsList from "./SkillsList";

interface ProviderFormState {
  apiKey: string;
  model: string;
  baseUrl: string;
  configured: boolean;
  maskedKey: string;
  showKey: boolean;
}

function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function makeInitialForms(): Record<string, ProviderFormState> {
  const forms: Record<string, ProviderFormState> = {};
  for (const p of PROVIDER_REGISTRY) {
    forms[p.id] = {
      apiKey: "",
      model: p.defaultModel,
      baseUrl: "",
      configured: false,
      maskedKey: "",
      showKey: false,
    };
  }
  return forms;
}

interface SettingsProps {
  onBack: () => void;
  onRunSkill?: (skillId: string, skillName: string) => void;
}

type Tab = "providers" | "skills";

export default function Settings({ onBack, onRunSkill }: SettingsProps) {
  const [tab, setTab] = useState<Tab>("providers");
  const [forms, setForms] = useState(makeInitialForms);
  const [activeProvider, setActiveProviderState] = useState<Provider | null>(null);
  const [testing, setTesting] = useState<Provider | null>(null);
  const [testResult, setTestResult] = useState<
    Record<string, { ok: boolean; message: string }>
  >({});
  const [saving, setSaving] = useState<Provider | null>(null);
  const [needsReconfig, setNeedsReconfig] = useState(false);
  const [keyboardSimEnabled, setKeyboardSimEnabled] = useState(false);
  const [expanded, setExpanded] = useState<Provider | null>(null);

  useEffect(() => {
    loadConfigs();
    isKeyboardSimulationEnabled().then(setKeyboardSimEnabled);
  }, []);

  async function handleKeyboardSimToggle(next: boolean) {
    setKeyboardSimEnabled(next);
    await setKeyboardSimulationEnabled(next);
  }

  async function loadConfigs() {
    const active = await getActiveProvider();
    setActiveProviderState(active);

    for (const p of PROVIDER_REGISTRY) {
      try {
        const config = await getProviderConfig(p.id);
        if (config) {
          setForms((prev) => ({
            ...prev,
            [p.id]: {
              ...prev[p.id],
              model: config.model,
              baseUrl: config.baseUrl || "",
              configured: true,
              maskedKey: maskKey(config.apiKey),
            },
          }));
        }
      } catch {
        setNeedsReconfig(true);
      }
    }
  }

  function updateForm(provider: Provider, updates: Partial<ProviderFormState>) {
    setForms((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], ...updates },
    }));
  }

  async function handleTest(provider: Provider) {
    const form = forms[provider];
    const apiKey = form.apiKey || (form.configured ? undefined : "");
    if (!apiKey && !form.configured) return;

    setTesting(provider);
    setTestResult((prev) => ({ ...prev, [provider]: undefined! }));

    try {
      let config;
      if (apiKey) {
        config = {
          provider,
          model: form.model,
          apiKey,
          baseUrl: form.baseUrl || undefined,
          maxTokens: 1,
        };
      } else {
        config = await getProviderConfig(provider);
        if (!config) throw new Error("No configuration found");
        config = { ...config, maxTokens: 1 };
      }

      await chat(config, [{ role: "user", content: "Hi" }]);
      setTestResult((prev) => ({
        ...prev,
        [provider]: { ok: true, message: "Connection successful" },
      }));
    } catch (e) {
      setTestResult((prev) => ({
        ...prev,
        [provider]: {
          ok: false,
          message: e instanceof Error ? e.message : "Connection failed",
        },
      }));
    } finally {
      setTesting(null);
    }
  }

  async function handleSave(provider: Provider) {
    const form = forms[provider];
    if (!form.apiKey.trim()) return;

    setSaving(provider);
    try {
      await saveProviderConfig(
        provider,
        form.apiKey,
        form.model,
        form.baseUrl || undefined,
      );

      if (!activeProvider) {
        await setActiveProvider(provider);
        setActiveProviderState(provider);
      }

      updateForm(provider, {
        configured: true,
        maskedKey: maskKey(form.apiKey),
        apiKey: "",
        showKey: false,
      });
      setTestResult((prev) => ({ ...prev, [provider]: undefined! }));
    } catch (e) {
      setTestResult((prev) => ({
        ...prev,
        [provider]: {
          ok: false,
          message: e instanceof Error ? e.message : "Failed to save",
        },
      }));
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete(provider: Provider) {
    await deleteProviderConfig(provider);
    const meta = PROVIDER_REGISTRY.find((p) => p.id === provider)!;
    updateForm(provider, {
      apiKey: "",
      model: meta.defaultModel,
      baseUrl: "",
      configured: false,
      maskedKey: "",
      showKey: false,
    });
    setTestResult((prev) => ({ ...prev, [provider]: undefined! }));

    if (activeProvider === provider) {
      const other = PROVIDER_REGISTRY.find(
        (p) => p.id !== provider && forms[p.id]?.configured,
      );
      if (other) {
        await setActiveProvider(other.id);
        setActiveProviderState(other.id);
      } else {
        await chrome.storage.local.remove("active_provider");
        setActiveProviderState(null);
      }
    }
  }

  async function handleSetActive(provider: Provider) {
    await setActiveProvider(provider);
    setActiveProviderState(provider);
  }

  const configuredCount = Object.values(forms).filter((f) => f.configured).length;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-shrink-0 items-center gap-2 border-b border-line bg-canvas px-3.5 py-3">
        <button
          onClick={onBack}
          className="flex h-7 w-7 items-center justify-center rounded text-fg-2 hover:bg-field hover:text-fg-1"
          aria-label="Back to agent"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M9 11L5 7L9 3"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <span className="text-[13px] font-semibold tracking-[-0.005em] text-fg-1">
          Settings
        </span>
        <div className="flex-1" />
        <SegmentedTabs value={tab} onChange={setTab} />
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        {tab === "providers" ? (
          <ProvidersView
            forms={forms}
            activeProvider={activeProvider}
            testing={testing}
            saving={saving}
            testResult={testResult}
            needsReconfig={needsReconfig}
            configuredCount={configuredCount}
            expanded={expanded}
            keyboardSimEnabled={keyboardSimEnabled}
            onToggleExpand={(p) => setExpanded(expanded === p ? null : p)}
            onUpdateForm={updateForm}
            onTest={handleTest}
            onSave={handleSave}
            onDelete={handleDelete}
            onSetActive={handleSetActive}
            onKeyboardSimToggle={handleKeyboardSimToggle}
          />
        ) : (
          <SkillsList onRunSkill={onRunSkill ?? (() => {})} />
        )}
      </div>
    </div>
  );
}

function SegmentedTabs({
  value,
  onChange,
}: {
  value: Tab;
  onChange: (t: Tab) => void;
}) {
  const tabs: { id: Tab; label: string }[] = [
    { id: "providers", label: "Providers" },
    { id: "skills", label: "Skills" },
  ];
  return (
    <div className="flex">
      {tabs.map((t, i) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`border border-line px-3 py-1 text-[11px] ${
              i === 0 ? "rounded-l-md" : "-ml-px rounded-r-md"
            } ${
              active
                ? "bg-field font-medium text-fg-1"
                : "bg-transparent text-fg-2 hover:text-fg-1"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

interface ProvidersViewProps {
  forms: Record<string, ProviderFormState>;
  activeProvider: Provider | null;
  testing: Provider | null;
  saving: Provider | null;
  testResult: Record<string, { ok: boolean; message: string }>;
  needsReconfig: boolean;
  configuredCount: number;
  expanded: Provider | null;
  keyboardSimEnabled: boolean;
  onToggleExpand: (p: Provider) => void;
  onUpdateForm: (p: Provider, updates: Partial<ProviderFormState>) => void;
  onTest: (p: Provider) => void;
  onSave: (p: Provider) => void;
  onDelete: (p: Provider) => void;
  onSetActive: (p: Provider) => void;
  onKeyboardSimToggle: (next: boolean) => void;
}

function ProvidersView(props: ProvidersViewProps) {
  return (
    <div className="flex flex-col gap-7">
      {props.needsReconfig && (
        <div className="rounded-lg border border-warning-line bg-warning-tint px-3 py-2.5 text-[12px] text-warning">
          Browser was restarted. Please re-enter your API keys.
        </div>
      )}

      <ProviderListSection
        forms={props.forms}
        activeProvider={props.activeProvider}
        configuredCount={props.configuredCount}
        expanded={props.expanded}
        testing={props.testing}
        saving={props.saving}
        testResult={props.testResult}
        onToggleExpand={props.onToggleExpand}
        onUpdateForm={props.onUpdateForm}
        onTest={props.onTest}
        onSave={props.onSave}
        onDelete={props.onDelete}
        onSetActive={props.onSetActive}
      />

      <KeyboardSimSection
        enabled={props.keyboardSimEnabled}
        onToggle={props.onKeyboardSimToggle}
      />
    </div>
  );
}

function ProviderListSection({
  forms,
  activeProvider,
  configuredCount,
  expanded,
  testing,
  saving,
  testResult,
  onToggleExpand,
  onUpdateForm,
  onTest,
  onSave,
  onDelete,
  onSetActive,
}: Pick<
  ProvidersViewProps,
  | "forms"
  | "activeProvider"
  | "configuredCount"
  | "expanded"
  | "testing"
  | "saving"
  | "testResult"
  | "onToggleExpand"
  | "onUpdateForm"
  | "onTest"
  | "onSave"
  | "onDelete"
  | "onSetActive"
>) {
  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex items-baseline justify-between">
        <span className="caps text-fg-3">CONFIGURED</span>
        <span className="font-mono text-[10px] text-fg-3">
          {configuredCount} of {PROVIDER_REGISTRY.length}
        </span>
      </div>
      <div className="flex flex-col gap-px overflow-hidden rounded-lg border border-line bg-line">
        {PROVIDER_REGISTRY.map((provider) => {
          const form = forms[provider.id];
          if (!form) return null;
          const isActive = activeProvider === provider.id;
          const isOpen = expanded === provider.id;
          const isTesting = testing === provider.id;
          const isSaving = saving === provider.id;
          const result = testResult[provider.id];

          return (
            <div key={provider.id} className="bg-surface">
              <button
                onClick={() => onToggleExpand(provider.id)}
                className={`flex w-full items-center gap-3 px-3.5 py-3 text-left ${
                  form.configured ? "" : "opacity-60"
                } hover:bg-field`}
              >
                <div
                  className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                    isActive ? "bg-accent" : form.configured ? "bg-fg-3" : "bg-line"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-fg-1">{provider.name}</div>
                  <div className="truncate font-mono text-[11px] text-fg-2">
                    {form.configured
                      ? `${form.model} · ${form.maskedKey}`
                      : "— no key set"}
                  </div>
                </div>
                {isActive ? (
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-accent">
                    ACTIVE
                  </span>
                ) : form.configured ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetActive(provider.id);
                    }}
                    className="rounded border border-line bg-transparent px-2.5 py-1 text-[11px] text-fg-2 hover:border-fg-3 hover:text-fg-1"
                  >
                    Activate
                  </button>
                ) : (
                  <span className="rounded border border-line px-2.5 py-1 text-[11px] text-fg-2">
                    + Add
                  </span>
                )}
              </button>

              {isOpen && (
                <ProviderForm
                  provider={provider.id}
                  providerName={provider.name}
                  defaultBaseUrl={provider.defaultBaseUrl}
                  placeholder={provider.placeholder}
                  form={form}
                  isTesting={isTesting}
                  isSaving={isSaving}
                  result={result}
                  onUpdateForm={onUpdateForm}
                  onTest={onTest}
                  onSave={onSave}
                  onDelete={onDelete}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ProviderForm({
  provider,
  providerName,
  defaultBaseUrl,
  placeholder,
  form,
  isTesting,
  isSaving,
  result,
  onUpdateForm,
  onTest,
  onSave,
  onDelete,
}: {
  provider: Provider;
  providerName: string;
  defaultBaseUrl: string;
  placeholder: string;
  form: ProviderFormState;
  isTesting: boolean;
  isSaving: boolean;
  result: { ok: boolean; message: string } | undefined;
  onUpdateForm: (p: Provider, updates: Partial<ProviderFormState>) => void;
  onTest: (p: Provider) => void;
  onSave: (p: Provider) => void;
  onDelete: (p: Provider) => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-line bg-canvas px-3.5 py-3.5">
      <Field label="API key" hint={form.configured ? `Current ${form.maskedKey}` : undefined}>
        <div className="flex gap-1.5">
          <input
            type={form.showKey ? "text" : "password"}
            value={form.apiKey}
            onChange={(e) => onUpdateForm(provider, { apiKey: e.target.value })}
            placeholder={form.configured ? "Enter new key to update" : placeholder}
            className="flex-1 rounded border border-line bg-field px-3 py-2 text-[12px] text-fg-1 placeholder:text-fg-3 focus:border-accent-line"
          />
          <button
            onClick={() => onUpdateForm(provider, { showKey: !form.showKey })}
            className="rounded border border-line bg-field px-2.5 text-[11px] text-fg-2 hover:text-fg-1"
          >
            {form.showKey ? "Hide" : "Show"}
          </button>
        </div>
      </Field>

      <Field label="Model">
        <input
          type="text"
          value={form.model}
          onChange={(e) => onUpdateForm(provider, { model: e.target.value })}
          className="w-full rounded border border-line bg-field px-3 py-2 text-[12px] text-fg-1 focus:border-accent-line"
        />
      </Field>

      <Field label="Base URL" hint={`Default ${defaultBaseUrl}`}>
        <input
          type="text"
          value={form.baseUrl}
          onChange={(e) => onUpdateForm(provider, { baseUrl: e.target.value })}
          placeholder={defaultBaseUrl}
          className="w-full rounded border border-line bg-field px-3 py-2 text-[12px] text-fg-1 placeholder:text-fg-3 focus:border-accent-line"
        />
      </Field>

      {result && (
        <div
          className={`rounded border px-2.5 py-1.5 text-[11px] ${
            result.ok
              ? "border-line bg-field text-fg-2"
              : "border-warning-line bg-warning-tint text-warning"
          }`}
        >
          {result.message}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 pt-1">
        <button
          onClick={() => onTest(provider)}
          disabled={isTesting || (!form.apiKey.trim() && !form.configured)}
          className="rounded border border-line bg-transparent px-3 py-1.5 text-[11px] text-fg-2 hover:border-fg-3 hover:text-fg-1 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isTesting ? "Testing…" : "Test"}
        </button>
        <button
          onClick={() => onSave(provider)}
          disabled={isSaving || !form.apiKey.trim()}
          className="rounded bg-fg-1 px-3 py-1.5 text-[11px] font-medium text-canvas hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
        {form.configured && (
          <button
            onClick={() => onDelete(provider)}
            className="ml-auto rounded border border-warning-line bg-transparent px-3 py-1.5 text-[11px] text-warning hover:bg-warning-tint"
            title={`Forget ${providerName} key`}
          >
            Forget key
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-3">
          {label}
        </span>
        {hint && <span className="font-mono text-[10px] text-fg-3">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

function KeyboardSimSection({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="caps text-fg-3">EXPERIMENTAL</span>
      </div>
      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3.5">
        <div className="flex items-start gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <div className="text-[13px] font-medium text-fg-1">CDP keyboard input</div>
            <p className="text-[12px] leading-[18px] text-fg-2">
              Lets the agent type into canvas-rendered editors (Feishu Docs, Google Docs, Notion) via Chrome DevTools Protocol. Required only for those — regular sites work without this.
            </p>
          </div>
          <Switch checked={enabled} onChange={onToggle} />
        </div>
        {enabled && (
          <div className="flex flex-col gap-1.5 rounded border border-warning-line bg-warning-tint px-3 py-2 text-[11px] leading-[16px] text-warning">
            <span className="font-medium">Heads up — debugger access is active</span>
            <ul className="flex flex-col gap-1 pl-3 text-warning/90">
              <li className="list-['—__'] pl-0">
                Chrome shows a yellow debug bar on the target tab while the agent uses keyboard tools. Each call requires your approval.
              </li>
              <li className="list-['—__'] pl-0">
                If the window is minimized or the tab is off-screen, the bar may not be visible — the extension is still controlling it.
              </li>
              <li className="list-['—__'] pl-0">
                Click the yellow bar's "Cancel" anytime to revoke access.
              </li>
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border transition-colors ${
        checked ? "border-accent-line bg-accent-tint" : "border-line bg-field"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full transition-transform ${
          checked ? "translate-x-6 bg-accent" : "translate-x-1 bg-fg-3"
        }`}
      />
    </button>
  );
}
