import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ANSI, cursorEnv, type BundleInternals, type CursorConfig } from "./cursor-harness.ts";

export interface CursorModel {
  id: string;
  name: string;
  isDefault: boolean;
  isCurrent: boolean;
}

const INVISIBLE = /[\u200b-\u200d\u2060\ufeff]/g;

/** Parses `cursor-agent --list-models`: one `<id> - <name>` line per model, with `(default)` or `(current)` marks. */
export function parseModelList(text: string): CursorModel[] {
  const models: CursorModel[] = [];
  for (const raw of text.replace(ANSI, "").split(/\r?\n/)) {
    const match = /^(\S+) - (.+)$/.exec(raw.replace(INVISIBLE, "").trim());
    if (!match) continue;
    const label = match[2];
    models.push({
      id: match[1],
      name: label.replace(/\s*\((default|current)\)/gi, "").replace(/\s+/g, " ").trim(),
      isDefault: /\(default\)/i.test(label),
      isCurrent: /\(current\)/i.test(label),
    });
  }
  return models;
}

/** Lists the models on the signed-in Cursor account, or null when the CLI is missing, signed out or fails. */
export async function listCursorModels(internals: BundleInternals, config: CursorConfig): Promise<CursorModel[] | null> {
  const dir = await mkdtemp(path.join(tmpdir(), "xrayview-cursor-"));
  try {
    const result = await internals.run(config.command, ["--list-models"], {
      cwd: dir,
      env: cursorEnv(internals.baseEnv),
      timeoutMs: 60_000,
    });
    return result.killed || result.code !== 0 ? null : parseModelList(result.stdout);
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
