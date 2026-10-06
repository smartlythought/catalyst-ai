// Provider-agnostic LLM layer. Every AI feature calls generateText /
// generateJSON / chatWithTools — never a vendor API directly.
//
// Providers:
//   - nvidia: build.nvidia.com open models via the OpenAI-compatible API.
//             Free developer tier (~40 requests/min, shared capacity).
//   - gemini: Google Gemini (paid). Native generateContent API, kept as an
//             optional fallback only.
//
// Selection (read at call time from env):
//   AI_PROVIDER=nvidia|gemini   explicit choice. Default: nvidia when
//                               NVIDIA_API_KEY is set, otherwise gemini.
//   AI_GEMINI_FALLBACK=true     also try Gemini if every NVIDIA model fails.
//                               Off by default, so NVIDIA mode never spends.
//   NVIDIA_MODELS=a,b           override the NVIDIA model order.
import { GEMINI_MODELS } from "@/lib/ai/models";

export const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
// Vetted on the free tier via /api/debug/llm (2026-10-06): Super answered a
// full 200-stock Daily Picks prompt in 15s; Ultra 2.5s and Lightning 0.4s on a
// smoke test. deepseek-v4.1-flash and glm-5.3-flash timed out, gpt-oss-20b
// returned empty content — don't use them as fallbacks.
export const NVIDIA_DEFAULT_MODELS = [
  "nvidia/nemotron-3-super-120b-a12b", // primary: agentic reasoning, tool calling, 1M context
  "nvidia/nemotron-3-ultra-550b-a55b", // fallback: larger, still responsive
  "nvidia/nemotron-3.5-lightning-30b-a3b", // last resort: fastest
];

export type ProviderName = "nvidia" | "gemini";

interface Provider {
  name: ProviderName;
  key: string;
  models: string[];
}

function envList(v: string | undefined): string[] {
  return (v || "").split(",").map((s) => s.trim()).filter(Boolean);
}

export function activeProviders(): Provider[] {
  const nvKey = process.env.NVIDIA_API_KEY || "";
  const gKey = process.env.GEMINI_API_KEY || "";
  const nvidia: Provider | null = nvKey
    ? {
        name: "nvidia",
        key: nvKey,
        models: envList(process.env.NVIDIA_MODELS).length
          ? envList(process.env.NVIDIA_MODELS)
          : NVIDIA_DEFAULT_MODELS,
      }
    : null;
  const gemini: Provider | null = gKey
    ? { name: "gemini", key: gKey, models: [...GEMINI_MODELS] }
    : null;

  const choice = (process.env.AI_PROVIDER || "").toLowerCase();
  const out: (Provider | null)[] =
    choice === "gemini"
      ? [gemini]
      : nvidia
        ? [nvidia, process.env.AI_GEMINI_FALLBACK === "true" ? gemini : null]
        : [gemini];
  return out.filter((p): p is Provider => p !== null);
}

/** True when at least one provider has a key configured. */
export function aiConfigured(): boolean {
  return activeProviders().length > 0;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Remove <think>…</think> reasoning blocks some open models emit inline. */
function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

/** Parse JSON that may be wrapped in code fences or surrounded by prose. */
export function parseLooseJSON<T = unknown>(text: string): T | null {
  const cleaned = stripThinking(text)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    /* fall through to extraction */
  }
  const starts = [cleaned.indexOf("["), cleaned.indexOf("{")].filter((i) => i >= 0);
  if (!starts.length) return null;
  const start = Math.min(...starts);
  const end = Math.max(cleaned.lastIndexOf("]"), cleaned.lastIndexOf("}"));
  if (end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

/** POST with one retry on transient overload (429/503). Null on network error. */
async function postJSON(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number
): Promise<Response | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    }).catch(() => null);
    if (!res) return null;
    if ((res.status === 429 || res.status === 503) && attempt === 0) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    return res;
  }
  return null;
}

/** Last-attempt diagnostics, surfaced by debug endpoints. */
export let lastLLMError = "";

// ---------------------------------------------------------------------------
// Messages & tools (OpenAI shape — the common denominator)
// ---------------------------------------------------------------------------

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export interface ToolDef {
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

export interface ChatTurn {
  content: string;
  toolCalls: ToolCall[];
  provider: ProviderName;
  model: string;
}

interface CallOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  json?: boolean; // ask for a JSON-only answer
  reasoning?: boolean; // let reasoning models "think" (slower). Default off.
  toolChoice?: "auto" | "none"; // "none" = tools stay declared but can't be called
}

