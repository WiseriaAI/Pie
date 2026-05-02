import { useState, useEffect } from "react";
import Chat from "@/sidepanel/components/Chat";
import Settings from "@/sidepanel/components/Settings";
import { getActiveProvider, getProviderConfig } from "@/lib/storage";
import { getProviderMeta } from "@/lib/model-router";
import { normalizeSkillSlashKey } from "@/lib/skills";
import { useSession } from "@/sidepanel/hooks/useSession";

type View = "agent" | "settings";

export default function App() {
  const [view, setView] = useState<View>("agent");
  const [providerLabel, setProviderLabel] = useState<string | null>(null);
  const [chatPrefill, setChatPrefill] = useState<string | undefined>(undefined);
  // Hook lives at App level so the SW port + onMessage listener survive
  // Chat unmounts (Settings sub-view swap). Plan M1-U2 root-cause #1 fix.
  const session = useSession();

  function handleRunSkill(skillId: string, skillName: string) {
    const slug = normalizeSkillSlashKey(skillName);
    const key = slug.length > 0 ? slug : skillId;
    setChatPrefill(`/${key}`);
    setView("agent");
  }

  useEffect(() => {
    chrome.storage.local.get("firstRun", (result) => {
      if (result.firstRun) {
        setView("settings");
        chrome.storage.local.remove("firstRun");
      }
    });

    loadProviderLabel();

    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.active_provider || Object.keys(changes).some((k) => k.startsWith("provider_"))) {
        loadProviderLabel();
      }
    };
    chrome.storage.local.onChanged.addListener(listener);
    return () => chrome.storage.local.onChanged.removeListener(listener);
  }, []);

  async function loadProviderLabel() {
    const active = await getActiveProvider();
    if (!active) {
      setProviderLabel(null);
      return;
    }
    try {
      const config = await getProviderConfig(active);
      if (config) {
        const meta = getProviderMeta(active);
        const name = meta?.name ?? active;
        setProviderLabel(`${name} · ${config.model}`);
      } else {
        setProviderLabel(null);
      }
    } catch {
      setProviderLabel(null);
    }
  }

  return (
    <div className="bg-canvas text-fg-1 dot-grid flex h-screen flex-col">
      {view === "agent" ? (
        <Chat
          providerLabel={providerLabel}
          onOpenSettings={() => setView("settings")}
          prefillInput={chatPrefill}
          onPrefillConsumed={() => setChatPrefill(undefined)}
          session={session}
        />
      ) : (
        <Settings
          onBack={() => setView("agent")}
          onRunSkill={handleRunSkill}
        />
      )}
    </div>
  );
}
