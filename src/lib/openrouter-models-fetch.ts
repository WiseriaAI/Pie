import type { ModelMeta } from "@/lib/model-router";

/** Raw shape OpenRouter returns for each model in /v1/models. */
interface OpenRouterModelEntry {
  id: string;
  context_length?: number;
  architecture?: { input_modalities?: string[] };
}

/**
 * Fetch + normalise OpenRouter's /v1/models response into our ModelMeta shape.
 *
 * /v1/models is a PUBLIC endpoint per OpenRouter docs — no auth required.
 * apiKey is optional; when provided it's attached as Authorization header
 * (some providers may apply per-key rate limit / personalisation, harmless
 * here). Wizard flow fetches with no key so dropdown is populated before
 * the user enters anything.
 *
 * Throws on network error or non-2xx response — caller decides whether to
 * swallow (current v1 policy: silent retry via UI).
 */
export async function fetchOpenRouterModels(
  baseUrl: string,
  apiKey?: string,
): Promise<ModelMeta[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/v1/models`;
  const headers: Record<string, string> = {};
  if (apiKey && apiKey.trim().length > 0) headers.authorization = `Bearer ${apiKey}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`OpenRouter /v1/models returned ${res.status}`);
  const data = (await res.json()) as { data?: OpenRouterModelEntry[] };
  return (data.data ?? []).map((m) => ({
    id: m.id,
    vision: m.architecture?.input_modalities?.includes("image") ?? false,
    tools: true,
    maxContextTokens: m.context_length ?? 32_000,
  }));
}
