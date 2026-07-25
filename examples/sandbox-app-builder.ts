import { Agent, groqProvider, sandboxBuilderSystemPrompt } from "@miosa/adk";

const agent = new Agent({
  provider: groqProvider({
    apiKey: process.env.GROQ_API_KEY!,
    model: "moonshotai/kimi-k2-instruct-0905",
  }),
  miosaApiKey: process.env.MIOSA_API_KEY!,
  miosaTools: { defaultSize: "small", allowDestroy: false },
});

const result = await agent.run({
  maxIterations: 18,
  system: sandboxBuilderSystemPrompt("app"),
  prompt:
    "Build a tiny CRM app with a contact list, search box, add-contact form, and clean UI. " +
    "Use whatever stack is fastest in the sandbox.",
});

console.log(result.finalText);
