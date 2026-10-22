import { readdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

export interface CliVersion {
  version: string;
  path: string;
}

const CLAUDE_BINS = ["/opt/homebrew/bin/claude", "/usr/local/bin/claude"];
const CODEX_BINS = ["/opt/homebrew/bin/codex", "/usr/local/bin/codex"];

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
