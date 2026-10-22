import { readdir } from "node:fs/promises";
import path from "node:path";
import type { BundleInternals, ErrorKind, RunOptions, RunResult } from "../../src/cursor-harness.ts";

export class HarnessError extends Error {
  kind: ErrorKind;
  detail: string;
  constructor(kind: ErrorKind, message: string, detail = "") {
    super(message);
    this.kind = kind;
    this.detail = detail;
  }
}

export interface RecordedRun {
  command: string;
  args: string[];
  options: RunOptions;
  workspaceFiles: string[];
}

export async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
    .sort();
}

export function ok(stdout: string): RunResult {
  return { code: 0, stdout, stderr: "", killed: false };
}

export function fakeInternals(respond: (run: RecordedRun) => RunResult | Promise<RunResult>) {
  const runs: RecordedRun[] = [];
  const relativized: string[][] = [];
  const internals: BundleInternals = {
    async run(command, args, options) {
      const run = { command, args, options, workspaceFiles: options.cwd ? await listFiles(options.cwd) : [] };
      runs.push(run);
      return respond(run);
    },
    HarnessError,
    baseEnv: (env = process.env) =>
      Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => /^(PATH|HOME)$/.test(entry[0]) && entry[1] !== undefined)),
    classifyFailure: (text, code, label) => new HarnessError("failed", `${label} failed (${code}): ${text}`),
    parseJson(text) {
      try {
        return JSON.parse(text);
      } catch {
        return undefined;
      }
    },
    relativizePaths(value, roots) {
      relativized.push(roots);
      return value;
    },
    tail: (text) => text,
  };
  return { internals, runs, relativized };
}

export function streamOf(...events: object[]): string {
  return events.map((event) => JSON.stringify(event)).join("\n") + "\n";
}

export const assistant = (text: string) => ({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text }] } });
