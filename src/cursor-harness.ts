import { accessSync, constants } from "node:fs";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import type { AgentHandle } from "./activity.ts";

export type ErrorKind = "missing" | "auth" | "failed" | "timeout" | "cancelled" | "badOutput";

export interface RunOptions {
  cwd?: string;
  env?: Record<string, string>;
  input?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  killed: boolean;
}

/** The parts of the base bundle the Cursor harness reuses, so it fails, logs and reports like the other harnesses. */
export interface BundleInternals {
  run(command: string, args: string[], options: RunOptions): Promise<RunResult>;
  HarnessError: new (kind: ErrorKind, message: string, detail?: string) => Error;
  baseEnv(env?: NodeJS.ProcessEnv): Record<string, string>;
  classifyFailure(text: string, code: number, label: string): Error;
  parseJson(text: string): unknown;
  relativizePaths(value: unknown, roots: string[]): unknown;
  tail(text: string, max?: number): string;
}

export interface CursorConfig {
  id: "cursor";
  command: string;
  model: string;
  extraArgs: string[];
}

export interface AgentRequest {
  prompt: string;
  schema: unknown;
  cwd: string;
  readDirs?: string[];
  model?: string;
  workDir?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  onLog?: (line: string) => void;
  activity?: AgentHandle;
}

export interface Tokens {
  input: number;
  cachedInput: number;
  output: number;
}

export interface AgentResult {
  output: unknown;
  costUsd: number | null;
  tokens: Tokens | null;
  model: string | null;
  durationMs: number;
}

/**
 * Written to the agent's workspace as `.cursor/cli.json`. Ask mode already can't write or run commands; the deny list
 * also keeps the account's MCP servers and web fetches away from a prompt that carries untrusted pull request text.
 */
export const WORKSPACE_PERMISSIONS = {
  permissions: { allow: [], deny: ["Mcp(*:*)", "WebFetch(*)", "Shell(*)", "Write(**)"] },
};

