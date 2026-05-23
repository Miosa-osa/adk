// OpenAI-compatible Chat Completions providers for the MIOSA ADK.
//
// This covers OpenAI plus providers exposing the same /chat/completions
// contract: Groq, DeepSeek, OpenRouter, Together, Fireworks, Mistral,
// Cerebras, Perplexity, xAI, Ollama, and LM Studio.

import type {
  Provider,
  ProviderStepArgs,
  ProviderStepResult,
  Tool,
} from "../types.js";

export interface OpenAICompatibleProviderOptions {
  /** Provider label shown in traces. */
  name?: string;
  /** API key. Omit for local providers such as Ollama/LM Studio. */
  apiKey?: string;
  /** Model identifier for the target provider. */
  model: string;
  /** Full chat completions endpoint. */
  baseUrl?: string;
  /** Max output tokens per turn. */
  maxTokens?: number;
  /** Sampling temperature. */
  temperature?: number;
  /** Extra request headers, e.g. OpenRouter attribution headers. */
  headers?: Record<string, string>;
  /** Custom fetch implementation for tests or runtimes. */
  fetch?: typeof fetch;
}

export type NamedProviderOptions = Omit<
  OpenAICompatibleProviderOptions,
  "name" | "baseUrl"
> & {
  /** Override the default endpoint. */
  baseUrl?: string;
};

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

interface ChatCompletionResponse {
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | null | Array<{ type?: string; text?: string }>;
      tool_calls?: Array<{
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
  };
  error?: { message?: string; type?: string; code?: string | number };
}

export function openAICompatibleProvider(
  opts: OpenAICompatibleProviderOptions,
): Provider {
  const name = opts.name ?? "openai-compatible";
  const model = opts.model;
  const baseUrl = opts.baseUrl ?? "https://api.openai.com/v1/chat/completions";
  const maxTokens = opts.maxTokens ?? 4096;
  const requestFetch = opts.fetch ?? fetch;

  return {
    name,
    model,
    async step(args: ProviderStepArgs): Promise<ProviderStepResult> {
      const response = await requestFetch(baseUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}),
          ...opts.headers,
        },
        body: JSON.stringify({
          model,
          messages: toChatMessages(args),
          tools: args.tools.length > 0 ? args.tools.map(toChatTool) : undefined,
          tool_choice: args.tools.length > 0 ? "auto" : undefined,
          max_tokens: maxTokens,
          ...(opts.temperature !== undefined
            ? { temperature: opts.temperature }
            : {}),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as
        | ChatCompletionResponse
        | Record<string, unknown>;

      if (!response.ok) {
        throw new Error(formatProviderError(name, response.status, payload));
      }

      const data = payload as ChatCompletionResponse;
      const choice = data.choices?.[0];
      const message = choice?.message;
      if (!choice || !message) {
        throw new Error(`${name}: response did not include a chat choice`);
      }

      const toolCalls =
        message.tool_calls?.map((call, index) => ({
          id: call.id ?? `call_${index}`,
          name: call.function?.name ?? "",
          input: parseToolArguments(call.function?.arguments ?? "{}"),
        })) ?? [];

      return {
        text: contentToText(message.content),
        toolCalls: toolCalls.filter((call) => call.name.length > 0),
        stopReason: mapFinishReason(choice.finish_reason, toolCalls.length),
        usage:
          data.usage === undefined
            ? undefined
            : {
                inputTokens:
                  data.usage.prompt_tokens ?? data.usage.input_tokens ?? 0,
                outputTokens:
                  data.usage.completion_tokens ??
                  data.usage.output_tokens ??
                  0,
              },
      };
    },
  };
}

export function openAIProvider(opts: NamedProviderOptions): Provider {
  return openAICompatibleProvider({
    name: "openai",
    baseUrl: opts.baseUrl ?? "https://api.openai.com/v1/chat/completions",
    ...opts,
  });
}

export function groqProvider(opts: NamedProviderOptions): Provider {
  return openAICompatibleProvider({
    name: "groq",
    baseUrl: opts.baseUrl ?? "https://api.groq.com/openai/v1/chat/completions",
    ...opts,
  });
}

export function deepSeekProvider(opts: NamedProviderOptions): Provider {
  return openAICompatibleProvider({
    name: "deepseek",
    baseUrl: opts.baseUrl ?? "https://api.deepseek.com/chat/completions",
    ...opts,
  });
}

