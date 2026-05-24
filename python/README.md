# miosa-adk Python

Python Agent Development Kit for MIOSA sandboxes.

Use this when you want an LLM agent to create a sandbox, write files, run
commands, start a dev server, and return a preview URL.

## Install

```bash
pip install "miosa-adk @ git+https://github.com/Miosa-osa/adk.git#subdirectory=python"
```

If you want the built-in MIOSA sandbox/computer tools, install the MIOSA Python
SDK as well. Until the MIOSA Python SDK is published to PyPI, use your local SDK
checkout or install it through the package source your team uses internally.

Once both packages are published to PyPI, the intended install is:

```bash
pip install miosa miosa-adk
```

## Website Builder Example

```python
import os
from miosa_adk import Agent, groq_provider, sandbox_builder_system_prompt

agent = Agent(
    provider=groq_provider(
        api_key=os.environ["GROQ_API_KEY"],
        model="moonshotai/kimi-k2-instruct-0905",
    ),
    miosa_api_key=os.environ["MIOSA_API_KEY"],
    miosa_tool_options={"allow_destroy": False},
)

result = agent.run(
    "Build a one-page site for a boutique gym. Run it on port 3000 and return the preview URL.",
    system=sandbox_builder_system_prompt("website"),
    max_iterations=12,
)

print(result.final_text)
```

## Provider Factories

- `openai_provider`
- `groq_provider`
- `deepseek_provider`
- `openrouter_provider`
- `together_provider`
- `fireworks_provider`
- `mistral_provider`
- `cerebras_provider`
- `perplexity_provider`
- `xai_provider`
- `ollama_provider`
- `lm_studio_provider`
- `openai_compatible_provider`

## Builder Presets

```python
sandbox_builder_system_prompt("website")
sandbox_builder_system_prompt("app")
sandbox_builder_system_prompt("artifact")
sandbox_builder_system_prompt("slide_deck")
```

## Examples

See `examples/` for website, app, artifact, and slide deck builders.
