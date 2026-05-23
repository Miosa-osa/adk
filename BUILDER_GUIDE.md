# Build Your Own Lovable With MIOSA Sandboxes

MIOSA ADK is built for products where your users type an idea and your agent
turns it into working software inside a real sandbox.

Use it to build:

- AI website builders with live previews
- AI app builders with a filesystem, terminal, logs, and dev server
- artifact builders that generate docs, reports, exports, and file bundles
- slide deck builders that render, repair, and export decks
- vertical builders for agencies, clinics, internal tools, courses, and demos

The important primitive is the sandbox. It gives the agent a real workspace:

- `/workspace` for generated source and artifacts
- shell access for installs, tests, build commands, and smoke checks
- file APIs for inspection and handoff
- preview URLs for browser-visible apps
- cleanup controls so your product can keep or destroy environments

## Minimal Website Builder

```ts
import { Agent, groqProvider, sandboxBuilderSystemPrompt } from "@miosa/adk";

const agent = new Agent({
  provider: groqProvider({
    apiKey: process.env.GROQ_API_KEY!,
    model: "moonshotai/kimi-k2-instruct-0905",
  }),
  miosaApiKey: process.env.MIOSA_API_KEY!,
  miosaTools: { allowDestroy: false },
});

const result = await agent.run({
  system: sandboxBuilderSystemPrompt("website"),
  prompt:
    "Build a landing page for a boutique gym. Run it on port 3000 and give me the preview URL.",
  maxIterations: 12,
});

console.log(result.finalText);
```

## Product Pattern

1. Create one sandbox per project or generation run.
2. Give the agent the builder preset and a user prompt.
3. Stream `onStep` events into your UI as command logs and file activity.
4. Show the preview URL in an iframe.
5. Let the user ask for revisions against the same sandbox.
6. Export, publish, snapshot, or destroy the sandbox when the user is done.

## Presets

```ts
sandboxBuilderSystemPrompt("website");
sandboxBuilderSystemPrompt("app");
sandboxBuilderSystemPrompt("artifact");
sandboxBuilderSystemPrompt("slideDeck");
```

These prompts make the agent prefer `/workspace`, run and verify outputs, return
file paths and preview URLs, and keep the sandbox alive unless the user asks to
clean it up.

## Example Prompts

Website builder:

```txt
Build a polished five-section website for a pediatric dentist. Use vanilla HTML,
CSS, and JS. Run it on port 3000 and return the preview URL.
```

App builder:

```txt
Build a lightweight CRM with contacts, search, tags, and a note field. Use the
fastest stack available in the sandbox. Start the app and return the preview URL.
```

Artifact builder:

```txt
Create a launch kit for a new local bakery: README.md, homepage-copy.md,
pricing.md, and launch-checklist.md under /workspace/artifacts.
```

Slide deck builder:

```txt
Create an investor deck for a sandbox-native AI builder. Put the source and any
exports under /workspace/deck and return the generated paths.
```

## Why Sandboxes

Browser-only builders are great for fast demos, but real products need a place
to run commands, inspect files, test builds, show previews, recover from errors,
and hand off code. MIOSA gives your agent that environment through an SDK surface
instead of making you build sandbox orchestration yourself.
