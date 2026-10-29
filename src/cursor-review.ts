import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { HARD_CAP_TIMES, STALL_MS, watchProgress, type CodeReviewRequest, type ProgressWatch } from "./claude-review.ts";
import { cursorArgs, cursorEnv, cursorFailure, readStream, runCursorAgent, type AgentResult, type BundleInternals, type CursorConfig, type ErrorKind } from "./cursor-harness.ts";
import { addTokens, withEarlierUsage } from "./reply-fix.ts";

/**
 * Cursor's `/review-bugbot` prompt. The `Full Repository Path` and `Diff` lines are the shape that makes this run
 * review in place, instead of asking whether to run Bugbot or a security review. `Base Branch` is the pull request's
 * merge base, so the review is that range rather than the repository's default branch.
 */
export function cursorReviewPrompt(cwd: string, base: string): string {
  return [`/review-bugbot`, "", `Full Repository Path: ${cwd}`, "Diff: branch changes", `Base Branch: ${base}`, ""].join("\n");
}

export function withCursorReport(prompt: string, report: string): string {
  return `${prompt}\n\n## What Cursor's review reported\n\n${report}\n`;
}

/** The isolated workspace still can't write or call the web. Shell stays available so the review can read the diff. */
const REVIEW_PERMISSIONS = {
  permissions: { allow: [], deny: ["Mcp(*:*)", "WebFetch(*)", "Write(**)"] },
};

const minutes = (ms: number) => Math.round(ms / 60_000);

/**
 * Runs Cursor's `/review-bugbot`, then hands its report to the usual Cursor Agent runner, which turns it into
 * X-RayViewer's findings. A large pull request can keep the review busy past the agent time limit, so a run stops
 * when it sends nothing for `stallMs`, and both runs together stop at three times the limit.
 */
export async function runCursorReview(
  internals: BundleInternals,
  config: CursorConfig,
  request: CodeReviewRequest,
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

  const workspace = request.workDir ?? (await mkdtemp(path.join(tmpdir(), "xrayviewer-cursor-review-")));
  await rm(workspace, { recursive: true, force: true });
  await mkdir(path.join(workspace, ".cursor"), { recursive: true });
  await writeFile(path.join(workspace, ".cursor", "cli.json"), JSON.stringify(REVIEW_PERMISSIONS, null, 2), "utf8");
  const model = request.model || config.model;
  const reviewing = watchProgress(request.signal, stallMs);
  const run = await internals
    .run(config.command, cursorArgs(config, workspace, [request.cwd, ...(request.readDirs ?? [])], model), {
      cwd: workspace,
      env: cursorEnv(internals.baseEnv),
      input: cursorReviewPrompt(request.cwd, request.codeReview.args),
      timeoutMs: left(),
      signal: reviewing.signal,
      onStdout: reviewing.activity(request.activity).stream("cursor"),
      onStderr: (chunk) => request.onLog?.(chunk.trimEnd()),
    })
    .finally(async () => {
      reviewing.stop();
      await rm(workspace, { recursive: true, force: true });
    });
  if (run.killed) throw stopped(reviewing, "Cursor's review");
  const stream = readStream(run.stdout);
  if (run.code !== 0) throw cursorFailure(internals, run.stderr || stream.result?.text || run.stdout, run.code);
  if (stream.result?.isError) throw cursorFailure(internals, stream.result.text, 1);
  const report = (stream.answer ?? stream.result?.text ?? "").trim();
  if (!report) throw new HarnessError("badOutput", "Cursor's review didn't report anything.", internals.tail(run.stderr || run.stdout));
  request.onLog?.(`Cursor's review reported:\n${report}`);

  const shaping = watchProgress(request.signal, stallMs);
  const converted = await runCursorAgent(internals, config, {
    prompt: withCursorReport(request.prompt, report),
    schema: request.schema,
    cwd: request.cwd,
    readDirs: request.readDirs,
    model: request.model,
    timeoutMs: left(),
    signal: shaping.signal,
    onLog: request.onLog,
    activity: shaping.activity(request.activity),
  })
    .catch((error: unknown) => {
      const kind = (error as { kind?: ErrorKind }).kind;
      if (kind === "timeout" || (kind === "cancelled" && shaping.stalled)) {
        throw stopped(shaping, "Cursor's review reported, but turning its report into findings");
      }
      throw withEarlierUsage(error, { costUsd: null, tokens: stream.tokens, model: stream.model });
    })
    .finally(() => shaping.stop());
  return {
    output: converted.output,
    costUsd: converted.costUsd,
    tokens: addTokens(stream.tokens, converted.tokens),
    model: converted.model ?? stream.model,
    durationMs: Date.now() - started,
  };
}
