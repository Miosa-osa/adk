import { Agent, groqProvider, sandboxBuilderSystemPrompt } from "@miosa/adk";

const agent = new Agent({
  provider: groqProvider({
    apiKey: process.env.GROQ_API_KEY!,
    model: "moonshotai/kimi-k2-instruct-0905",
  }),
  miosaApiKey: process.env.MIOSA_API_KEY!,
  miosaTools: { defaultSize: "medium", allowDestroy: false },
});

const result = await agent.run({
  maxIterations: 16,
  system: sandboxBuilderSystemPrompt("slideDeck"),
  prompt:
    "Build a 7-slide investor deck for a sandbox-native AI app builder. Make it concise, " +
    "visual, and ready to export. Return the file paths and preview instructions.",
});

console.log(result.finalText);
