/**
 * Minimal OpenRouter client for the demo route handlers (server-side only).
 * OpenRouter speaks the OpenAI chat-completions API, so this is a thin fetch.
 */

const REFERER = "https://github.com/siroxou/advanced-rag";
const TITLE = "Advanced RAG Demo";

export type Msg = { role: "system" | "user" | "assistant"; content: string };

type CallOpts = {
  key: string;
  model: string;
  baseUrl: string;
  messages: Msg[];
  temperature?: number;
  maxTokens?: number;
};

function headers(key: string): Record<string, string> {
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "HTTP-Referer": REFERER,
    "X-Title": TITLE,
  };
}

/** Stream answer deltas as they arrive from OpenRouter. */
export async function* streamChat(opts: CallOpts): AsyncGenerator<string> {
  const resp = await fetch(`${opts.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: headers(opts.key),
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 1024,
      stream: true,
    }),
  });
  if (!resp.ok || !resp.body) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`OpenRouter ${resp.status}: ${detail.slice(0, 200)}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload);
        const delta: string = json.choices?.[0]?.delta?.content ?? "";
        if (delta) yield delta;
      } catch {
        // ignore keep-alive / partial frames
      }
    }
  }
}

export async function chatOnce(opts: CallOpts): Promise<string> {
  const resp = await fetch(`${opts.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: headers(opts.key),
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 1024,
    }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`OpenRouter ${resp.status}: ${detail.slice(0, 200)}`);
  }
  const json = await resp.json();
  return json.choices?.[0]?.message?.content ?? "";
}

export async function listModels(key: string, baseUrl: string): Promise<string[]> {
  const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!resp.ok) throw new Error(`models ${resp.status}`);
  const json = await resp.json();
  return (json.data ?? [])
    .map((m: { id?: string }) => m.id)
    .filter((id: string | undefined): id is string => !!id)
    .sort();
}

export async function health(key: string, baseUrl: string): Promise<boolean> {
  try {
    const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    return resp.ok;
  } catch {
    return false;
  }
}
