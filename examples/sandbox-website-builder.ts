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
  maxIterations: 12,
  system: sandboxBuilderSystemPrompt("website"),
  prompt:
    "Build a polished one-page website for a local dental clinic. Use a single index.html " +
    "with CSS and JS, run it on port 3000, and give me the preview URL.",
});

console.log(result.finalText);
