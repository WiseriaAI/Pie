import { useState } from "react";

type Tab = "chat" | "agent" | "tabs" | "settings";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("chat");

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      {/* Header */}
      <header className="flex items-center gap-2 border-b border-neutral-800 px-4 py-3">
        <span className="text-lg font-semibold">Chrome AI Agent</span>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-4">
        {activeTab === "chat" && <ChatPlaceholder />}
        {activeTab === "agent" && <Placeholder label="Agent" />}
        {activeTab === "tabs" && <Placeholder label="Tabs" />}
        {activeTab === "settings" && <Placeholder label="Settings" />}
      </main>

      {/* Bottom Nav */}
      <nav className="flex border-t border-neutral-800">
        {(["chat", "agent", "tabs", "settings"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-center text-xs font-medium capitalize transition-colors ${
              activeTab === tab
                ? "bg-neutral-800 text-white"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>
    </div>
  );
}

function ChatPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 pt-20 text-neutral-500">
      <p className="text-sm">Configure your API key in Settings to get started.</p>
    </div>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center pt-20 text-neutral-500">
      <p className="text-sm">{label} — coming soon</p>
    </div>
  );
}