export function openRouterProvider(opts: NamedProviderOptions): Provider {
  return openAICompatibleProvider({
    name: "openrouter",
    baseUrl: opts.baseUrl ?? "https://openrouter.ai/api/v1/chat/completions",
    ...opts,
  });
}

export function togetherProvider(opts: NamedProviderOptions): Provider {
  return openAICompatibleProvider({
    name: "together",
    baseUrl: opts.baseUrl ?? "https://api.together.xyz/v1/chat/completions",
    ...opts,
  });
}

export function fireworksProvider(opts: NamedProviderOptions): Provider {
  return openAICompatibleProvider({
    name: "fireworks",
    baseUrl:
      opts.baseUrl ?? "https://api.fireworks.ai/inference/v1/chat/completions",
    ...opts,
  });
}

export function mistralProvider(opts: NamedProviderOptions): Provider {
  return openAICompatibleProvider({
    name: "mistral",
    baseUrl: opts.baseUrl ?? "https://api.mistral.ai/v1/chat/completions",
    ...opts,
  });
}

export function cerebrasProvider(opts: NamedProviderOptions): Provider {
  return openAICompatibleProvider({
    name: "cerebras",
    baseUrl: opts.baseUrl ?? "https://api.cerebras.ai/v1/chat/completions",
    ...opts,
  });
}

export function perplexityProvider(opts: NamedProviderOptions): Provider {
  return openAICompatibleProvider({
    name: "perplexity",
    baseUrl: opts.baseUrl ?? "https://api.perplexity.ai/chat/completions",
    ...opts,
  });
}

export function xAIProvider(opts: NamedProviderOptions): Provider {
  return openAICompatibleProvider({
    name: "xai",
    baseUrl: opts.baseUrl ?? "https://api.x.ai/v1/chat/completions",
    ...opts,
  });
}

export function ollamaProvider(
  opts: Omit<NamedProviderOptions, "apiKey"> & { apiKey?: string },
): Provider {
  return openAICompatibleProvider({
    name: "ollama",
    baseUrl: opts.baseUrl ?? "http://localhost:11434/v1/chat/completions",
    ...opts,
  });
}

export function lmStudioProvider(
  opts: Omit<NamedProviderOptions, "apiKey"> & { apiKey?: string },
): Provider {
  return openAICompatibleProvider({
    name: "lmstudio",
    baseUrl: opts.baseUrl ?? "http://localhost:1234/v1/chat/completions",
    ...opts,
  });
}

function toChatMessages(args: ProviderStepArgs): ChatMessage[] {
  const out: ChatMessage[] = [];
  if (args.system) out.push({ role: "system", content: args.system });

  for (const m of args.messages) {
    if (m.role === "tool") {
      out.push({
        role: "tool",
        tool_call_id: m.toolUseId ?? "",
        content: m.toolOutput ?? "",
      });
    } else if (m.role === "assistant") {
      out.push({
        role: "assistant",
        content: m.content && m.content.length > 0 ? m.content : null,
        tool_calls: m.toolCalls?.map((call) => ({
          id: call.id,
          type: "function",
          function: {
            name: call.name,
            arguments: JSON.stringify(call.input),
          },
        })),
      });
    } else {
      out.push({ role: "user", content: m.content ?? "" });
    }
  }

  return out;
}

function toChatTool(tool: Tool): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  };
}

function contentToText(
  content: string | null | Array<{ type?: string; text?: string }> | undefined,
): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part.type === "text" || part.text ? part.text ?? "" : ""))
    .join("");
}

function parseToolArguments(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return { raw };
  }
}

function mapFinishReason(
  reason: string | null | undefined,
  toolCallCount: number,
): ProviderStepResult["stopReason"] {
  if (toolCallCount > 0) return "tool_use";
  switch (reason) {
    case "stop":
      return "end_turn";
    case "tool_calls":
    case "function_call":
      return "tool_use";
    case "length":
      return "max_tokens";
    default:
      return "other";
  }
}

function formatProviderError(
  name: string,
  status: number,
  payload: Record<string, unknown> | ChatCompletionResponse,
): string {
  const error = "error" in payload ? payload.error : undefined;
  if (error && typeof error === "object" && "message" in error) {
    return `${name}: HTTP ${status}: ${String(error.message)}`;
  }
  return `${name}: HTTP ${status}`;
}
