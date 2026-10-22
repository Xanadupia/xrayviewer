import { spawn } from "node:child_process";
import type { CliModel } from "./cli-model.ts";

/** Models the Codex CLI lists for people to choose, from `codex debug models --bundled`. */
export function parseCodexCatalog(text: string): CliModel[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const models = data && typeof data === "object" && "models" in data ? data.models : undefined;
  if (!Array.isArray(models)) return [];
  const listed: CliModel[] = [];
  for (const item of models) {
    if (!item || typeof item !== "object") continue;
    const model = item as Record<string, unknown>;
    if (model.visibility !== "list" || model.supported_in_api === false || typeof model.slug !== "string") continue;
    const efforts = Array.isArray(model.supported_reasoning_levels)
      ? model.supported_reasoning_levels.flatMap((level) => {
          if (!level || typeof level !== "object") return [];
          const entry = level as Record<string, unknown>;
          return typeof entry.effort === "string"
            ? [{ effort: entry.effort, description: typeof entry.description === "string" ? entry.description : "" }]
            : [];
        })
      : [];
    listed.push({
      slug: model.slug,
      name: typeof model.display_name === "string" ? model.display_name : model.slug,
      description: typeof model.description === "string" ? model.description : "",
      defaultEffort: typeof model.default_reasoning_level === "string" ? model.default_reasoning_level : "",
      efforts,
    });
  }
  return listed;
}

/** Replaces any previous reasoning effort and keeps the other Codex arguments. */
export function withReasoningEffort(extraArgs: readonly string[], effort: string): string[] {
  const next: string[] = [];
  for (let i = 0; i < extraArgs.length; i++) {
    const following = extraArgs[i + 1] ?? "";
    if (extraArgs[i] === "-c" && following.startsWith("model_reasoning_effort=")) {
      i++;
      continue;
    }
    next.push(extraArgs[i]);
  }
  if (effort) next.push("-c", `model_reasoning_effort="${effort}"`);
  return next;
}

export function reasoningEffort(extraArgs: readonly string[]): string {
  for (let i = 0; i < extraArgs.length; i++) {
    const following = extraArgs[i + 1] ?? "";
    if (extraArgs[i] === "-c" && following.startsWith("model_reasoning_effort=")) {
      return following.slice("model_reasoning_effort=".length).replace(/^"|"$/g, "");
    }
  }
  return "";
}

/** Asks one Codex binary for the models it ships. Returns null when the command fails. */
export function listCodexModels(command: string): Promise<CliModel[] | null> {
  return new Promise((resolve) => {
    const child = spawn(command, ["debug", "models", "--bundled"], { timeout: 20_000 });
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      const models = parseCodexCatalog(output);
      resolve(models.length ? models : null);
    });
  });
}
