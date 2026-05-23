// Google Gemini provider for the MIOSA ADK.
//
// Uses Gemini's native generateContent API with function calling.

import type {
  Provider,
  ProviderMessage,
  ProviderStepArgs,
  ProviderStepResult,
  Tool,
} from "../types.js";

export interface GeminiProviderOptions {
  apiKey: string;
  /** Model identifier. Defaults to gemini-2.5-pro. */
  model?: string;
  /** Max output tokens per turn. */
  maxTokens?: number;
  /** Sampling temperature. */
  temperature?: number;
  /** Override the API base URL. */
  baseUrl?: string;
  /** Custom fetch implementation for tests or runtimes. */
  fetch?: typeof fetch;
}

interface GeminiPart {
  text?: string;
  functionCall?: { name?: string; args?: Record<string, unknown> };
  functionResponse?: {
    name: string;
    response: Record<string, unknown>;
  };
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiResponse {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: GeminiPart[] };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
  error?: { message?: string; status?: string; code?: number };
}

export function geminiProvider(opts: GeminiProviderOptions): Provider {
  const model = opts.model ?? "gemini-2.5-pro";
  const baseUrl = opts.baseUrl ?? "https://generativelanguage.googleapis.com";
  const maxTokens = opts.maxTokens ?? 4096;
  const requestFetch = opts.fetch ?? fetch;

  return {
    name: "gemini",
    model,
    async step(args: ProviderStepArgs): Promise<ProviderStepResult> {
      const endpoint = `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;
      const response = await requestFetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(args.system
            ? { systemInstruction: { parts: [{ text: args.system }] } }
            : {}),
          contents: toGeminiContents(args.messages),
          tools:
            args.tools.length > 0
              ? [{ functionDeclarations: args.tools.map(toGeminiTool) }]
              : undefined,
          generationConfig: {
            maxOutputTokens: maxTokens,
            ...(opts.temperature !== undefined
              ? { temperature: opts.temperature }
              : {}),
          },
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as
        | GeminiResponse
        | Record<string, unknown>;

      if (!response.ok) {
        throw new Error(formatGeminiError(response.status, payload));
      }

      const data = payload as GeminiResponse;
      const candidate = data.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];
      const toolCalls = parts
        .filter((part) => part.functionCall?.name)
        .map((part, index) => ({
          id: `gemini_${index}_${part.functionCall?.name ?? "tool"}`,
          name: part.functionCall?.name ?? "",
          input: part.functionCall?.args ?? {},
        }));

      return {
        text: parts.map((part) => part.text ?? "").join(""),
        toolCalls,
        stopReason: mapFinishReason(candidate?.finishReason, toolCalls.length),
        usage:
          data.usageMetadata === undefined
            ? undefined
            : {
                inputTokens: data.usageMetadata.promptTokenCount ?? 0,
                outputTokens: data.usageMetadata.candidatesTokenCount ?? 0,
              },
      };
    },
  };
}

function toGeminiContents(messages: ProviderMessage[]): GeminiContent[] {
  const out: GeminiContent[] = [];

  for (const m of messages) {
    if (m.role === "tool") {
      out.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: m.toolName ?? m.toolUseId ?? "tool",
              response: {
                content: m.toolOutput ?? "",
                ...(m.toolIsError ? { isError: true } : {}),
              },
            },
          },
        ],
      });
    } else if (m.role === "assistant") {
      const parts: GeminiPart[] = [];
      if (m.content && m.content.length > 0) parts.push({ text: m.content });
      for (const call of m.toolCalls ?? []) {
        parts.push({ functionCall: { name: call.name, args: call.input } });
      }
      out.push({ role: "model", parts });
    } else {
      out.push({ role: "user", parts: [{ text: m.content ?? "" }] });
    }
  }

  return out;
}

function toGeminiTool(tool: Tool): Record<string, unknown> {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
  };
}

function mapFinishReason(
  reason: string | undefined,
  toolCallCount: number,
): ProviderStepResult["stopReason"] {
  if (toolCallCount > 0) return "tool_use";
  switch (reason) {
    case "STOP":
      return "end_turn";
    case "MAX_TOKENS":
      return "max_tokens";
    default:
      return "other";
  }
}

function formatGeminiError(
  status: number,
  payload: Record<string, unknown> | GeminiResponse,
): string {
  const error = "error" in payload ? payload.error : undefined;
  if (error && typeof error === "object" && "message" in error) {
    return `gemini: HTTP ${status}: ${String(error.message)}`;
  }
  return `gemini: HTTP ${status}`;
}
