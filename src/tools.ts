// Pre-built MIOSA tools for the agent. Each wraps a piece of the MIOSA
// REST API (via @miosa/sdk) and surfaces it as a Tool the agent can call.

import type { Miosa } from "@miosa/sdk";
import type { Tool } from "./types.js";

type ComputerSize = "small" | "medium" | "large";

export interface MiosaToolOptions {
  /** Default template for create_sandbox. */
  sandboxTemplate?: string;
  /** Default template for create_computer/create_desktop. */
  computerTemplate?: string;
  /** Default VM size. */
  defaultSize?: ComputerSize;
  /** Hide destructive lifecycle tools from the model. */
  allowDestroy?: boolean;
}

interface ToolFactoryOptions extends MiosaToolOptions {
  /** Live MIOSA SDK client. */
  client: Miosa;
}

function asSize(v: unknown, fallback: ComputerSize): ComputerSize {
  return v === "small" || v === "medium" || v === "large" ? v : fallback;
}

/**
 * Build the default MIOSA tool catalogue. Hand this to `new Agent({ tools: ... })`
 * to give the agent end-to-end MIOSA capability: create sandboxes, run code,
 * read/write files, take desktop screenshots, list deployments.
 */
export function miosaTools(opts: ToolFactoryOptions): Tool[] {
  const { client } = opts;
  const sandboxTemplate = opts.sandboxTemplate ?? "debian-12-sandbox-v8";
  const computerTemplate = opts.computerTemplate ?? "miosa-desktop";
  const defaultSize = opts.defaultSize ?? "small";
  const allowDestroy = opts.allowDestroy ?? true;

  // ── Lifecycle ────────────────────────────────────────────────────────────

  const create_sandbox: Tool = {
    name: "create_sandbox",
    description:
      "Boot a fast MIOSA code sandbox computer for agent work (Python, Node, shell, files). Use this for coding, tests, scripts, scraping without GUI, and build tasks. Returns the computer/sandbox id. Poll `get_computer` until status is active/running before exec.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Human-readable label" },
        size: {
          type: "string",
          enum: ["small", "medium", "large", "xlarge"],
          default: "small",
        },
      },
      required: ["name"],
    },
    async execute(args) {
      const name = String(args["name"] ?? "");
      const size = asSize(args["size"], "small");
      const computer = await client.computers.create({
        name,
        size,
        template_type: sandboxTemplate,
      });
      return `Created sandbox id=${computer.id} status=${computer.status ?? "provisioning"}.`;
    },
  };

  const create_computer: Tool = {
    name: "create_computer",
    description:
      "Boot a general MIOSA computer. Use this when the agent needs a durable VM, GUI desktop, services, previews, files, terminals, browser automation, or anything beyond quick code execution.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Human-readable label" },
        template_type: {
          type: "string",
          description:
            "MIOSA template slug. Defaults to the SDK configured computer template.",
        },
        size: {
          type: "string",
          enum: ["small", "medium", "large", "xlarge"],
          default: defaultSize,
        },
      },
      required: ["name"],
    },
    async execute(args) {
      const name = String(args["name"] ?? "");
      const size = asSize(args["size"], defaultSize);
      const templateType = String(args["template_type"] ?? computerTemplate);
      const computer = await client.computers.create({
        name,
        size,
        template_type: templateType,
      });
      return `Created computer id=${computer.id} status=${computer.status ?? "provisioning"} template=${templateType}.`;
    },
  };

  const create_desktop: Tool = {
    name: "create_desktop",
    description:
      "Boot a MIOSA full Linux desktop (Xfce + KasmVNC). Use when you need a GUI (browser automation, scraping behind login, OCR). Returns the computer id.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        size: {
          type: "string",
          enum: ["small", "medium", "large", "xlarge"],
          default: "medium",
        },
      },
      required: ["name"],
    },
    async execute(args) {
      const name = String(args["name"] ?? "");
      const size = asSize(args["size"], "medium");
      const computer = await client.computers.create({
        name,
        size,
        template_type: computerTemplate,
      });
      return `Created desktop id=${computer.id} status=${computer.status ?? "provisioning"}.`;
    },
  };

  const list_sandboxes: Tool = {
    name: "list_sandboxes",
    description: "List active MIOSA computers, sandboxes, and desktops.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      const computers = await client.computers.list();
      if (!computers || computers.length === 0) return "No sandboxes.";
      return computers
        .map(
          (c) =>
            `${c.id}  ${c.status ?? "?"}  ${c.data.template_type ?? "?"}  ${c.name}`,
        )
        .join("\n");
    },
  };

  const get_sandbox: Tool = {
    name: "get_sandbox",
    description:
      "Fetch one sandbox/computer/desktop by id. Returns status and template. Use after create_sandbox/create_computer until status is active/running.",
    inputSchema: {
      type: "object",
      properties: { sandbox_id: { type: "string" } },
      required: ["sandbox_id"],
    },
    async execute(args) {
      const id = String(args["sandbox_id"] ?? "");
      const c = await client.computers.get(id);
      return `id=${c.id} status=${c.status ?? "?"} template=${c.data.template_type ?? "?"} size=${c.data.size ?? "?"}`;
    },
  };

  const get_computer: Tool = {
    name: "get_computer",
    description:
      "Fetch one MIOSA computer by id. Same target ids as sandboxes/desktops; use this name when reasoning about the underlying VM primitive.",
    inputSchema: {
      type: "object",
      properties: { computer_id: { type: "string" } },
      required: ["computer_id"],
    },
    async execute(args) {
      const id = String(args["computer_id"] ?? "");
      const c = await client.computers.get(id);
      return `id=${c.id} status=${c.status ?? "?"} template=${c.data.template_type ?? "?"} size=${c.data.size ?? "?"} public_url=${c.publicUrl ?? ""}`;
    },
  };

  const destroy_sandbox: Tool = {
    name: "destroy_sandbox",
    description:
      "Destroy a sandbox or desktop, releasing all resources. Always call this when you're done — sandboxes bill per-minute.",
    inputSchema: {
      type: "object",
      properties: { sandbox_id: { type: "string" } },
      required: ["sandbox_id"],
    },
    async execute(args) {
      const id = String(args["sandbox_id"] ?? "");
      await client.computers.delete(id);
      return `Destroyed ${id}.`;
    },
  };

  const destroy_computer: Tool = {
    name: "destroy_computer",
    description:
      "Destroy a MIOSA computer/sandbox/desktop and release resources. Call when the agent is done unless the user asked to keep the environment.",
    inputSchema: {
      type: "object",
      properties: { computer_id: { type: "string" } },
      required: ["computer_id"],
    },
    async execute(args) {
      const id = String(args["computer_id"] ?? "");
      await client.computers.delete(id);
      return `Destroyed ${id}.`;
    },
  };

  // ── Shell + files ────────────────────────────────────────────────────────

  const exec: Tool = {
    name: "exec",
    description:
      "Run a bash command inside a sandbox. Returns stdout/stderr/exit_code. Sandbox must be status='active'.",
    inputSchema: {
      type: "object",
      properties: {
        sandbox_id: { type: "string" },
        command: { type: "string" },
        timeout: { type: "integer", minimum: 1, maximum: 300, default: 30 },
      },
      required: ["sandbox_id", "command"],
    },
    async execute(args) {
      const id = String(args["sandbox_id"] ?? "");
      const command = String(args["command"] ?? "");
      const timeout = Number(args["timeout"] ?? 30);
      const c = await client.computers.get(id);
      const result = await c.exec.bash(command, timeout);
      return formatExecResult(result);
    },
  };

  const exec_python: Tool = {
    name: "exec_python",
    description:
      "Run a Python snippet inline inside a sandbox. Stdlib + requests + numpy + pandas pre-installed.",
    inputSchema: {
      type: "object",
      properties: {
        sandbox_id: { type: "string" },
        code: { type: "string", description: "Python source to execute" },
        timeout: { type: "integer", minimum: 1, maximum: 300, default: 30 },
      },
      required: ["sandbox_id", "code"],
    },
    async execute(args) {
      const id = String(args["sandbox_id"] ?? "");
      const code = String(args["code"] ?? "");
      const timeout = Number(args["timeout"] ?? 30);
      const c = await client.computers.get(id);
      const result = await c.exec.python(code, timeout);
      return formatExecResult(result);
    },
  };

  const read_file: Tool = {
    name: "read_file",
    description: "Read a file from the sandbox filesystem as UTF-8 text.",
    inputSchema: {
      type: "object",
      properties: {
        sandbox_id: { type: "string" },
        path: { type: "string", description: "Absolute path inside the VM" },
      },
      required: ["sandbox_id", "path"],
    },
    async execute(args) {
      const id = String(args["sandbox_id"] ?? "");
      const path = String(args["path"] ?? "");
      const c = await client.computers.get(id);
      return c.files.readFile(path);
    },
  };

  const write_file: Tool = {
    name: "write_file",
    description:
      "Write text content to a file inside the sandbox (overwrites existing).",
    inputSchema: {
      type: "object",
      properties: {
        sandbox_id: { type: "string" },
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["sandbox_id", "path", "content"],
    },
    async execute(args) {
      const id = String(args["sandbox_id"] ?? "");
      const path = String(args["path"] ?? "");
      const content = String(args["content"] ?? "");
      const c = await client.computers.get(id);
      await c.files.writeFile(path, content);
      return `Wrote ${content.length} bytes to ${path}.`;
    },
  };

  const list_files: Tool = {
    name: "list_files",
    description: "List the contents of a directory inside the sandbox.",
    inputSchema: {
      type: "object",
      properties: {
        sandbox_id: { type: "string" },
        path: { type: "string", default: "/home/user" },
      },
      required: ["sandbox_id"],
    },
    async execute(args) {
      const id = String(args["sandbox_id"] ?? "");
      const path = String(args["path"] ?? "/home/user");
      const c = await client.computers.get(id);
      const result = await c.exec.bash(`ls -la ${shellQuote(path)}`, 10);
      return formatExecResult(result);
    },
  };

  const preview_url: Tool = {
    name: "preview_url",
    description:
      "Return the public HTTPS preview URL for a service running on a port inside a MIOSA computer/sandbox.",
    inputSchema: {
      type: "object",
      properties: {
        sandbox_id: { type: "string", description: "Computer/sandbox id" },
        port: { type: "integer", minimum: 1, maximum: 65535 },
        path: { type: "string", default: "/" },
      },
      required: ["sandbox_id", "port"],
    },
    async execute(args) {
      const id = String(args["sandbox_id"] ?? "");
      const port = Number(args["port"] ?? 0);
      const path = String(args["path"] ?? "/");
      const c = await client.computers.get(id);
      return c.previewUrl(port, path);
    },
  };

  const tools = [
    create_sandbox,
    create_computer,
    create_desktop,
    list_sandboxes,
    get_sandbox,
    get_computer,
    exec,
    exec_python,
    read_file,
    write_file,
    list_files,
    preview_url,
  ];
  if (allowDestroy) tools.push(destroy_sandbox, destroy_computer);
  return tools;
}

function formatExecResult(result: unknown): string {
  const r = (result ?? {}) as Record<string, unknown>;
  const stdout = (r["stdout"] ?? r["output"] ?? "") as string;
  const stderr = (r["stderr"] ?? "") as string;
  const exitCode = (r["exit_code"] ?? 0) as number;
  const parts: string[] = [];
  if (stdout) parts.push(`stdout:\n${stdout}`);
  if (stderr) parts.push(`stderr:\n${stderr}`);
  parts.push(`exit_code: ${exitCode}`);
  return parts.join("\n");
}

function shellQuote(s: string): string {
  // Single-quote the string, escaping any embedded single quotes.
  return `'${s.replaceAll("'", "'\\''")}'`;
}
