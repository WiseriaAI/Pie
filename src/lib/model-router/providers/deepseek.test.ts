import { describe, it, expect, vi } from "vitest";
import { streamChat } from "./deepseek";
import type { ModelConfig } from "@/lib/model-router";

describe("deepseek wrapper", () => {
  it("delegates to openai-compat core (no custom headers)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("data: [DONE]\n\n")); c.close(); } }),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      ),
    );
    const config: ModelConfig = {
      provider: "deepseek", model: "deepseek-v4-flash", apiKey: "sk-test",
      baseUrl: "https://api.deepseek.com",
    };
    for await (const _ of streamChat(config, [{ role: "user", content: "hi" }])) { /* drain */ }
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["HTTP-Referer"]).toBeUndefined();
    expect(headers.authorization).toBe("Bearer sk-test");
    fetchMock.mockRestore();
  });
});
