import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { CODEX_REVIEW_INPUT, codexReviewArgs, readCodexReview, runCodexReview, withCodexReport, type CodexConfig } from "../src/codex-review.ts";
import type { AgentRequest, AgentResult, RunResult } from "../src/cursor-harness.ts";
import type { CodeReviewRequest } from "../src/claude-review.ts";
import { fakeInternals, HarnessError, ok, streamOf } from "./support/fake-internals.ts";

const codex: CodexConfig = { id: "codex", command: "codex", model: "gpt-6.1-sol", extraArgs: ["-c", 'model_reasoning_effort="high"', "--skip-git-repo-check"] };
const repo = mkdtempSync(path.join(tmpdir(), "xrayviewer-codex-review-"));
const request: CodeReviewRequest = {
  prompt: "You are the Codex review agent.",
  schema: { type: "object" },
  cwd: repo,
  readDirs: [],
  timeoutMs: 60_000,
  codeReview: { args: "abc123" },
};

describe("codex review", () => {
  test("the command is codex review against the merge base, with the model, and the prompt on stdin", () => {
    assert.deepEqual(codexReviewArgs(codex, request), [
      "review",
      "--base",
      "abc123",
      "-c",
      'model_reasoning_effort="high"',
      "-c",
      'model="gpt-6.1-sol"',
      "-",
    ]);
    assert.deepEqual(codexReviewArgs({ ...codex, model: "", extraArgs: ["-c", 'model="already"'] }, request), ["review", "--base", "abc123", "-c", 'model="already"', "-"]);
  });

  test("a plain report and a JSON event stream both become the review text", () => {
    assert.deepEqual(readCodexReview("pay.js:3 over-charges\n"), { report: "pay.js:3 over-charges", tokens: null });
    const streamed = streamOf(
      { type: "item.completed", item: { type: "agent_message", text: "pay.js:3 over-charges" } },
      { type: "turn.completed", usage: { input_tokens: 4, cached_input_tokens: 1, output_tokens: 2 } },
    );
    assert.deepEqual(readCodexReview(streamed), { report: "pay.js:3 over-charges", tokens: { input: 4, cachedInput: 1, output: 2 } });
    assert.equal(readCodexReview(streamOf({ type: "turn.completed", usage: {} })).report, "");
  });

  test("hands the report to the bundle's Codex runner and adds up both runs", async () => {
    const { internals, runs } = fakeInternals(() => ok("pay.js:3 over-charges\n"));
    const converted: AgentRequest[] = [];
    const result = await runCodexReview(internals, codex, request, async (_config, next) => {
      converted.push(next);
      return { output: { findings: [] }, costUsd: null, tokens: { input: 5, cachedInput: 0, output: 1 }, model: "gpt-6.1-sol", durationMs: 1 };
    });

    assert.equal(runs.length, 1);
    assert.equal(runs[0].command, "codex");
    assert.equal(runs[0].args[0], "review");
    assert.equal(runs[0].args.at(-1), "-");
    assert.equal(runs[0].options.input, CODEX_REVIEW_INPUT);
    assert.ok(runs[0].options.timeoutMs! <= 180_000 && runs[0].options.timeoutMs! > 179_000);
    assert.equal(converted.length, 1);
    assert.equal(converted[0].prompt, withCodexReport(request.prompt, "pay.js:3 over-charges"));
    assert.equal("codeReview" in converted[0], false);
    assert.deepEqual(result.tokens, { input: 5, cachedInput: 0, output: 1 });
    assert.equal(result.model, "gpt-6.1-sol");
  });

  test("a review that exits without a report fails, and the other agents are not this run", async () => {
    const failed = fakeInternals(() => ({ code: 1, stdout: "", stderr: "nope", killed: false }));
    await assert.rejects(runCodexReview(failed.internals, codex, request, async () => ({ output: {}, costUsd: null, tokens: null, model: null, durationMs: 1 })), /Codex failed \(1\): nope/);

    const empty = fakeInternals(() => ok(streamOf({ type: "turn.completed", usage: {} })));
    await assert.rejects(runCodexReview(empty.internals, codex, request, async () => ({ output: {}, costUsd: null, tokens: null, model: null, durationMs: 1 })), (error: unknown) => {
      assert.ok(error instanceof HarnessError);
      assert.equal(error.kind, "badOutput");
      assert.match(error.message, /didn't report anything/);
      return true;
    });
  });

  test("stops a silent review, and a shaping run that stalls says the review reported", async () => {
    const silent = fakeInternals(
      ({ options }) =>
        new Promise<RunResult>((resolve) => {
          const killed = () => resolve({ code: 143, stdout: "", stderr: "", killed: true });
          if (options.signal?.aborted) killed();
          else options.signal?.addEventListener("abort", killed, { once: true });
        }),
    );
    await assert.rejects(runCodexReview(silent.internals, codex, request, async () => shaped, 20), /Codex's review made no progress/);

    const stalled = fakeInternals(() => ok("a finding\n"));
    const shaping = (_config: CodexConfig, next: AgentRequest) =>
      new Promise<AgentResult>((_resolve, reject) => {
        const fail = () => reject(Object.assign(new HarnessError("cancelled", "Stopped."), { kind: "cancelled" as const }));
        if (next.signal?.aborted) fail();
        else next.signal?.addEventListener("abort", fail, { once: true });
      });
    await assert.rejects(runCodexReview(stalled.internals, codex, request, shaping, 20), /Codex's review reported, but turning its report into findings made no progress/);
  });
});

const shaped: AgentResult = { output: { findings: [] }, costUsd: null, tokens: null, model: null, durationMs: 1 };