export const ANSI = /\x1b\[[0-9;]*m/g;

export function withSchema(prompt: string, schema: unknown): string {
  return `${prompt}\n\nReply with only a JSON object matching this JSON Schema:\n\n${JSON.stringify(schema)}\n`;
}

export function cursorArgs(config: CursorConfig, workspace: string, readDirs: string[], model: string): string[] {
  return [
    "--print",
    "--output-format",
    "stream-json",
    "--mode",
    "ask",
    "--sandbox",
    "enabled",
    "--trust",
    "--workspace",
    workspace,
    ...readDirs.flatMap((dir) => ["--add-dir", dir]),
    ...(model ? ["--model", model] : []),
    ...config.extraArgs,
  ];
}

export function cursorEnv(baseEnv: BundleInternals["baseEnv"], env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const apiKey = env.CURSOR_API_KEY;
  return { ...baseEnv(env), ...(apiKey ? { CURSOR_API_KEY: apiKey } : {}) };
}

export interface StreamSummary {
  answer: string | null;
  result: { text: string; isError: boolean } | null;
  tokens: Tokens | null;
  model: string | null;
}

/**
 * Reads `--output-format stream-json`. The answer is the assistant text after the last tool call, joined across
 * events because a model can split one message into several; `result` carries usage and errors.
 */
export function readStream(stdout: string): StreamSummary {
  const summary: StreamSummary = { answer: null, result: null, tokens: null, model: null };
  let message = "";
  let afterToolCall = true;
  for (const line of stdout.split("\n")) {
    const event = parseEvent(line);
    if (!event) continue;
    if (event.type === "system" && event.subtype === "init" && typeof event.model === "string") {
      summary.model = event.model;
    } else if (event.type === "tool_call") {
      afterToolCall = true;
    } else if (event.type === "assistant") {
      message = afterToolCall ? messageText(event.message) : message + messageText(event.message);
      afterToolCall = false;
      if (message.trim()) summary.answer = message;
    } else if (event.type === "result") {
      summary.result = { text: typeof event.result === "string" ? event.result : "", isError: event.is_error === true };
      summary.tokens = toTokens(event.usage);
    }
  }
  return summary;
}

function parseEvent(line: string): Record<string, unknown> | null {
  if (!line.trim()) return null;
  try {
    const value: unknown = JSON.parse(line);
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function messageText(message: unknown): string {
  const content = (message as { content?: unknown } | undefined)?.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type: "text"; text: string } => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

function toTokens(usage: unknown): Tokens | null {
  if (!usage || typeof usage !== "object") return null;
  const u = usage as Record<string, unknown>;
  const n = (value: unknown) => (typeof value === "number" ? value : 0);
  return {
    input: n(u.inputTokens) + n(u.cacheReadTokens) + n(u.cacheWriteTokens),
    cachedInput: n(u.cacheReadTokens),
    output: n(u.outputTokens),
  };
}

function firstObject(parseJson: BundleInternals["parseJson"], text: string): unknown {
  const whole = parseJson(text);
  if (whole !== undefined) return whole;
  const end = text.lastIndexOf("}");
  for (let start = text.indexOf("{"); start !== -1 && start < end; start = text.indexOf("{", start + 1)) {
    const value = parseJson(text.slice(start, end + 1));
    if (value !== undefined) return value;
  }
  return undefined;
}

/** Models sometimes write LaTeX such as `\(x\)` inside strings; JSON only allows `\" \\ \/ \b \f \n \r \t \u`. */
function escapeStrayBackslashes(text: string): string {
  return text.replace(/\\(["\\/bfnrtu])|\\/g, (escape, legal: string | undefined) => (legal ? escape : "\\\\"));
}

/**
 * The whole reply as JSON, else the first `{` from which the text up to the last `}` parses. Only a reply that
 * doesn't parse gets its stray backslashes escaped and is tried again.
 */
export function extractJson(parseJson: BundleInternals["parseJson"], text: string): unknown {
  const trimmed = text.trim();
  return firstObject(parseJson, trimmed) ?? firstObject(parseJson, escapeStrayBackslashes(trimmed));
}

export function cursorFailure(internals: BundleInternals, text: string, code: number): Error {
  const clean = text.replace(ANSI, "").trim();
  const detail = internals.tail(clean);
  const badModel = /Cannot use this model: (.+?)(?:\. Available models|$)/m.exec(clean);
  if (badModel) {
    return new internals.HarnessError(
      "failed",
      `Cursor can't use the model "${badModel[1]}". Check xrayview.cursor.model, or the agent's model in agents.yml; Choose Agent Harnesses… then Cursor lists the models on your account.`,
      detail,
    );
  }
  if (/not (logged|signed) in|log ?in|unauthenticated|unauthorized|authentication|api key|401/i.test(clean)) {
    return new internals.HarnessError(
      "auth",
      "Cursor Agent isn't signed in. Run `cursor-agent login` in a terminal, then run the agents again.",
      detail,
    );
  }
  return internals.classifyFailure(clean || `exit code ${code}`, code, "Cursor Agent");
}

export async function runCursorAgent(
  internals: BundleInternals,
  config: CursorConfig,
  request: AgentRequest,
): Promise<AgentResult> {
  const { HarnessError } = internals;
  const workspace = request.workDir ?? (await mkdtemp(path.join(tmpdir(), "xrayview-cursor-")));
  await rm(workspace, { recursive: true, force: true });
  await mkdir(path.join(workspace, ".cursor"), { recursive: true });
  await writeFile(path.join(workspace, ".cursor", "cli.json"), JSON.stringify(WORKSPACE_PERMISSIONS, null, 2), "utf8");
  const model = request.model || config.model;
  const started = Date.now();
  try {
    const result = await internals.run(
      config.command,
      cursorArgs(config, workspace, [request.cwd, ...(request.readDirs ?? [])], model),
      {
        cwd: workspace,
        env: cursorEnv(internals.baseEnv),
        input: withSchema(request.prompt, request.schema),
        timeoutMs: request.timeoutMs,
        signal: request.signal,
        onStdout: request.activity?.stream("cursor"),
        onStderr: (chunk) => request.onLog?.(chunk.trimEnd()),
      },
    );
    if (result.killed) {
      throw request.signal?.aborted
        ? new HarnessError("cancelled", "Stopped.")
        : new HarnessError("timeout", "The agent took too long and was stopped.");
    }
    const stream = readStream(result.stdout);
    if (result.code !== 0) throw cursorFailure(internals, result.stderr || stream.result?.text || result.stdout, result.code);
    if (stream.result?.isError) throw cursorFailure(internals, stream.result.text, 1);
    const reply = stream.answer ?? stream.result?.text ?? "";
    if (!reply.trim()) throw new HarnessError("badOutput", "Cursor Agent didn't reply.", internals.tail(result.stderr || result.stdout));
    const output = extractJson(internals.parseJson, reply) ?? extractJson(internals.parseJson, stream.result?.text ?? "");
    if (output === undefined) {
      request.onLog?.(`Cursor Agent's reply, which isn't a JSON object:\n${reply}`);
      throw new HarnessError("badOutput", "Cursor Agent didn't return JSON.", internals.tail(reply));
    }
    const resolved = path.resolve(request.cwd);
    const roots = [...new Set([resolved, await realpath(request.cwd).catch(() => resolved)])];
    return {
      output: internals.relativizePaths(output, roots),
      costUsd: null,
      tokens: stream.tokens,
      model: model || stream.model || null,
      durationMs: Date.now() - started,
    };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

/**
 * Finds a bare command on PATH, then in the folder the Cursor installer uses, which an editor started from the Dock
 * may not have on its PATH. Paths and unresolvable names come back unchanged.
 */
export function resolveCommand(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  fallbackDirs: string[] = [path.join(homedir(), ".local", "bin")],
): string {
  if (process.platform === "win32" || command.includes("/") || command.includes("\\")) return command;
  const dirs = [...(env.PATH ?? "").split(path.delimiter).filter(Boolean), ...fallbackDirs];
  for (const dir of dirs) {
    const candidate = path.join(dir, command);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }
  return command;
}
