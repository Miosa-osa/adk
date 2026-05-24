# MIOSA ADK

**Agent Development Kit for MIOSA.** Build LLM agents that natively use MIOSA
sandboxes, desktops, and deploys with the tool-call loop already wired.

This repo contains:

- TypeScript package: `@miosa/adk`
- Python package: `miosa-adk`

The core use case is building your own Lovable-style products: AI website
builders, app builders, artifact builders, slide deck builders, and vertical
prompt-to-app tools.

## Install

```bash
npm install @miosa/adk
pip install "miosa-adk @ git+https://github.com/Miosa-osa/adk.git#subdirectory=python"
```

For Python, the built-in MIOSA sandbox/computer tools require the MIOSA Python
SDK to be installed separately. The ADK package itself can still be imported
without it, which is useful for custom tool catalogues and provider adapters.

## TypeScript 30-second example

```typescript
import { Agent, groqProvider } from "@miosa/adk";

const agent = new Agent({
  provider: groqProvider({
    apiKey: process.env.GROQ_API_KEY!,
    model: "moonshotai/kimi-k2-instruct-0905",
  }),
  miosaApiKey: process.env.MIOSA_API_KEY!,
});

const result = await agent.run({
  prompt:
    "Create a MIOSA sandbox, write a Python hello-world to /tmp/hello.py, run it, then destroy the sandbox.",
  maxIterations: 10,
});

console.log(result.finalText);
console.log(`Took ${result.steps.length} turns. Stopped because: ${result.stopReason}`);
```

That's it. The agent will boot a sandbox, write the file, run it, print the
output, destroy the sandbox, and return. No tool-loop boilerplate.

## Python 30-second example

```python
import os
from miosa_adk import Agent, groq_provider

agent = Agent(
    provider=groq_provider(
        api_key=os.environ["GROQ_API_KEY"],
        model="moonshotai/kimi-k2-instruct-0905",
    ),
    miosa_api_key=os.environ["MIOSA_API_KEY"],
)

result = agent.run(
    "Create a MIOSA sandbox, write a Python hello-world to /tmp/hello.py, "
    "run it, then destroy the sandbox.",
    max_iterations=10,
)

print(result.final_text)
```

## ADK vs SDK — what's the difference

- `@miosa/sdk` is a thin wrapper around the MIOSA REST API. You call methods
  directly (`client.computers.create(...)`).
- `@miosa/adk` is the agent layer. It bakes in the MIOSA tool catalogue
  (sandbox / desktop / files / exec) and the model-loop, so an LLM can drive
  MIOSA end-to-end with zero glue from you.

Use the SDK when you're writing application code that talks to MIOSA.
Use the ADK when you're building an **agent** that should use MIOSA as
its execution substrate.

Python details live in [`python/`](./python).

## Built-in MIOSA tools

When you pass `miosaApiKey`, the agent gets these tools out of the box:

| Tool | Does |
|------|------|
| `create_sandbox` | Boot a fast code sandbox computer (Python + Node + shell). |
| `create_computer` | Boot a general MIOSA computer for GUI, services, previews, files. |
| `create_desktop` | Boot a full Xfce desktop (KasmVNC). |
| `list_sandboxes` | List active computers, sandboxes, and desktops. |
| `get_sandbox` / `get_computer` | Fetch one computer by id (status / template / size). |
| `exec` | Run a bash command. |
| `exec_python` | Run a Python snippet inline. |
| `read_file` | Read a file from the VM. |
| `write_file` | Write a file inside the VM. |
| `list_files` | List a directory inside the VM. |
| `preview_url` | Get the public HTTPS URL for a service running on a port. |
| `destroy_sandbox` / `destroy_computer` | Delete a computer and release resources. |

Tool defaults are configurable:

```typescript
import { Miosa } from "@miosa/sdk";
import { miosaTools } from "@miosa/adk";

const tools = miosaTools({
  client: new Miosa({ apiKey: process.env.MIOSA_API_KEY! }),
  sandboxTemplate: "debian-12-sandbox-v8",
  computerTemplate: "miosa-desktop",
  defaultSize: "medium",
  allowDestroy: false,
});
```

Get an API key at <https://miosa.ai/dashboard/api-keys>.

## Custom tools

Compose your own tool catalogue alongside (or instead of) the MIOSA tools:

