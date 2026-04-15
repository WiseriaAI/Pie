// Model Router — unified LLM interface abstraction

export type Provider = "anthropic" | "openai" | "google" | "ollama";

export interface ModelConfig {
  provider: Provider;
  model: string;
  apiKey: string;
  baseUrl?: string; // for Ollama or custom endpoints
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatResponse {
  content: string;
  usage?: { inputTokens: number; outputTokens: number };
}

/**
 * Send a chat completion request through the configured provider.
 * Implementation will be filled in Phase 1.
 */
export async function chat(
  _config: ModelConfig,
  _messages: ChatMessage[],
): Promise<ChatResponse> {
  throw new Error("Model Router not yet implemented");
}
