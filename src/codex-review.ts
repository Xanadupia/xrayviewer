import type { AgentRequest, AgentResult, BundleInternals, ErrorKind, Tokens } from "./cursor-harness.ts";
import { HARD_CAP_TIMES, STALL_MS, watchProgress, type CodeReviewRequest, type ProgressWatch } from "./claude-review.ts";
import { addTokens, withEarlierUsage } from "./reply-fix.ts";

export interface CodexConfig {
  id: "codex";
  command: string;
  model: string;
  extraArgs: string[];
}

/** `codex review` reads custom instructions from stdin when the prompt is `-`. The review itself is the command. */
export const CODEX_REVIEW_INPUT = "Review the changes against the base.";

/** `-c` pairs Codex already has. `codex review` does not take the flags `codex exec` uses. */
function codexConfigs(extraArgs: readonly string[]): string[] {
  const configs: string[] = [];
  for (let i = 0; i < extraArgs.length; i++) {
    if (extraArgs[i] === "-c" && extraArgs[i + 1]) configs.push("-c", extraArgs[++i]);
  }
  return configs;
}

/**
 * `codex review --base <merge-base> -`. The base is the start of the pull request. `-` is last because the command
 * reads the prompt from stdin, which is how the built-in review is attached.
 */
export function codexReviewArgs(config: CodexConfig, request: CodeReviewRequest): string[] {
  const model = request.model || config.model;
  const configs = codexConfigs(config.extraArgs);
  const hasModel = configs.some((arg, index) => configs[index - 1] === "-c" && arg.startsWith("model="));
  return ["review", "--base", request.codeReview.args, ...configs, ...(!hasModel && model ? ["-c", `model=${JSON.stringify(model)}`] : []), "-"];
}

function addCodexTokens(current: Tokens | null, usage: Record<string, unknown>): Tokens {
  const count = (value: unknown) => (typeof value === "number" ? value : 0);
  return {
    input: (current?.input ?? 0) + count(usage.input_tokens),
    cachedInput: (current?.cachedInput ?? 0) + count(usage.cached_input_tokens),
    output: (current?.output ?? 0) + count(usage.output_tokens),
  };
}

export function withCodexReport(prompt: string, report: string): string {
  return `${prompt}\n\n## What Codex's review reported\n\n${report}\n`;
}

/**
 * The review's text. Codex prints JSON events when it streams, and a plain report otherwise. A JSON stream with no
 * message is empty: the plain lines around it are not the review.
 */
export function readCodexReview(stdout: string): { report: string; tokens: Tokens | null } {
  const messages: string[] = [];
  let tokens: Tokens | null = null;
  let sawJson = false;
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    let event: Record<string, any> | null = null;
    try {
      const value: unknown = JSON.parse(line);
      if (value && typeof value === "object") event = value as Record<string, any>;
    } catch {
      event = null;
    }
    if (!event) continue;
    sawJson = true;
    const item = event.item;
    if (event.type === "item.completed" && item?.type === "agent_message" && typeof item.text === "string" && item.text.trim()) {
      messages.push(item.text.trim());
    }
    const usage = event.usage;
    if (event.type === "turn.completed" && usage && typeof usage === "object") tokens = addCodexTokens(tokens, usage);
  }
  return { report: messages.length ? messages.join("\n\n") : sawJson ? "" : stdout.trim(), tokens };
}

const minutes = (ms: number) => Math.round(ms / 60_000);

/**
 * Runs `codex review`, then hands its report to the bundle's own Codex runner, which turns it into X-RayViewer's
 * findings. A large pull request can keep the review busy past the agent time limit, so a run stops when it sends
 * nothing for `stallMs`, and both runs together stop at three times the limit.
 */
export async function runCodexReview(
  internals: BundleInternals,
  config: CodexConfig,
  request: CodeReviewRequest,
  runCodex: (config: CodexConfig, request: AgentRequest) => Promise<AgentResult>,
  stallMs: number = STALL_MS,
): Promise<AgentResult> {
  const { HarnessError } = internals;
  const started = Date.now();
  const capMs = request.timeoutMs === undefined ? undefined : request.timeoutMs * HARD_CAP_TIMES;
  const left = () => (capMs === undefined ? undefined : Math.max(1, started + capMs - Date.now()));
  const stopped = (watch: ProgressWatch, what: string) => {
    if (request.signal?.aborted) return new HarnessError("cancelled", "Stopped.");
    return new HarnessError(
      "timeout",
      watch.stalled
        ? `${what} made no progress for ${minutes(stallMs)} minutes and was stopped.`
        : `${what} took longer than ${minutes(capMs ?? 0)} minutes, three times xrayviewer.agents.timeoutMinutes, and was stopped.`,
    );
  };

  const reviewing = watchProgress(request.signal, stallMs);
  const run = await internals
    .run(config.command, codexReviewArgs(config, request), {
      cwd: request.cwd,
      env: internals.baseEnv(),
      input: CODEX_REVIEW_INPUT,
      timeoutMs: left(),
      signal: reviewing.signal,
      onStdout: reviewing.activity(request.activity).stream("codex"),
      onStderr: (chunk) => request.onLog?.(chunk.trimEnd()),
    })
    .finally(() => reviewing.stop());
  if (run.killed) throw stopped(reviewing, "Codex's review");
  if (run.code !== 0) {
    throw internals.classifyFailure([run.stderr, run.stdout].filter(Boolean).join("\n") || `exit code ${run.code}`, run.code, "Codex");
  }
  const review = readCodexReview(run.stdout);
  if (!review.report) throw new HarnessError("badOutput", "Codex's review didn't report anything.", internals.tail(run.stdout));
  request.onLog?.(`Codex's review reported:\n${review.report}`);

  const shaping = watchProgress(request.signal, stallMs);
  const converted = await runCodex(config, {
    prompt: withCodexReport(request.prompt, review.report),
    schema: request.schema,
    cwd: request.cwd,
    readDirs: request.readDirs,
    model: request.model,
    workDir: request.workDir,
    timeoutMs: left(),
    signal: shaping.signal,
    onLog: request.onLog,
    activity: shaping.activity(request.activity),
  })
    .catch((error: unknown) => {
      const kind = (error as { kind?: ErrorKind }).kind;
      if (kind === "timeout" || (kind === "cancelled" && shaping.stalled)) {
        throw stopped(shaping, "Codex's review reported, but turning its report into findings");
      }
      throw withEarlierUsage(error, { costUsd: null, tokens: review.tokens, model: null });
    })
    .finally(() => shaping.stop());
  return {
    output: converted.output,
    costUsd: converted.costUsd,
    tokens: addTokens(review.tokens, converted.tokens),
    model: converted.model,
    durationMs: Date.now() - started,
  };
}
