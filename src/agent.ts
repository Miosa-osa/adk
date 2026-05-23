// The Agent class — runs an LLM ↔ tool-call loop until completion.

import { Miosa } from "@miosa/sdk";
import { miosaTools } from "./tools.js";
import type { MiosaToolOptions } from "./tools.js";
import type {
  AgentResult,
  AgentRunOptions,
  AgentStep,
  Provider,
  ProviderMessage,
  Tool,
} from "./types.js";

export interface AgentOptions {
  /** LLM provider (Anthropic, OpenAI, etc.). Required. */
  provider: Provider;
  /**
   * MIOSA API key (msk_u_*). When set, the default MIOSA tool catalogue
   * (sandbox lifecycle + exec + files) is registered automatically.
   * Skip if you're supplying your own tools and don't want MIOSA tools.
   */
  miosaApiKey?: string;
  /**
   * Override the MIOSA API base URL. Defaults to https://api.miosa.ai.
   */
  miosaBaseUrl?: string;
  /** Options for the default MIOSA agent tool catalogue. */
  miosaTools?: MiosaToolOptions;
  /**
   * Tools to expose to the agent. If omitted, defaults to the MIOSA
   * built-ins (requires miosaApiKey). Pass an empty array to disable
   * tools entirely.
   */
  tools?: Tool[];
}

export class Agent {
  readonly provider: Provider;
  readonly tools: Tool[];
  private readonly toolsByName: Map<string, Tool>;
  private readonly miosaClient?: Miosa;

  constructor(opts: AgentOptions) {
    this.provider = opts.provider;

    if (opts.tools !== undefined) {
      this.tools = opts.tools;
    } else if (opts.miosaApiKey) {
      this.miosaClient = new Miosa({
        apiKey: opts.miosaApiKey,
        ...(opts.miosaBaseUrl ? { baseUrl: opts.miosaBaseUrl } : {}),
      });
      this.tools = miosaTools({ client: this.miosaClient, ...opts.miosaTools });
    } else {
      throw new Error(
        "Agent: must supply either `tools` or `miosaApiKey` (to get the default MIOSA tool catalogue).",
      );
    }

    const dupes = new Set<string>();
    this.toolsByName = new Map();
    for (const t of this.tools) {
      if (dupes.has(t.name)) {
        throw new Error(`Agent: duplicate tool name '${t.name}'`);
      }
      dupes.add(t.name);
      this.toolsByName.set(t.name, t);
    }
  }

  /**
   * Run the agent loop. Returns when the model emits a turn with no
   * tool calls (end_turn), or when `maxIterations` is reached, or on
   * an unrecoverable error.
   */
  async run(opts: AgentRunOptions): Promise<AgentResult> {
    const maxIterations = opts.maxIterations ?? 10;
    const messages: ProviderMessage[] = [
      { role: "user", content: opts.prompt },
    ];
    const steps: AgentStep[] = [];
    let combinedText = "";

    for (let i = 0; i < maxIterations; i++) {
      let stepResult;
      try {
        stepResult = await this.provider.step({
          system: opts.system,
          messages,
          tools: this.tools,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          finalText: combinedText,
          steps,
          stopReason: "error",
          error: `provider step ${i} failed: ${message}`,
        };
      }

      // Append the assistant's message to the conversation, so subsequent
      // turns see this turn's text + tool calls in context.
      messages.push({
        role: "assistant",
        content: stepResult.text,
        toolCalls: stepResult.toolCalls,
      });

      // Execute any tool calls the model requested.
      const executed: AgentStep["toolCalls"] = [];
      for (const call of stepResult.toolCalls) {
        const tool = this.toolsByName.get(call.name);
        let output: string;
        let isError = false;
        if (!tool) {
          output = `Error: unknown tool '${call.name}'. Available: ${[...this.toolsByName.keys()].join(", ")}`;
          isError = true;
        } else {
          try {
            output = await tool.execute(call.input);
            // A tool can soft-fail by returning a string starting with "Error:".
            if (output.startsWith("Error:")) isError = true;
          } catch (err) {
            output = `Error executing ${call.name}: ${err instanceof Error ? err.message : String(err)}`;
            isError = true;
          }
        }

        executed.push({
          id: call.id,
          name: call.name,
          input: call.input,
          output,
          isError,
        });

        // Feed the tool result back into the conversation.
        messages.push({
          role: "tool",
          toolUseId: call.id,
          toolName: call.name,
          toolOutput: output,
          toolIsError: isError,
        });
      }

      const step: AgentStep = {
        index: i,
        text: stepResult.text,
        toolCalls: executed,
        usage: stepResult.usage,
      };
      steps.push(step);
      combinedText += stepResult.text;

      if (opts.onStep) {
        try {
          await opts.onStep(step);
        } catch {
          // onStep errors don't kill the loop.
        }
      }

      // Termination: model emitted end_turn AND made no tool calls.
      if (
        stepResult.stopReason === "end_turn" &&
        stepResult.toolCalls.length === 0
      ) {
        return { finalText: combinedText, steps, stopReason: "end_turn" };
      }

      if (stepResult.stopReason === "stop_sequence") {
        return { finalText: combinedText, steps, stopReason: "stop_sequence" };
      }

      // If the model returned no tool calls but the provider claims it's
      // still going (e.g. max_tokens hit mid-thought), bail to avoid an
      // infinite loop.
      if (
        stepResult.toolCalls.length === 0 &&
        stepResult.stopReason !== "tool_use"
      ) {
        return { finalText: combinedText, steps, stopReason: "end_turn" };
      }
    }

    return { finalText: combinedText, steps, stopReason: "max_iterations" };
  }
}
