import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { isNewerVersion, latestCommand, listClaudeVersions, listCodexVersions, listCursorVersions, type InstalledCli } from "./installed-versions.ts";
import type { HarnessId } from "./run-confirm.ts";

const CLAUDE_LATEST = "https://downloads.claude.ai/claude-code-releases/latest";
const CODEX_LATEST = "https://api.github.com/repos/openai/codex/releases/latest";
const CHECK_MS = 8_000;
const UPDATE_MS = 180_000;
const REMEMBER_MS = 60_000;

export interface UpdateDeps {
  fetch(url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }): Promise<{ ok: boolean; text(): Promise<string> }>;
  cursorAbout(command: string): Promise<string>;
}

interface Memory {
  key: string;
  at: number;
  updates: Partial<Record<HarnessId, string>>;
}

let remembered: Memory | null = null;

/** Drops the last update check so the next look talks to the CLIs again. */
export function forgetCliUpdates(): void {
  remembered = null;
}

/** The version in Claude Code's latest-release file, or "" when the body isn't one. */
export function claudeLatestVersion(body: string): string {
  const version = body.trim();
  return /^\d+\.\d+\.\d+$/.test(version) ? version : "";
}

/** The version in a Codex GitHub release tag, such as `rust-v0.163.0`. */
export function codexLatestVersion(tag: string): string {
  return tag.trim().replace(/^rust-v/, "").match(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/)?.[0] ?? "";
}

/** The newer Cursor Agent version from `cursor-agent about`, when that line says an update is available. */
export function cursorLatestVersion(about: string): string {
  const line = about.split("\n").find((item) => /^\s*Latest\b/i.test(item));
  if (!line || !/update available/i.test(line)) return "";
  return line.match(/Latest\s+(\S+)/i)?.[1] ?? "";
}

/** The published version when it is newer than the one installed, otherwise "". */
export function offeredUpdate(installed: string, latest: string): string {
  return isNewerVersion(latest, installed) ? latest : "";
}

/**
 * Newer versions of the CLIs that are installed. A CLI that isn't installed, or a check that fails, is left out.
 * The same installed versions reuse a check from the last minute.
 */
export async function availableUpdates(installed: Record<HarnessId, string>, deps: UpdateDeps = liveDeps()): Promise<Partial<Record<HarnessId, string>>> {
  const key = `${installed.claude}\n${installed.codex}\n${installed.cursor}`;
  if (remembered && remembered.key === key && Date.now() - remembered.at < REMEMBER_MS) return remembered.updates;
  const updates = await lookup(installed, deps);
  remembered = { key, at: Date.now(), updates };
  return updates;
}

async function lookup(installed: Record<HarnessId, string>, deps: UpdateDeps): Promise<Partial<Record<HarnessId, string>>> {
  const [claude, codex, cursor] = await Promise.all([
    installed.claude ? publishedClaude(deps) : Promise.resolve(""),
    installed.codex ? publishedCodex(deps) : Promise.resolve(""),
    installed.cursor ? publishedCursor(deps) : Promise.resolve(""),
  ]);
  return {
    ...(offeredUpdate(installed.claude, claude) ? { claude } : {}),
    ...(offeredUpdate(installed.codex, codex) ? { codex } : {}),
    ...(offeredUpdate(installed.cursor, cursor) ? { cursor } : {}),
  };
}

async function publishedClaude(deps: UpdateDeps): Promise<string> {
  try {
    const response = await deps.fetch(CLAUDE_LATEST, { signal: AbortSignal.timeout(CHECK_MS) });
    return response.ok ? claudeLatestVersion(await response.text()) : "";
  } catch {
    return "";
  }
}

async function publishedCodex(deps: UpdateDeps): Promise<string> {
  try {
    const response = await deps.fetch(CODEX_LATEST, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "X-RayViewer" },
      signal: AbortSignal.timeout(CHECK_MS),
    });
    if (!response.ok) return "";
    const release = JSON.parse(await response.text()) as { tag_name?: string; prerelease?: boolean };
    return release.prerelease ? "" : codexLatestVersion(release.tag_name ?? "");
  } catch {
    return "";
  }
}

async function publishedCursor(deps: UpdateDeps): Promise<string> {
  try {
    return cursorLatestVersion(await deps.cursorAbout(latestCommand("cursor", "cursor-agent", homedir())));
  } catch {
    return "";
  }
}

function liveDeps(): UpdateDeps {
  return {
    fetch: (url, init) => fetch(url, init),
    cursorAbout: (command) => commandOutput(command, ["about"], 15_000).then((result) => result.output),
  };
}

function installedVersion(id: InstalledCli, home: string): string {
  switch (id) {
    case "claude":
      return listClaudeVersions(home)[0]?.version ?? "";
    case "codex":
      return listCodexVersions(home)[0]?.version ?? "";
    case "cursor":
      return listCursorVersions(home)[0]?.version ?? "";
    default: {
      const never: never = id;
      return never;
    }
  }
}

export interface UpdateRunnerDeps {
  vscode: {
    window: {
      showInformationMessage(message: string, options: { modal: boolean }, ...items: string[]): PromiseLike<string | undefined>;
      showWarningMessage(message: string): PromiseLike<unknown>;
      withProgress<R>(options: { location: number; title: string }, task: () => PromiseLike<R>): PromiseLike<R>;
    };
    ProgressLocation: { Notification: number };
  };
  log(line: string): void;
  /** Runs `<command> update`. Tests pass a stand-in. */
  run?(command: string, args: string[]): Promise<{ ok: boolean; output: string }>;
}

const cliTitle = (id: InstalledCli) => {
  switch (id) {
    case "claude":
      return "Claude Code";
    case "codex":
      return "Codex";
    case "cursor":
      return "Cursor Agent";
    default: {
      const never: never = id;
      return never;
    }
  }
};

const defaultCommand = (id: InstalledCli) => {
  switch (id) {
    case "claude":
      return "claude";
    case "codex":
      return "codex";
    case "cursor":
      return "cursor-agent";
    default: {
      const never: never = id;
      return never;
    }
  }
};

/**
 * Downloads the latest version with that CLI's own update command, then forgets the last check so the next look
 * sees what is installed now.
 */
export async function updateInstalledCli(deps: UpdateRunnerDeps, id: InstalledCli, home = homedir()): Promise<boolean> {
  const { window, ProgressLocation } = deps.vscode;
  const title = cliTitle(id);
  const command = latestCommand(id, defaultCommand(id), home);
  const agreed = await window.showInformationMessage(`Update ${title}? X-RayViewer will download the latest version.`, { modal: true }, "Update");
  if (agreed !== "Update") return false;
  const result = await window.withProgress({ location: ProgressLocation.Notification, title: `Updating ${title}…` }, () =>
    (deps.run ?? ((file, args) => commandOutput(file, args, UPDATE_MS)))(command, ["update"]),
  );
  forgetCliUpdates();
  if (!result.ok) {
    await window.showWarningMessage(`${title} did not update. ${result.output.trim().split("\n").at(-1) ?? "The update failed."}`);
    return false;
  }
  const version = installedVersion(id, home);
  deps.log(version ? `${title} is now ${version}.` : `${title} updated. The next run uses ${command}.`);
  return true;
}

function commandOutput(command: string, args: string[], timeoutMs: number): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { timeout: timeoutMs, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const keep = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-4000);
    };
    child.stdout?.on("data", keep);
    child.stderr?.on("data", keep);
    child.on("error", (error) => resolve({ ok: false, output: error.message }));
    child.on("close", (code) => resolve({ ok: code === 0, output }));
  });
}
