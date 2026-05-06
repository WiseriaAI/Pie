import { describe, it, expect, vi } from "vitest";
import { streamChat } from "./zhipu";
import type { ModelConfig } from "@/lib/model-router";

describe("zhipu wrapper", () => {
  it("delegates to openai-compat core (no custom headers)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("data: [DONE]\n\n")); c.close(); } }),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      ),
    );
    const config: ModelConfig = {
      provider: "zhipu", model: "glm-4-plus", apiKey: "k",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    };
    for await (const _ of streamChat(config, [{ role: "user", content: "hi" }])) { /* drain */ }
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)["HTTP-Referer"]).toBeUndefined();
    fetchMock.mockRestore();
  });
});