// ---------------------------------------------------------------------------
// NVIDIA (OpenAI-compatible)
// ---------------------------------------------------------------------------

function toOpenAIMessages(messages: ChatMessage[]) {
  return messages.map((m) => {
    if (m.role === "tool") {
      return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      return {
        role: "assistant",
        content: m.content || "",
        tool_calls: m.toolCalls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: JSON.stringify(c.args) },
        })),
      };
    }
    return { role: m.role, content: m.content };
  });
}

async function nvidiaTurn(
  p: Provider,
  model: string,
  messages: ChatMessage[],
  tools: ToolDef[] | null,
  opts: CallOptions
): Promise<ChatTurn | null> {
  const body: Record<string, unknown> = {
    model,
    messages: toOpenAIMessages(messages),
    temperature: opts.temperature ?? 0.3,
    top_p: 0.95,
    max_tokens: opts.maxTokens ?? 4096,
  };
  if (tools?.length) {
    body.tools = tools.map((t) => ({ type: "function", function: t }));
    body.tool_choice = opts.toolChoice ?? "auto";
  }
  // Nemotron reasoning models think by default — off unless asked, for speed.
  if (/nemotron/i.test(model)) {
    body.chat_template_kwargs = { enable_thinking: !!opts.reasoning };
  }

  const res = await postJSON(
    `${NVIDIA_BASE_URL}/chat/completions`,
    { Authorization: `Bearer ${p.key}` },
    body,
    opts.timeoutMs ?? 60_000
  );
  if (!res) {
    lastLLMError = `nvidia ${model}: network error/timeout`;
    return null;
  }
  if (!res.ok) {
    lastLLMError = `nvidia ${model}: ${res.status} ${(await res.text()).slice(0, 160)}`;
    return null;
  }
  const data = await res.json();
  const msg = data.choices?.[0]?.message || {};
  const toolCalls: ToolCall[] = (msg.tool_calls || []).map((c: any, i: number) => {
    let args: Record<string, unknown> = {};
    try {
      args = typeof c.function?.arguments === "string"
        ? JSON.parse(c.function.arguments || "{}")
        : c.function?.arguments || {};
    } catch {
      args = {};
    }
    return { id: c.id || `call_${i}`, name: c.function?.name || "", args };
  });
  return {
    content: stripThinking(msg.content || ""),
    toolCalls: toolCalls.filter((c) => c.name),
    provider: "nvidia",
    model,
  };
}

// ---------------------------------------------------------------------------
// Gemini (native generateContent — the proven request shape)
// ---------------------------------------------------------------------------

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { result: value };
}

function toGeminiContents(messages: ChatMessage[]) {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const contents: { role: string; parts: unknown[] }[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "user") {
      contents.push({ role: "user", parts: [{ text: m.content }] });
    } else if (m.role === "assistant") {
      const parts: unknown[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const c of m.toolCalls || []) parts.push({ functionCall: { name: c.name, args: c.args } });
      contents.push({ role: "model", parts });
    } else if (m.role === "tool") {
      let response: unknown = m.content;
      try {
        response = JSON.parse(m.content);
      } catch {
        /* keep as string */
      }
      const part = { functionResponse: { name: m.name, response: asObject(response) } };
      const last = contents[contents.length - 1];
      // Consecutive tool results share one "function" turn.
      if (last?.role === "function") last.parts.push(part);
      else contents.push({ role: "function", parts: [part] });
    }
  }
  return { system, contents };
}

