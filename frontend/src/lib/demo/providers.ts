/**
 * Supported model providers.
 *
 * Every entry speaks the OpenAI chat-completions wire format, which is why one
 * client covers all of them - the only thing that changes is the base URL, the
 * key, and the model id. Anthropic and Google are reached through their
 * OpenAI-compatible endpoints rather than their native APIs for the same reason.
 *
 * There is no shared key: the demo runs on whatever key the visitor supplies,
 * held in an httpOnly cookie and never returned by the API.
 */

export type ProviderId =
  | "openrouter"
  | "openai"
  | "anthropic"
  | "google"
  | "groq"
  | "mistral"
  | "deepseek"
  | "xai"
  | "together"
  | "ollama"
  | "custom";

export type Provider = {
  id: ProviderId;
  label: string;
  baseUrl: string;
  defaultModel: string;
  /** Shown as the input placeholder, so a pasted key is obviously the wrong shape. */
  keyPlaceholder: string;
  /** Where to get a key. Empty for providers that need none. */
  keyUrl: string;
  /** Suggested models, used when the provider cannot list them over the API. */
  models: string[];
  /** False for local runtimes that ignore the Authorization header. */
  needsKey: boolean;
};

export const PROVIDERS: Provider[] = [
  {
    id: "openrouter",
    label: "OpenRouter (all models, one key)",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-haiku-4.5",
    keyPlaceholder: "sk-or-v1-...",
    keyUrl: "https://openrouter.ai/keys",
    models: [
      "anthropic/claude-haiku-4.5",
      "anthropic/claude-sonnet-4.5",
      "openai/gpt-4o-mini",
      "openai/gpt-4o",
      "google/gemini-2.0-flash-001",
      "meta-llama/llama-3.3-70b-instruct",
      "deepseek/deepseek-chat",
    ],
    needsKey: true,
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    keyPlaceholder: "sk-...",
    keyUrl: "https://platform.openai.com/api-keys",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1", "gpt-4.1-mini", "o3-mini"],
    needsKey: true,
  },
  {
    id: "anthropic",
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-haiku-4-5",
    keyPlaceholder: "sk-ant-...",
    keyUrl: "https://console.anthropic.com/settings/keys",
    models: ["claude-haiku-4-5", "claude-sonnet-4-5", "claude-opus-4-1"],
    needsKey: true,
  },
  {
    id: "google",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.0-flash",
    keyPlaceholder: "AIza...",
    keyUrl: "https://aistudio.google.com/apikey",
    models: ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-pro"],
    needsKey: true,
  },
  {
    id: "groq",
    label: "Groq (fast inference)",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    keyPlaceholder: "gsk_...",
    keyUrl: "https://console.groq.com/keys",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
    needsKey: true,
  },
  {
    id: "mistral",
    label: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
    keyPlaceholder: "your Mistral key",
    keyUrl: "https://console.mistral.ai/api-keys",
    models: ["mistral-small-latest", "mistral-large-latest", "open-mistral-nemo"],
    needsKey: true,
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    keyPlaceholder: "sk-...",
    keyUrl: "https://platform.deepseek.com/api_keys",
    models: ["deepseek-chat", "deepseek-reasoner"],
    needsKey: true,
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    baseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-2-latest",
    keyPlaceholder: "xai-...",
    keyUrl: "https://console.x.ai",
    models: ["grok-2-latest", "grok-2-mini"],
    needsKey: true,
  },
  {
    id: "together",
    label: "Together AI",
    baseUrl: "https://api.together.xyz/v1",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    keyPlaceholder: "your Together key",
    keyUrl: "https://api.together.xyz/settings/api-keys",
    models: [
      "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      "mistralai/Mixtral-8x7B-Instruct-v0.1",
    ],
    needsKey: true,
  },
  {
    id: "ollama",
    label: "Ollama (local, no key)",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "gemma4:latest",
    keyPlaceholder: "not needed",
    keyUrl: "",
    models: ["gemma4:latest", "llama3.3:latest", "qwen2.5:latest"],
    needsKey: false,
  },
  {
    id: "custom",
    label: "Custom OpenAI-compatible endpoint",
    baseUrl: "",
    defaultModel: "",
    keyPlaceholder: "your API key",
    keyUrl: "",
    models: [],
    needsKey: false,
  },
];

const BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));

export function getProvider(id: string): Provider | undefined {
  return BY_ID.get(id as ProviderId);
}

/** The default provider a first-time visitor lands on. */
export const DEFAULT_PROVIDER = PROVIDERS[0];
