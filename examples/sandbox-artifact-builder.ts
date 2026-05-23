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
  maxIterations: 14,
  system: sandboxBuilderSystemPrompt("artifact"),
  prompt:
    "Create a launch-plan artifact pack for a new AI website builder: README.md, " +
    "pricing.md, launch-checklist.md, and a sample customer-onboarding email. " +
    "List the generated files and summarize the contents.",
});

console.log(result.finalText);
