import { describe, it, expect, vi } from "vitest";
import { streamChat } from "./minimax";
import type { ModelConfig } from "@/lib/model-router";

describe("minimax wrapper", () => {
  it("delegates to openai-compat core (no custom headers)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("data: [DONE]\n\n")); c.close(); } }),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      ),
    );
    const config: ModelConfig = {
      provider: "minimax", model: "MiniMax-Text-01", apiKey: "k",
      baseUrl: "https://api.minimax.chat",
    };
    for await (const _ of streamChat(config, [{ role: "user", content: "hi" }])) { /* drain */ }
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)["HTTP-Referer"]).toBeUndefined();
    fetchMock.mockRestore();
  });
});
