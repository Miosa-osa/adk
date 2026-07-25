// Pre-built MIOSA tools for the agent. Each wraps a piece of the MIOSA
// REST API (via @miosa/sdk) and surfaces it as a Tool the agent can call.

import type { Miosa } from "@miosa/sdk";
import type { Tool } from "./types.js";

type ComputerSize = "xs" | "small" | "medium" | "large" | "xl";

export interface MiosaToolOptions {
  /** Default template for create_sandbox. */
  sandboxTemplate?: string;
  /** Default template for create_computer/create_desktop. */
  computerTemplate?: string;
  /** Default VM size. */
  defaultSize?: ComputerSize;
  /** Default interactive sandbox timeout in seconds. */
  workspaceTimeoutSec?: number;
  /** Default idle timeout in seconds. Activity should refresh this server-side. */
  idleTimeoutSec?: number;
  /** Hide destructive lifecycle tools from the model. */
  allowDestroy?: boolean;
}

interface ToolFactoryOptions extends MiosaToolOptions {
  /** Live MIOSA SDK client. */
  client: Miosa;
}

function asSize(v: unknown, fallback: ComputerSize): ComputerSize {
  if (v === "xlarge") return "xl";
  return v === "xs" || v === "small" || v === "medium" || v === "large" || v === "xl"
    ? v
    : fallback;
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
  const workspaceTimeoutSec = opts.workspaceTimeoutSec ?? 86_400;
  const idleTimeoutSec = opts.idleTimeoutSec ?? 1800;
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
          enum: ["xs", "small", "medium", "large", "xl"],
          default: "small",
        },
      },
      required: ["name"],
    },
    async execute(args) {
      const name = String(args["name"] ?? "");
      const size = asSize(args["size"], "small");
      const sandbox = await createSandboxWorkspace(client, {
        name,
        size,
        template: sandboxTemplate,
        timeoutSec: workspaceTimeoutSec,
        idleTimeoutSec,
      });
      return `Created sandbox id=${sandbox.id} status=${sandbox.state ?? sandbox.status ?? "provisioning"}.`;
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
          enum: ["xs", "small", "medium", "large", "xl"],
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
          enum: ["xs", "small", "medium", "large", "xl"],
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
      const s = await getSandboxTarget(client, id);
      if (s.kind === "sandbox") {
        const sb = s.target;
        return `id=${sb.id} state=${sb.state ?? "?"} ready=${sb.ready ?? "?"} template=${sb.templateId ?? sb.template_id ?? "?"} preview_url=${sb.preview_url ?? sb.data?.preview_url ?? ""}`;
      }
      const c = s.target;
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
      const sandboxes = sandboxNamespace(client);
      if (sandboxes?.delete) await sandboxes.delete(id);
      else await client.computers.delete(id);
      return `Destroyed ${id}.`;
    },
  };

  const pause_sandbox: Tool = {
    name: "pause_sandbox",
    description:
      "Pause a persistent sandbox workspace when the user is done for now. This preserves the filesystem so later work can resume.",
    inputSchema: {
      type: "object",
      properties: { sandbox_id: { type: "string" } },
      required: ["sandbox_id"],
    },
    async execute(args) {
      const id = String(args["sandbox_id"] ?? "");
      const s = await getSandboxTarget(client, id);
      if (s.kind !== "sandbox" || typeof s.target.pause !== "function") {
        return "Pause is only available on native MIOSA sandboxes.";
      }
      await s.target.pause();
      return `Paused sandbox ${id}.`;
    },
  };

  const resume_sandbox: Tool = {
    name: "resume_sandbox",
    description:
      "Resume a paused persistent sandbox workspace before reading files, running commands, or restarting previews.",
    inputSchema: {
      type: "object",
      properties: { sandbox_id: { type: "string" } },
      required: ["sandbox_id"],
    },
    async execute(args) {
      const id = String(args["sandbox_id"] ?? "");
      const s = await getSandboxTarget(client, id);
      if (s.kind !== "sandbox" || typeof s.target.resume !== "function") {
        return "Resume is only available on native MIOSA sandboxes.";
      }
      await s.target.resume();
      return `Resumed sandbox ${id}.`;
    },
  };

  const extend_sandbox: Tool = {
    name: "extend_sandbox",
    description:
      "Extend a running sandbox workspace before a long install, build, or agent task. Use pause_sandbox or snapshot_sandbox when the user is done for now.",
    inputSchema: {
      type: "object",
      properties: {
        sandbox_id: { type: "string" },
        timeout_sec: {
          type: "integer",
          minimum: 1,
          maximum: 86_400,
          default: 86_400,
        },
      },
      required: ["sandbox_id"],
    },
    async execute(args) {
      const id = String(args["sandbox_id"] ?? "");
      const timeoutSec = Number(args["timeout_sec"] ?? 86_400);
      const s = await getSandboxTarget(client, id);
      if (s.kind !== "sandbox" || typeof s.target.extend !== "function") {
        return "Extend is only available on native MIOSA sandboxes.";
      }
      await s.target.extend(timeoutSec);
      return `Extended sandbox ${id} timeout to ${timeoutSec}s.`;
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
      const target = await getSandboxTarget(client, id);
      const result =
        target.kind === "sandbox"
          ? await runSandboxCommand(target.target, command, timeout)
          : await target.target.exec.bash(command, timeout);
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
      const target = await getSandboxTarget(client, id);
      const result =
        target.kind === "sandbox"
          ? await runSandboxCommand(target.target, `python3 - <<'PY'\n${code}\nPY`, timeout)
          : await target.target.exec.python(code, timeout);
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
      const target = await getSandboxTarget(client, id);
      if (target.kind === "sandbox") {
        if (target.target.files?.readText) return target.target.files.readText(path);
        if (target.target.readFile) return target.target.readFile(path);
      }
      return target.target.files.readFile(path);
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
      const target = await getSandboxTarget(client, id);
      if (target.kind === "sandbox") {
        if (target.target.files?.write) await target.target.files.write(path, content);
        else await target.target.writeFile(path, content);
      } else {
        await target.target.files.writeFile(path, content);
      }
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
      const target = await getSandboxTarget(client, id);
      const result =
        target.kind === "sandbox"
          ? await runSandboxCommand(target.target, `ls -la ${shellQuote(path)}`, 10)
          : await target.target.exec.bash(`ls -la ${shellQuote(path)}`, 10);
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
      const target = await getSandboxTarget(client, id);
      if (target.kind === "sandbox") {
        const created =
          target.target.previews?.create
            ? await target.target.previews.create(port, { path })
            : target.target.preview?.expose
              ? await target.target.preview.expose(port)
              : await target.target.expose(port);
        return typeof created === "string"
          ? created
          : String(created.url ?? created.preview_url ?? "");
      }
      return target.target.previewUrl(port, path);
    },
  };

  const snapshot_sandbox: Tool = {
    name: "snapshot_sandbox",
    description:
      "Create a named checkpoint snapshot for a sandbox workspace after dependency install or a good edit.",
    inputSchema: {
      type: "object",
      properties: {
        sandbox_id: { type: "string" },
        comment: { type: "string" },
      },
      required: ["sandbox_id"],
    },
    async execute(args) {
      const id = String(args["sandbox_id"] ?? "");
      const comment = String(args["comment"] ?? "agent checkpoint");
      const s = await getSandboxTarget(client, id);
      if (s.kind !== "sandbox") return "Snapshots are only available on native MIOSA sandboxes.";
      const snap = s.target.snapshots?.create
        ? await s.target.snapshots.create(comment)
        : await s.target.createSnapshot(comment);
      return `Snapshot created: ${snap.id ?? snap.snapshot_id ?? JSON.stringify(snap)}`;
    },
  };

  const deploy_sandbox: Tool = {
    name: "deploy_sandbox",
    description:
      "Publish a sandbox workspace to a durable MIOSA deployment after preview/smoke tests pass.",
    inputSchema: {
      type: "object",
      properties: {
        sandbox_id: { type: "string" },
        name: { type: "string" },
        path: { type: "string", default: "/workspace" },
        build_command: { type: "string" },
        run_command: { type: "string" },
        port: { type: "integer", minimum: 1, maximum: 65535 },
      },
      required: ["sandbox_id", "name"],
    },
    async execute(args) {
      const id = String(args["sandbox_id"] ?? "");
      const s = await getSandboxTarget(client, id);
      if (s.kind !== "sandbox" || typeof s.target.deploy !== "function") {
        return "Deploy is only available on native MIOSA sandboxes.";
      }
      const result = await s.target.deploy({
        name: String(args["name"] ?? ""),
        path: String(args["path"] ?? "/workspace"),
        buildCommand: args["build_command"] ? String(args["build_command"]) : undefined,
        runCommand: args["run_command"] ? String(args["run_command"]) : undefined,
        port: args["port"] ? Number(args["port"]) : undefined,
      });
      return JSON.stringify(result);
    },
  };

  const deploy_docker: Tool = {
    name: "deploy_docker",
    description:
      "Publish a sandbox workspace through the workspace App Engine appliance. Use for many small workspace apps/lead magnets/funnels.",
    inputSchema: deploy_sandbox.inputSchema,
    async execute(args) {
      const id = String(args["sandbox_id"] ?? "");
      const s = await getSandboxTarget(client, id);
      if (s.kind !== "sandbox") return "App Engine is only available on native MIOSA sandboxes.";
      const deploy = s.target.deployDocker ?? ((params: Record<string, unknown>) =>
        s.target.deploy({ ...params, deploymentType: "docker_deploy" }));
      const result = await deploy.call(s.target, {
        name: String(args["name"] ?? ""),
        path: String(args["path"] ?? "/workspace"),
        buildCommand: args["build_command"] ? String(args["build_command"]) : undefined,
        runCommand: args["run_command"] ? String(args["run_command"]) : undefined,
        port: args["port"] ? Number(args["port"]) : undefined,
      });
      return JSON.stringify(result);
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
    pause_sandbox,
    resume_sandbox,
    extend_sandbox,
    snapshot_sandbox,
    deploy_sandbox,
    deploy_docker,
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

type AnyMiosa = Miosa & Record<string, unknown>;
type AnyTarget = Record<string, any>;

function sandboxNamespace(client: Miosa): AnyTarget | undefined {
  const ns = (client as AnyMiosa)["sandboxes"];
  return ns && typeof ns === "object" ? (ns as AnyTarget) : undefined;
}

async function createSandboxWorkspace(
  client: Miosa,
  opts: {
    name: string;
    size: ComputerSize;
    template: string;
    timeoutSec: number;
    idleTimeoutSec: number;
  },
): Promise<AnyTarget> {
  const sandboxes = sandboxNamespace(client);
  if (sandboxes?.createAgentWorkspace) {
    return sandboxes.createAgentWorkspace({
      name: opts.name,
      size: opts.size,
      templateId: opts.template,
      persistent: true,
      timeoutSec: opts.timeoutSec,
      idleTimeoutSec: opts.idleTimeoutSec,
      snapshotExpirationDays: 30,
      keepLastSnapshots: 1,
    });
  }
  if (sandboxes?.getOrCreate) {
    return sandboxes.getOrCreate({
      name: opts.name,
      size: opts.size,
      templateId: opts.template,
      persistent: true,
      timeoutSec: opts.timeoutSec,
      idleTimeoutSec: opts.idleTimeoutSec,
      snapshotExpirationDays: 30,
      keepLastSnapshots: 1,
      waitUntilReady: true,
    });
  }
  if (sandboxes?.create) {
    return sandboxes.create({
      name: opts.name,
      size: opts.size,
      templateId: opts.template,
      persistent: true,
      timeoutSec: opts.timeoutSec,
      idleTimeoutSec: opts.idleTimeoutSec,
      snapshotExpirationDays: 30,
      keepLastSnapshots: 1,
      metadata: {
        miosa_workspace_kind: "agent_workspace",
        miosa_persistent: true,
      },
    });
  }

  return client.computers.create({
    name: opts.name,
    size: opts.size,
    template_type: opts.template,
  });
}

async function getSandboxTarget(
  client: Miosa,
  id: string,
): Promise<{ kind: "sandbox" | "computer"; target: AnyTarget }> {
  const sandboxes = sandboxNamespace(client);
  if (sandboxes?.get) {
    try {
      return { kind: "sandbox", target: await sandboxes.get(id) };
    } catch {
      // Fall through to legacy computer-backed sandboxes.
    }
  }
  return { kind: "computer", target: await client.computers.get(id) };
}

async function runSandboxCommand(
  sandbox: AnyTarget,
  command: string,
  timeout: number,
): Promise<unknown> {
  if (sandbox.exec?.run) {
    return sandbox.exec.run(command, { timeout, timeoutSec: timeout });
  }
  if (typeof sandbox.exec === "function") {
    return sandbox.exec(command, { timeout, timeoutSec: timeout });
  }
  if (sandbox.commands?.run) {
    return sandbox.commands.run(command, { timeout, timeoutSec: timeout });
  }
  throw new Error("Sandbox target does not expose an exec runner.");
}