async function geminiTurn(
  p: Provider,
  model: string,
  messages: ChatMessage[],
  tools: ToolDef[] | null,
  opts: CallOptions
): Promise<ChatTurn | null> {
  const { system, contents } = toGeminiContents(messages);
  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.3,
      maxOutputTokens: opts.maxTokens ?? 4096,
      thinkingConfig: { thinkingBudget: 0 },
      ...(opts.json && !tools?.length ? { responseMimeType: "application/json" } : {}),
    },
  };
  if (system) body.system_instruction = { parts: [{ text: system }] };
  if (tools?.length) {
    body.tools = [{ function_declarations: tools }];
    body.tool_config = {
      function_calling_config: { mode: opts.toolChoice === "none" ? "NONE" : "AUTO" },
    };
  }

  const res = await postJSON(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${p.key}`,
    {},
    body,
    opts.timeoutMs ?? 60_000
  );
  if (!res) {
    lastLLMError = `gemini ${model}: network error/timeout`;
    return null;
  }
  if (!res.ok) {
    lastLLMError = `gemini ${model}: ${res.status} ${(await res.text()).slice(0, 160)}`;
    return null;
  }
  const data = await res.json();
  const parts: any[] = data.candidates?.[0]?.content?.parts || [];
  return {
    content: parts.map((x) => x.text || "").join("").trim(),
    toolCalls: parts
      .filter((x) => x.functionCall)
      .map((x, i) => ({ id: `call_${i}`, name: x.functionCall.name, args: x.functionCall.args || {} })),
    provider: "gemini",
    model,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function turn(p: Provider, model: string, messages: ChatMessage[], tools: ToolDef[] | null, opts: CallOptions) {
  return p.name === "nvidia"
    ? nvidiaTurn(p, model, messages, tools, opts)
    : geminiTurn(p, model, messages, tools, opts);
}

/**
 * One chat turn with optional tools, trying each provider/model in order until
 * one answers. Returns null if all fail (see lastLLMError).
 */
export async function chatWithTools(
  messages: ChatMessage[],
  tools: ToolDef[] | null,
  opts: CallOptions = {}
): Promise<ChatTurn | null> {
  for (const p of activeProviders()) {
    for (const model of p.models) {
      try {
        const t = await turn(p, model, messages, tools, opts);
        if (t && (t.content || t.toolCalls.length)) return t;
      } catch (e) {
        lastLLMError = `${p.name} ${model}: ${String(e).slice(0, 160)}`;
      }
    }
  }
  return null;
}

export interface GenerateOptions extends CallOptions {
  prompt: string;
  system?: string;
}

function buildMessages(o: GenerateOptions): ChatMessage[] {
  const system = [
    o.system,
    o.json ? "Respond with valid JSON only — no prose, no markdown code fences." : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return [
    ...(system ? [{ role: "system" as const, content: system }] : []),
    { role: "user" as const, content: o.prompt },
  ];
}

/**
 * Diagnostics: run one prompt on one specific model (no fallback) and time it.
 * Used by /api/debug/llm to verify each configured model and its latency.
 */
export async function probeModel(
  providerName: ProviderName,
  model: string,
  o: GenerateOptions
): Promise<{ ok: boolean; ms: number; json: unknown; preview: string; error?: string }> {
  const p = activeProviders().find((x) => x.name === providerName);
  if (!p) return { ok: false, ms: 0, json: null, preview: "", error: "provider not configured" };
  const started = Date.now();
  lastLLMError = "";
  const t = await turn(p, model, buildMessages(o), null, o).catch((e) => {
    lastLLMError = String(e).slice(0, 160);
    return null;
  });
  const ms = Date.now() - started;
  if (!t?.content) return { ok: false, ms, json: null, preview: "", error: lastLLMError || "empty" };
  const json = o.json ? parseLooseJSON(t.content) : null;
  return {
    ok: o.json ? json != null : true,
    ms,
    json,
    preview: t.content.slice(0, 300),
    error: o.json && json == null ? "unparseable JSON" : undefined,
  };
}

/** Plain text completion. Null if every provider/model fails. */
export async function generateText(
  o: GenerateOptions
): Promise<{ text: string; provider: ProviderName; model: string } | null> {
  const t = await chatWithTools(buildMessages(o), null, o);
  return t ? { text: t.content, provider: t.provider, model: t.model } : null;
}

/**
 * JSON completion. Unlike generateText, an answer that doesn't parse moves on
 * to the next model rather than being returned.
 */
export async function generateJSON<T = unknown>(o: GenerateOptions): Promise<T | null> {
  const messages = buildMessages({ ...o, json: true });
  for (const p of activeProviders()) {
    for (const model of p.models) {
      try {
        const t = await turn(p, model, messages, null, { ...o, json: true });
        if (!t?.content) continue;
        const parsed = parseLooseJSON<T>(t.content);
        if (parsed != null) return parsed;
        lastLLMError = `${p.name} ${model}: unparseable JSON`;
      } catch (e) {
        lastLLMError = `${p.name} ${model}: ${String(e).slice(0, 160)}`;
      }
    }
  }
  return null;
}
