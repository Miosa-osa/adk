import assert from "node:assert/strict";
import test from "node:test";

import { miosaTools } from "../dist/tools.js";

const canonicalSizes = ["xs", "small", "medium", "large", "xl"];

function tool(tools, name) {
  const match = tools.find((candidate) => candidate.name === name);
  assert.ok(match, `missing ${name} tool`);
  return match;
}

test("creation tools expose only canonical sizes", () => {
  const tools = miosaTools({
    client: { computers: {} },
    allowDestroy: false,
  });

  for (const name of ["create_sandbox", "create_computer", "create_desktop"]) {
    const size = tool(tools, name).inputSchema.properties.size;
    assert.deepEqual(size.enum, canonicalSizes);
  }
});

test("creation tools send canonical sizes and default to small", async () => {
  const sandboxCreates = [];
  const computerCreates = [];
  const client = {
    sandboxes: {
      async createAgentWorkspace(input) {
        sandboxCreates.push(input);
        return { id: "sandbox-1", state: "running" };
      },
    },
    computers: {
      async create(input) {
        computerCreates.push(input);
        return { id: "computer-1", status: "active" };
      },
    },
  };
  const tools = miosaTools({ client });

  await tool(tools, "create_sandbox").execute({ name: "agent", size: "xlarge" });
  await tool(tools, "create_desktop").execute({ name: "desktop" });

  assert.equal(sandboxCreates[0].size, "xl");
  assert.equal(sandboxCreates[0].templateId, "debian-12-sandbox-v8");
  assert.equal(computerCreates[0].size, "small");
  assert.equal(computerCreates[0].template_type, "miosa-desktop");
});
