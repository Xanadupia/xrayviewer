import { spawn } from "node:child_process";
import { open, realpath, stat } from "node:fs/promises";
import type { CliModel } from "./cli-model.ts";

const FALLBACK_ALIASES = ["opus", "sonnet", "haiku"];
const CATALOG_MARK = Buffer.from("latest_per_family:{");
const CATALOG_BEFORE = 64 * 1024;
const CHUNK = 16 * 1024 * 1024;

/** Claude Code's built-in model catalog: the model id each alias means today, and each model's display name. */
export interface ClaudeCatalog {
  aliases: Map<string, string>;
  names: Map<string, string>;
}

const EFFORT_WORDS: Record<string, string> = {
  low: "Fastest, lightest pass",
  medium: "Balanced speed and depth",
  high: "Thinks longer",
  xhigh: "Thinks much longer",
  max: "Most thorough and slowest",
};

const titled = (word: string) => word.slice(0, 1).toUpperCase() + word.slice(1);

/**
 * Models Claude Code names in `claude --help`: the aliases for the latest models, and the `--effort` levels.
 * With the catalog, each alias also shows the version it means, and catalog aliases the help leaves out are added.
 * Claude Code has no model list command, so without either source the long-standing aliases are offered.
 * A Claude Code without `--effort` gets no levels.
 */
export function parseClaudeHelp(text: string, catalog: ClaudeCatalog | null = null): CliModel[] {
  const flat = text.replace(/\s+/g, " ");
  const named = /--model <model>[^(]*\(e\.g\.([^)]*)\)/.exec(flat)?.[1] ?? "";
  const aliases = [...named.matchAll(/'([\w.[\]-]+)'/g)].map((match) => match[1]);
  const levels = /--effort <level>[^(]*\(([^)]*)\)/.exec(flat)?.[1] ?? "";
  const efforts = levels
    .split(",")
    .map((level) => level.trim())
    .filter((level) => /^[a-z]+$/.test(level))
    .map((effort) => ({ effort, description: EFFORT_WORDS[effort] ?? "" }));
  const known = [...(catalog?.aliases.keys() ?? [])];
  const listed = aliases.length ? [...aliases, ...known.filter((alias) => !aliases.includes(alias))] : known.length ? known : FALLBACK_ALIASES;
  return listed.map((alias) => {
    const fullId = catalog?.aliases.get(alias);
    return {
      slug: alias,
      name: (fullId && catalog?.names.get(fullId)) || titled(alias),
      description: `Claude Code's name for the latest ${titled(alias)} model.`,
      defaultEffort: "",
      efforts,
      ...(fullId ? { fullId } : {}),
    };
  });
}

export function parseClaudeCatalog(text: string): ClaudeCatalog {
  const names = new Map<string, string>();
  for (const match of text.matchAll(/\{id:"(claude-[\w.-]+)",family:"\w+",display_name:"([^"]+)"/g)) names.set(match[1], match[2]);
  const aliases = new Map<string, string>();
  const start = text.lastIndexOf("aliases:{");
  if (start >= 0) {
    for (const match of text.slice(start).matchAll(/(\w+):\{default:"(claude-[\w.-]+)"/g)) aliases.set(match[1], match[2]);
  }
  return { aliases, names };
}

/** The display name for a model setting, such as "Opus 5.5" for `opus` or `claude-opus-5-5`. Empty when unknown. */
export function claudeModelName(catalog: ClaudeCatalog | null, model: string): string {
  if (!catalog || !model) return "";
  return catalog.names.get(catalog.aliases.get(model) ?? model) ?? "";
}

/**
 * Finds the catalog inside one Claude Code program file. It sits just before `latest_per_family:{`, so the file is
 * read in chunks, keeping the end of each chunk, and only the text before that mark is decoded.
 */
export async function findClaudeCatalog(file: string, chunkSize = CHUNK): Promise<ClaudeCatalog | null> {
  const handle = await open(file, "r").catch(() => null);
  if (!handle) return null;
  try {
    const buffer = Buffer.alloc(CATALOG_BEFORE + chunkSize);
    let kept = 0;
    let position = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, kept, chunkSize, position);
      if (!bytesRead) return null;
      const filled = kept + bytesRead;
      const at = buffer.subarray(0, filled).indexOf(CATALOG_MARK);
      if (at >= 0) {
        const catalog = parseClaudeCatalog(buffer.toString("utf8", Math.max(0, at - CATALOG_BEFORE), at));
        return catalog.aliases.size ? catalog : null;
      }
      position += bytesRead;
      kept = Math.min(CATALOG_BEFORE, filled);
      buffer.copy(buffer, 0, filled - kept, filled);
    }
  } finally {
    await handle.close();
  }
}

const catalogs = new Map<string, Promise<ClaudeCatalog | null>>();

/** The catalog of the Claude Code at this path, read once per installed file. */
export async function readClaudeCatalog(file: string): Promise<ClaudeCatalog | null> {
  const real = await realpath(file).catch(() => null);
  const info = real ? await stat(real).catch(() => null) : null;
  if (!real || !info?.isFile()) return null;
  const key = `${real}:${info.size}:${info.mtimeMs}`;
  let catalog = catalogs.get(key);
  if (!catalog) {
    catalog = findClaudeCatalog(real);
    catalogs.set(key, catalog);
  }
  return catalog;
}

/** Replaces any previous `--effort` and keeps the other Claude Code arguments. */
export function withClaudeEffort(extraArgs: readonly string[], effort: string): string[] {
  const next: string[] = [];
  for (let i = 0; i < extraArgs.length; i++) {
    if (extraArgs[i] === "--effort") {
      i++;
      continue;
    }
    if (extraArgs[i].startsWith("--effort=")) continue;
    next.push(extraArgs[i]);
  }
  if (effort) next.push("--effort", effort);
  return next;
}

export function claudeEffort(extraArgs: readonly string[]): string {
  for (let i = 0; i < extraArgs.length; i++) {
    if (extraArgs[i] === "--effort") return extraArgs[i + 1] ?? "";
    if (extraArgs[i].startsWith("--effort=")) return extraArgs[i].slice("--effort=".length);
  }
  return "";
}

function claudeHelp(command: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(command, ["--help"], { timeout: 20_000 });
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("error", () => resolve(null));
    child.on("close", (code) => resolve(code === 0 ? output : null));
  });
}

/** Reads one Claude Code's help and catalog for its models. Returns null when the command fails. */
export async function listClaudeModels(command: string): Promise<CliModel[] | null> {
  const [help, catalog] = await Promise.all([claudeHelp(command), readClaudeCatalog(command)]);
  return help === null ? null : parseClaudeHelp(help, catalog);
}