```typescript
import { Agent, anthropicProvider, miosaTools, type Tool } from "@miosa/adk";
import { Miosa } from "@miosa/sdk";

const miosa = new Miosa({ apiKey: process.env.MIOSA_API_KEY! });

const sendSlack: Tool = {
  name: "send_slack",
  description: "Post a message to the #builds Slack channel.",
  inputSchema: {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
  },
  async execute(args) {
    // ... your Slack call ...
    return `Sent: ${args["text"]}`;
  },
};

const agent = new Agent({
  provider: anthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY! }),
  tools: [...miosaTools({ client: miosa }), sendSlack],
});
```

## Providers

`@miosa/adk` ships with native tool-call providers for hosted and local models:

| Provider | Factory | Import |
|---|---|---|
| Anthropic | `anthropicProvider` | `@miosa/adk` or `@miosa/adk/providers/anthropic` |
| OpenAI | `openAIProvider` | `@miosa/adk` or `@miosa/adk/providers/openai` |
| Google Gemini | `geminiProvider` | `@miosa/adk` or `@miosa/adk/providers/gemini` |
| Groq | `groqProvider` | `@miosa/adk` or `@miosa/adk/providers/groq` |
| DeepSeek | `deepSeekProvider` | `@miosa/adk` or `@miosa/adk/providers/deepseek` |
| OpenRouter | `openRouterProvider` | `@miosa/adk` or `@miosa/adk/providers/openrouter` |
| Together | `togetherProvider` | `@miosa/adk` or `@miosa/adk/providers/together` |
| Fireworks | `fireworksProvider` | `@miosa/adk` or `@miosa/adk/providers/fireworks` |
| Mistral | `mistralProvider` | `@miosa/adk` or `@miosa/adk/providers/mistral` |
| Cerebras | `cerebrasProvider` | `@miosa/adk` or `@miosa/adk/providers/cerebras` |
| Perplexity | `perplexityProvider` | `@miosa/adk` or `@miosa/adk/providers/perplexity` |
| xAI | `xAIProvider` | `@miosa/adk` or `@miosa/adk/providers/xai` |
| Ollama | `ollamaProvider` | `@miosa/adk` or `@miosa/adk/providers/ollama` |
| LM Studio | `lmStudioProvider` | `@miosa/adk` or `@miosa/adk/providers/lmstudio` |

Most hosted providers expose an OpenAI-compatible chat completions endpoint, so
the ADK uses a lightweight fetch adapter instead of forcing every vendor SDK
into your install.

```typescript
import {
  Agent,
  openAIProvider,
  geminiProvider,
  ollamaProvider,
  openAICompatibleProvider,
} from "@miosa/adk";

const openai = openAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-4.1",
});

const gemini = geminiProvider({
  apiKey: process.env.GEMINI_API_KEY!,
  model: "gemini-2.5-pro",
});

const local = ollamaProvider({
  model: "qwen2.5-coder:32b",
});

const custom = openAICompatibleProvider({
  name: "internal-router",
  baseUrl: "https://llm.example.com/v1/chat/completions",
  apiKey: process.env.INTERNAL_LLM_KEY,
  model: "best-agent-model",
});

const agent = new Agent({ provider: openai, miosaApiKey: process.env.MIOSA_API_KEY! });
```

## Sandbox Builder Examples

The primary ADK use case is letting customers build their own AI builders:
website builders, app builders, artifact builders, slide deck builders, and
other tools that need a real filesystem, shell, dev server, and preview URL.

See [BUILDER_GUIDE.md](./BUILDER_GUIDE.md) for the full “build your own
Lovable with MIOSA sandboxes” product pattern.

Runnable examples live in `examples/`:

| Example | What it builds |
|---|---|
| `sandbox-website-builder.ts` | A Lovable-style website builder flow. |
| `sandbox-app-builder.ts` | A small app builder with a dev server and preview. |
| `sandbox-artifact-builder.ts` | Markdown/doc artifacts written to `/workspace/artifacts`. |
| `sandbox-slide-deck-builder.ts` | A deck workspace under `/workspace/deck`. |

Each example keeps the sandbox alive with `miosaTools: { allowDestroy: false }`
so your product can show the preview, inspect files, or publish later.

## Streaming step events

```typescript
const result = await agent.run({
  prompt: "...",
  onStep: (step) => {
    console.log(`[turn ${step.index}] text: ${step.text}`);
    for (const call of step.toolCalls) {
      console.log(`  → ${call.name}(${JSON.stringify(call.input)}) → ${call.output.slice(0, 80)}`);
    }
  },
});
```

## License

MIT.
