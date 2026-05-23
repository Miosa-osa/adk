// Anthropic provider for the MIOSA ADK.
//
// Implements the `Provider` interface using the @anthropic-ai/sdk
// Messages API with native tool-use.

import Anthropic from "@anthropic-ai/sdk";
import type {
  Provider,
  ProviderMessage,
  ProviderStepArgs,
  ProviderStepResult,
} from "../types.js";

export interface AnthropicProviderOptions {
  /** Existing Anthropic client, OR an apiKey to instantiate one. */
  client?: Anthropic;
  apiKey?: string;
  /** Model identifier. Defaults to claude-opus-4-7. */
  model?: string;
  /** Max output tokens per turn. Defaults to 4096. */
  maxTokens?: number;
}

/**
 * Create an Anthropic provider for use with `new Agent({ provider })`.
 *
 * Example:
 *
 *     import { Agent } from '@miosa/adk';
 *     import { anthropicProvider } from '@miosa/adk/providers/anthropic';
 *
 *     const agent = new Agent({
 *       provider: anthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY!, model: 'claude-opus-4-7' }),
 *       miosaApiKey: process.env.MIOSA_API_KEY!,
 *     });
 */
export function anthropicProvider(opts: AnthropicProviderOptions): Provider {
  const client = opts.client ?? new Anthropic({ apiKey: opts.apiKey });
  const model = opts.model ?? "claude-opus-4-7";
  const maxTokens = opts.maxTokens ?? 4096;

  return {
    name: "anthropic",
    model,
    async step(args: ProviderStepArgs): Promise<ProviderStepResult> {
      const anthropicMessages = toAnthropicMessages(args.messages);
      const anthropicTools = args.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Record<string, unknown>,
      }));

      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: args.system,
        tools: anthropicTools as Anthropic.Tool[],
        messages: anthropicMessages,
      });

      let text = "";
      const toolCalls: Array<{
        id: string;
        name: string;
        input: Record<string, unknown>;
      }> = [];

      for (const block of response.content) {
        if (block.type === "text") {
          text += block.text;
        } else if (block.type === "tool_use") {
          toolCalls.push({
            id: block.id,
            name: block.name,
            input: (block.input ?? {}) as Record<string, unknown>,
          });
        }
      }

      const stopReason = mapStopReason(response.stop_reason);

      return {
        text,
        toolCalls,
        stopReason,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    },
  };
}

type ContentBlock =
  | Anthropic.TextBlockParam
  | Anthropic.ImageBlockParam
  | Anthropic.ToolUseBlockParam
  | Anthropic.ToolResultBlockParam;

function toAnthropicMessages(
  messages: ProviderMessage[],
): Anthropic.MessageParam[] {
  // Anthropic accepts only 'user' and 'assistant' roles. Tool results
  // belong inside a 'user' message as `tool_result` content blocks.
  // We coalesce consecutive tool messages into a single user turn.
  const out: Anthropic.MessageParam[] = [];

  for (const m of messages) {
    if (m.role === "tool") {
      const last = out[out.length - 1];
      const block: Anthropic.ToolResultBlockParam = {
        type: "tool_result",
        tool_use_id: m.toolUseId ?? "",
        content: m.toolOutput ?? "",
        ...(m.toolIsError ? { is_error: true } : {}),
      };
      if (last && last.role === "user" && Array.isArray(last.content)) {
        (last.content as ContentBlock[]).push(block);
      } else {
        out.push({ role: "user", content: [block] });
      }
    } else if (m.role === "user") {
      out.push({ role: "user", content: m.content ?? "" });
    } else {
      // assistant — may carry text + tool_use blocks
      const blocks: ContentBlock[] = [];
      if (m.content && m.content.length > 0) {
        blocks.push({ type: "text", text: m.content });
      }
      if (m.toolCalls && m.toolCalls.length > 0) {
        for (const tc of m.toolCalls) {
          blocks.push({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: tc.input,
          });
        }
      }
      const firstBlock = blocks[0];
      out.push({
        role: "assistant",
        content:
          blocks.length === 1 && firstBlock && firstBlock.type === "text"
            ? firstBlock.text
            : blocks,
      });
    }
  }

  return out;
}

function mapStopReason(
  reason: string | null,
): ProviderStepResult["stopReason"] {
  switch (reason) {
    case "end_turn":
      return "end_turn";
    case "tool_use":
      return "tool_use";
    case "max_tokens":
      return "max_tokens";
    case "stop_sequence":
      return "stop_sequence";
    default:
      return "other";
  }
}
