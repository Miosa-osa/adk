# AGENTS.md

## Package

`@miosa/adk` is the TypeScript Agent Development Kit. Its job is to let an LLM
operate MIOSA sandboxes and computers through a typed tool loop.

## Key Files

- `src/agent.ts`: agent loop and MIOSA tool wiring.
- `src/tools.ts`: built-in MIOSA sandbox/computer tools.
- `src/types.ts`: provider/tool/message contracts.
- `src/providers/`: provider adapters.
- `src/presets.ts`: sandbox builder system prompts.
- `examples/`: copy-paste builder examples.
- `BUILDER_GUIDE.md`: product guide for building Lovable-style platforms.

## Design Rules

- Keep the `Provider` interface small and vendor-neutral.
- Prefer OpenAI-compatible fetch adapters over adding heavy SDK dependencies.
- Preserve deep imports such as `@miosa/adk/providers/groq`.
- Keep `miosaTools` sandbox-first: code sandbox, files, exec, preview URL,
  cleanup controls.
- Builder examples should keep `allowDestroy: false` so previews remain usable.

## Checks

```bash
npm run build
npm publish --dry-run --access public
```

Only publish after a version bump and successful dry run.
