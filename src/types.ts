// Shared types for the MIOSA Agent Development Kit.

/**
 * One MCP-style tool the agent can call.
 *
 * `inputSchema` is plain JSON Schema (Draft 2020-12). Providers translate
 * this into their own tool-use envelope (Anthropic `tools`, OpenAI
 * `function`s, Gemini `functionDeclarations`, etc.).
 */
export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /**
   * Execute the tool call. The function receives the model-supplied
   * arguments and returns the result as a string (which becomes the
   * `tool_result` content the model sees on the next turn).
   *
   * Throw to signal an unrecoverable error; return a `Error: ...`
   * string for soft failures that should keep the loop going.
   */
  execute: (args: Record<string, unknown>) => Promise<string>;
}

/** One step the agent took inside `Agent.run()`. */
export interface AgentStep {
  /** 0-indexed iteration count. */
  index: number;
  /** Plain-text content emitted by the model this turn (concatenated). */
  text: string;
  /** Tool calls the model made on this turn, with results we returned. */
  toolCalls: Array<{
    id: string;
    name: string;
    input: Record<string, unknown>;
    output: string;
    isError: boolean;
  }>;
  /** Token usage reported by the provider for this turn. */
  usage?: { inputTokens: number; outputTokens: number };
}

/** Final result returned by `Agent.run()`. */
export interface AgentResult {
  /** All text the model produced across all turns, concatenated. */
  finalText: string;
  /** Step-by-step trace of every turn the agent took. */
  steps: AgentStep[];
  /** Reason the loop ended. */
  stopReason: "end_turn" | "max_iterations" | "stop_sequence" | "error";
  /** If `stopReason === "error"`, the error message. */
  error?: string;
}

/** What `Agent.run()` accepts. */
export interface AgentRunOptions {
  /** The initial user prompt. */
  prompt: string;
  /** Optional system prompt prepended to the conversation. */
  system?: string;
  /** Stop the loop after this many model turns. Default 10. */
  maxIterations?: number;
  /** Called after every step. Useful for streaming UIs. */
  onStep?: (step: AgentStep) => void | Promise<void>;
}

/**
 * A provider abstracts an LLM that supports tool calls. Implementations
 * exist for Anthropic (`@miosa/adk/providers/anthropic`); add your own
 * for any other model endpoint by conforming to this interface.
 */
export interface Provider {
  /** Human label, e.g. "anthropic". */
  readonly name: string;
  /** Model identifier, e.g. "claude-opus-4-7". */
  readonly model: string;
  /**
   * Run one inference turn. Takes the conversation history and tool
   * catalogue, returns the model's next message: optional text plus
   * zero or more tool calls.
   */
  step(args: ProviderStepArgs): Promise<ProviderStepResult>;
}

export interface ProviderMessage {
  role: "user" | "assistant" | "tool";
  /** For user/assistant: free text. For tool: must be set together with toolUseId. */
  content?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    input: Record<string, unknown>;
  }>;
  toolUseId?: string;
  toolName?: string;
  toolOutput?: string;
  toolIsError?: boolean;
}

export interface ProviderStepArgs {
  system?: string;
  messages: ProviderMessage[];
  tools: Tool[];
}

export interface ProviderStepResult {
  text: string;
  toolCalls: Array<{
    id: string;
    name: string;
    input: Record<string, unknown>;
  }>;
  stopReason:
    | "end_turn"
    | "tool_use"
    | "max_tokens"
    | "stop_sequence"
    | "other";
  usage?: { inputTokens: number; outputTokens: number };
}
