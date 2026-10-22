import { readdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { resolveCommand } from "./cursor-harness.ts";

export interface CliVersion {
  version: string;
  path: string;
}

export type InstalledCli = "claude" | "codex" | "cursor";

const CLAUDE_BINS = ["/opt/homebrew/bin/claude", "/usr/local/bin/claude"];
const CODEX_BINS = ["/opt/homebrew/bin/codex", "/usr/local/bin/codex"];
const CURSOR_BINS = ["/opt/homebrew/bin/cursor-agent", "/usr/local/bin/cursor-agent"];

/** Claude Code builds the native installer keeps under ~/.local/share/claude/versions. */
export function listClaudeVersions(home: string, extraBins: readonly string[] = CLAUDE_BINS): CliVersion[] {
  return collect(
    [
      ...filesIn(path.join(home, ".local", "share", "claude", "versions")),
      path.join(home, ".local", "bin", "claude"),
      ...extraBins,
    ],
    (file) => path.basename(file),
  );
}

/** The newest installed version, or "" when that CLI is not on this machine. */
export function installedSummary(id: "claude" | "codex", home: string): string {
  switch (id) {
    case "claude":
      return listClaudeVersions(home)[0]?.version ?? "";
    case "codex":
      return listCodexVersions(home)[0]?.version ?? "";
    default: {
      const never: never = id;
      return never;
    }
  }
}

/**
 * The binary a run should start. A versioned install wins, newest first, even when a setting still names an older
 * copy. The configured command is the fallback when this machine has no installed version of that CLI.
 */
export function latestCommand(id: InstalledCli, configured: string, home: string): string {
  return listed(id, home)[0]?.path || resolveCommand(configured, process.env, [path.join(home, ".local", "bin")]);
}

function listed(id: InstalledCli, home: string): CliVersion[] {
  switch (id) {
    case "claude":
      return listClaudeVersions(home);
    case "codex":
      return listCodexVersions(home);
    case "cursor":
      return listCursorVersions(home);
    default: {
      const never: never = id;
      return never;
    }
  }
}

/** Cursor Agent builds the installer keeps under ~/.local/share/cursor-agent/versions. */
export function listCursorVersions(home: string, extraBins: readonly string[] = CURSOR_BINS): CliVersion[] {
  const versions = path.join(home, ".local", "share", "cursor-agent", "versions");
  const fromVersions: string[] = [];
  for (const name of readableNames(versions)) {
    if (name.startsWith(".")) continue;
    const binary = firstFile([
      path.join(versions, name, "cursor-agent"),
      path.join(versions, name, "cursor-agent.cmd"),
      path.join(versions, name, "cursor-agent.exe"),
    ]);
    if (binary) fromVersions.push(binary);
  }
  return collect([...fromVersions, path.join(home, ".local", "bin", "cursor-agent"), ...extraBins], versionFromCursorPath);
}

/** Codex builds the official installer keeps under ~/.codex/packages/standalone/releases. */
export function listCodexVersions(home: string, extraBins: readonly string[] = CODEX_BINS): CliVersion[] {
  const releases = path.join(home, ".codex", "packages", "standalone", "releases");
  const fromReleases: string[] = [];
  for (const name of readableNames(releases)) {
    if (name.startsWith(".")) continue;
    const dir = path.join(releases, name);
    const binary = firstFile([path.join(dir, "codex"), path.join(dir, "bin", "codex")]);
    if (binary) fromReleases.push(binary);
  }
  return collect([...fromReleases, path.join(home, ".local", "bin", "codex"), ...extraBins], versionFromCodexPath);
}

function collect(candidates: readonly string[], versionOf: (file: string) => string): CliVersion[] {
  const found = new Map<string, CliVersion>();
  for (const candidate of candidates) {
    const file = firstFile([candidate]);
    if (!file) continue;
    let key = file;
    try {
      key = realpathSync(file);
    } catch {
      continue;
    }
    if (!found.has(key)) found.set(key, { version: versionOf(key), path: key });
  }
  return [...found.values()].sort((a, b) => compareVersions(b.version, a.version) || a.path.localeCompare(b.path));
}

function versionFromCodexPath(file: string): string {
  const parent = path.basename(path.dirname(file));
  const release = parent === "bin" ? path.basename(path.dirname(path.dirname(file))) : parent;
  return release.match(/^\d+\.\d+\.\d+/)?.[0] ?? "installed";
}

function versionFromCursorPath(file: string): string {
  return file.match(/[/\\]versions[/\\]([^/\\]+)[/\\]cursor-agent(?:\.(?:cmd|exe))?$/)?.[1] ?? "installed";
}

function filesIn(dir: string): string[] {
  return readableNames(dir)
    .filter((name) => !name.startsWith("."))
    .map((name) => path.join(dir, name))
    .filter((file) => isFile(file));
}

function readableNames(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function firstFile(candidates: readonly string[]): string | null {
  return candidates.find((candidate) => isFile(candidate)) ?? null;
}

function isFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

/** True when `candidate` is a newer version string than `current`. */
export function isNewerVersion(candidate: string, current: string): boolean {
  if (!candidate || !current) return false;
  return compareVersions(candidate, current) > 0;
}

function compareVersions(left: string, right: string): number {
  const a = left.match(/\d+/g)?.map(Number) ?? [];
  const b = right.match(/\d+/g)?.map(Number) ?? [];
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff) return diff;
  }
  return left.localeCompare(right);
}
