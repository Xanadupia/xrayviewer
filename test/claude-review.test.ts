import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import {
  CODE_REVIEW_ID,
  CODEX_REVIEW_ID,
  CURSOR_REVIEW_ID,
  codeReviewArgs,
  codeReviewLevel,
  codeReviewResults,
  codeReviewSettings,
  findingSchema,
  gitCommonDir,
  planCodeReview,
  plannedWithCodeReview,
  readCodeReview,
  runCodeReview,
  type ClaudeConfig,
  type CodeReviewRequest,
  type ReviewAgent,
  type ReviewSettings,
} from "../src/claude-review.ts";
import type { AgentRequest, AgentResult, RunResult } from "../src/cursor-harness.ts";
import { fixReply, unreadable } from "../src/reply-fix.ts";
import type { PlannedAgent } from "../src/run-confirm.ts";
import { fakeInternals, HarnessError, ok, streamOf } from "./support/fake-internals.ts";

function agent(name: string, overrides: Partial<ReviewAgent> = {}): ReviewAgent {
  return { name, focus: "", enabled: true, maxFindings: 5, minConfidence: "worth-asking", skip: [], runsWhen: [], harness: "", model: "", instructions: "", ...overrides };
}

const settings: ReviewSettings = {
  severity: { high: "breaks", medium: "fix it", low: "taste" },
  agents: {
    guide: agent("Guide agent", { maxFindings: 0, harness: "claude" }),
    architecture: agent("Architecture agent", {
      focus: "Where code lives",
      maxFindings: 3,
      model: "opus",
      skip: ["**/*.lock", "docs/**"],
      instructions: "## Look for\n\nHelpers that duplicate existing ones.\n\n## Leave alone\n\nNaming.",
    }),
    correctness: agent("Correctness agent", { maxFindings: 5, model: "sonnet", minConfidence: "minor", instructions: "Off-by-one errors." }),
    security: agent("Security agent", { harness: "codex" }),
  },
};
const harnessOf = (id: string) => settings.agents[id].harness || "claude";
const selection = { run: ["guide", "architecture", "correctness", "security"], skipped: [{ id: "tests", why: "turned off" }] };
const range = "1111111...2222222";

const claudeProgram = { extraArgs: ["--effort", "xhigh"], model: "opus" };
const codexProgram = { extraArgs: ["-c", 'model_reasoning_effort="high"'], model: "gpt-6.1-sol" };

describe("planCodeReview", () => {
  test("runs each program's review beside the agents on that program, including a single one", () => {
    const plan = planCodeReview(selection, settings, harnessOf, "guide", claudeProgram, codexProgram, range);

    assert.deepEqual(plan.run, ["guide", "architecture", "correctness", "security", CODE_REVIEW_ID, CODEX_REVIEW_ID]);
    assert.deepEqual(plan.skipped, selection.skipped, "the selected agents are not handed over to it");
    const review = plan.settings.agents[CODE_REVIEW_ID];
    assert.equal(review.name, "Claude Code Review");
    assert.equal(review.focus, "Claude Code's /code-review, on its own");
    assert.equal(review.harness, "claude");
    assert.equal(review.model, "opus");
    assert.equal(review.maxFindings, 32);
    assert.equal(review.minConfidence, "minor");
    assert.deepEqual(review.codeReview, { args: "xhigh 1111111...2222222 --max-findings 32" });
    const codex = plan.settings.agents[CODEX_REVIEW_ID];
    assert.equal(codex.name, "Codex Code Review");
    assert.equal(codex.focus, "Codex's review, on its own");
    assert.equal(codex.harness, "codex");
    assert.equal(codex.model, "gpt-6.1-sol");
    assert.equal(codex.effort, "high");
    assert.deepEqual(codex.codeReview, { args: "1111111" });
    assert.equal(plan.settings.severity, settings.severity, "the rest of the settings carry over");
    assert.equal(settings.agents[CODE_REVIEW_ID], undefined, "the settings passed in are left as they were");

    const oneClaude = planCodeReview({ run: ["architecture"], skipped: [] }, settings, harnessOf, "guide", claudeProgram, codexProgram, range);
    assert.deepEqual(oneClaude.run, ["architecture", CODE_REVIEW_ID]);
    const oneCodex = planCodeReview({ run: ["security"], skipped: [] }, settings, harnessOf, "guide", claudeProgram, codexProgram, range);
    assert.deepEqual(oneCodex.run, ["security", CODEX_REVIEW_ID]);
    assert.equal(oneCodex.settings.agents[CODE_REVIEW_ID], undefined);
  });

  test("a Cursor selection adds Cursor Code Review, even when its model is named Claude or Codex", () => {
    const cursor = () => "cursor";
    const plan = planCodeReview({ run: ["guide", "security"], skipped: [] }, settings, cursor, "guide", { model: "claude-opus" }, { model: "gpt-6.1-sol" }, range, { model: "composer" });
    assert.deepEqual(plan.run, ["guide", "security", CURSOR_REVIEW_ID]);
    const review = plan.settings.agents[CURSOR_REVIEW_ID];
    assert.equal(review.name, "Cursor Code Review");
    assert.equal(review.harness, "cursor");
    assert.equal(review.model, "composer");
    assert.deepEqual(review.codeReview, { args: "1111111" });
    assert.equal(plan.settings.agents[CODE_REVIEW_ID], undefined);
    assert.equal(plan.settings.agents[CODEX_REVIEW_ID], undefined);
    assert.match(review.instructions, /This run is only that review/);
  });

  test("the shaping instructions are only that program's review, not the other agents", () => {
    const plan = planCodeReview(selection, settings, harnessOf, "guide", undefined, undefined, range);
    for (const id of [CODE_REVIEW_ID, CODEX_REVIEW_ID]) {
      const { instructions } = plan.settings.agents[id];
      assert.match(instructions, /This run is only that review/);
      assert.match(instructions, /Leave out anything that belongs to another agent's instructions/);
      assert.equal(instructions.includes("Architecture agent"), false);
      assert.equal(instructions.includes("Correctness agent"), false);
    }
  });

  test("caps /code-review at the 32 findings it reports", () => {
    const plan = planCodeReview(selection, settings, harnessOf, "guide", undefined, undefined, range);
    assert.match(plan.settings.agents[CODE_REVIEW_ID].codeReview!.args, /--max-findings 32$/);
  });

  test("adds nothing without a range, with nothing selected, or when agents.yml has the id", () => {
    assert.deepEqual(planCodeReview(selection, settings, harnessOf, "guide", undefined, undefined, null).run, selection.run);
    assert.deepEqual(planCodeReview({ run: [], skipped: [] }, settings, harnessOf, "guide", undefined, undefined, range).run, []);

    const taken: ReviewSettings = {
      agents: { ...settings.agents, [CODE_REVIEW_ID]: agent("Mine agent"), [CODEX_REVIEW_ID]: agent("Mine Codex") },
    };
    assert.deepEqual(planCodeReview(selection, taken, harnessOf, "guide", undefined, undefined, range).run, selection.run);
    const claudeTaken: ReviewSettings = { agents: { ...settings.agents, [CODE_REVIEW_ID]: agent("Mine agent") } };
    const stillCodex = planCodeReview(selection, claudeTaken, harnessOf, "guide", undefined, undefined, range);
    assert.equal(stillCodex.settings.agents[CODE_REVIEW_ID].name, "Mine agent");
    assert.equal(stillCodex.run.at(-1), CODEX_REVIEW_ID);
  });

  test("leaves the skill's own level when the effort isn't one /code-review knows", () => {
    assert.equal(codeReviewLevel(["--effort", "high"]), "high");
    assert.equal(codeReviewLevel(["--effort=max"]), "max");
    assert.equal(codeReviewLevel([]), "");
    assert.equal(codeReviewLevel(["--effort", "turbo"]), "");
    const plan = planCodeReview(selection, settings, harnessOf, "guide", { extraArgs: [] }, undefined, range);
    assert.equal(plan.settings.agents[CODE_REVIEW_ID].codeReview!.args, "1111111...2222222 --max-findings 32");
  });

  test("uses Claude Code's effort, not a level saved on one of the other agents", () => {
    const own: ReviewSettings = {
      agents: {
        ...settings.agents,
        architecture: { ...settings.agents.architecture, effort: "max" },
        correctness: { ...settings.agents.correctness, effort: "low" },
      },
    };
    const review = planCodeReview(selection, own, harnessOf, "guide", { extraArgs: ["--effort", "high"] }, undefined, range).settings.agents[CODE_REVIEW_ID];
    assert.equal(review.effort, "high");
    assert.equal(review.codeReview!.args.split(" ")[0], "high");
    const skillDefault = planCodeReview(selection, own, harnessOf, "guide", { extraArgs: ["--effort", "turbo"] }, undefined, range).settings.agents[CODE_REVIEW_ID];
    assert.equal(skillDefault.effort, "");
    assert.match(skillDefault.codeReview!.args, /^1111111\.\.\.2222222 /);
  });
});

describe("the agent on each code review finding", () => {
  const briefed: ReviewSettings = {
    ...settings,
    agents: {
      ...settings.agents,
      [CODE_REVIEW_ID]: { ...agent("Code review agent"), codeReview: { args: "", agents: ["architecture", "correctness"] } },
    },
  };
  const plan = { settings: briefed };
  const item = { type: "object", properties: { path: { type: "string" }, title: { type: "string" } }, required: ["path", "title"], additionalProperties: false };
  const schema = { type: "object" as const, properties: { findings: { type: "array", items: item }, checked: { type: "array" } }, required: ["findings", "checked"] };

  test("the shaping run's schema asks which agent each finding is for; every other agent's stays the bundle's", () => {
    const tagged = findingSchema(CODE_REVIEW_ID, plan.settings, schema);
    assert.deepEqual(tagged.properties.findings.items.properties.agent, { type: "string", enum: [CODE_REVIEW_ID, "architecture", "correctness"] });
    assert.deepEqual(tagged.properties.findings.items.required, ["agent", "path", "title"]);
    assert.equal(tagged.properties.findings.items.additionalProperties, false);
    assert.equal(tagged.properties.checked, schema.properties.checked);
    assert.deepEqual(schema.properties.findings.items, item, "the bundle's schema is left as it was");
    assert.equal(findingSchema("security", plan.settings, schema), schema);
    assert.equal(findingSchema(CODE_REVIEW_ID, settings, schema), schema, "without the plan there's no one else to name");
  });

  test("a finding added for an agent's instructions shows under that agent, without the files it skips", () => {
    const findings = [
      { agent: CODE_REVIEW_ID, path: "pay.js", title: "From the report" },
      { agent: "architecture", path: "pay.js", title: "Duplicated helper" },
      { agent: "architecture", path: "docs/guide.md", title: "In a skipped file" },
      { agent: "correctness", path: "cart.js", title: "Off by one" },
      { agent: "security", path: "auth.js", title: "Not one of the briefs" },
    ];
    const problems = { dropped: [] as string[] };
    const converted: Array<[string, unknown]> = [];
    const results = codeReviewResults(
      CODE_REVIEW_ID,
      { findings, checked: ["fine"] },
      plan.settings,
      (id, output) => (converted.push([id, output]), `${id}:${output.findings?.length}`),
      (id, file) => id === "architecture" && file.startsWith("docs/"),
      problems,
    );

    assert.deepEqual(results, [[CODE_REVIEW_ID, `${CODE_REVIEW_ID}:2`], ["architecture", "architecture:1"], ["correctness", "correctness:1"]]);
    assert.deepEqual(converted[0][1], { findings: [findings[0], findings[4]], checked: ["fine"] }, "the report's findings, and any agent it doesn't know, keep what was checked");
    assert.deepEqual(converted[1][1], { findings: [findings[1]], checked: [] });
    assert.deepEqual(problems.dropped, ['architecture: "In a skipped file" is in a file on its skip list (docs/guide.md)']);
  });

  test("any other agent's output converts as one, as before", () => {
    const output = { findings: [{ path: "a.js", title: "t" }], checked: [] };
    const results = codeReviewResults("security", output, plan.settings, (id, o) => [id, o], () => true, { dropped: [] });
    assert.deepEqual(results, [["security", ["security", output]]]);
  });
});

describe("plannedWithCodeReview", () => {
  test("adds each program's review after the agents on that program, including a single agent", () => {
    const planned: PlannedAgent[] = [
      { id: "guide", name: "Guide agent", short: "Guide", harness: "claude", model: "Opus 5.5", thinking: "xhigh" },
      { id: "architecture", name: "Architecture agent", short: "Architecture", harness: "claude", model: "Opus 5.5", thinking: "xhigh" },
      { id: "correctness", name: "Correctness agent", short: "Correctness", harness: "claude", model: "Opus 5.5", thinking: "low" },
      { id: "security", name: "Security agent", short: "Security", harness: "codex", model: "gpt-6.1-sol", thinking: "" },
    ];
    const programs = {
      claude: { model: "Opus 5.5", extraArgs: ["--effort", "high"] },
      codex: { model: "gpt-6.1-sol", extraArgs: ["-c", 'model_reasoning_effort="xhigh"'] },
    };
    assert.deepEqual(
      plannedWithCodeReview(planned, programs).map((a) => [a.id, a.short, a.harness, a.model, a.thinking]),
      [
        ["guide", "Guide", "claude", "Opus 5.5", "xhigh"],
        ["architecture", "Architecture", "claude", "Opus 5.5", "xhigh"],
        ["correctness", "Correctness", "claude", "Opus 5.5", "low"],
        ["security", "Security", "codex", "gpt-6.1-sol", ""],
        [CODE_REVIEW_ID, "Claude Code Review", "claude", "Opus 5.5", "high"],
        [CODEX_REVIEW_ID, "Codex Code Review", "codex", "gpt-6.1-sol", "xhigh"],
      ],
    );
    assert.deepEqual(plannedWithCodeReview(planned.slice(0, 3), { claude: programs.claude }).map((a) => a.id), [
      "guide",
      "architecture",
      "correctness",
      CODE_REVIEW_ID,
    ]);
    assert.deepEqual(plannedWithCodeReview(planned.slice(3), { codex: { extraArgs: [] } }).map((a) => a.id), ["security", CODEX_REVIEW_ID]);
    assert.deepEqual(
      plannedWithCodeReview(
        planned.map((agent) => ({ ...agent, harness: "cursor" })),
        { cursor: { model: "Composer" } },
      ).map((a) => [a.id, a.harness, a.model]),
      [...planned.map((agent) => [agent.id, "cursor", agent.model] as const), [CURSOR_REVIEW_ID, "cursor", "Composer"]],
    );
    assert.equal(plannedWithCodeReview([], programs).length, 0);
  });
});

function worktree() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "xrayviewer-review-")));
  const clone = path.join(root, "clone");
  const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  execFileSync("git", ["init", "-q", clone]);
  writeFileSync(path.join(clone, "a.txt"), "a\n");
  git(clone, "add", "-A");
  git(clone, "-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-qm", "a");
  const tree = path.join(root, "tree");
  git(clone, "worktree", "add", "-q", "--detach", tree);
  return { root, clone, tree, run: path.join(root, "run") };
}

const claude: ClaudeConfig = { id: "claude", command: "/bin/claude", model: "opus", extraArgs: ["--effort", "high"] };

function after(args: string[], flag: string): string[] {
  const start = args.indexOf(flag) + 1;
  const end = args.findIndex((a, i) => i >= start && a.startsWith("--"));
  return args.slice(start, end === -1 ? args.length : end);
}

describe("the /code-review run's Claude Code flags", () => {
  test("find the clone's git objects behind a worktree checkout", () => {
    const { clone, tree } = worktree();
    assert.equal(gitCommonDir(tree), path.join(clone, ".git"));
    assert.equal(gitCommonDir(clone), null, "a normal clone keeps them inside the checkout");
  });

  test("let Bash read only the checkout, the run folder and the git objects in the home folder, and write nowhere", () => {
    const { root, clone, tree, run } = worktree();
    const home = root;
    const { env, sandbox, disableAllHooks } = codeReviewSettings(tree, [run], home);

    assert.equal(disableAllHooks, true);
    assert.deepEqual(env, { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" });
    assert.equal(sandbox.enabled, true);
    assert.equal(sandbox.allowUnsandboxedCommands, false);
    assert.equal(sandbox.autoAllowBashIfSandboxed, false);
    assert.deepEqual(sandbox.filesystem.denyRead, [home]);
    assert.deepEqual(sandbox.filesystem.allowRead, [tree, run, path.join(clone, ".git")]);
    assert.deepEqual(sandbox.filesystem.denyWrite, [home, tree, run, path.join(clone, ".git")]);
  });

  test("run the slash command with read-only git, no JSON schema, and no project settings or MCP servers", () => {
    const { root, tree, run } = worktree();
    const request: CodeReviewRequest = { prompt: "unused", schema: {}, cwd: tree, readDirs: [run], codeReview: { args: "high a...b --max-findings 8" } };
    const args = codeReviewArgs(claude, request, root);

    assert.deepEqual(args.slice(0, 2), ["-p", "/code-review high a...b --max-findings 8"], "before the flags that take many values");
    assert.ok(!args.includes("--disable-slash-commands"));
    assert.ok(!args.includes("--json-schema"), "a schema lets the forked review answer through its tool and report nothing");
    assert.deepEqual(after(args, "--output-format"), ["stream-json"]);
    assert.deepEqual(after(args, "--permission-mode"), ["dontAsk"]);
    assert.deepEqual(after(args, "--mcp-config"), ['{"mcpServers":{}}']);
    assert.deepEqual(after(args, "--setting-sources"), ["user"], "the pull request's own .claude commands and skills don't load");
    assert.deepEqual(after(args, "--tools"), ["Read", "Grep", "Glob", "Bash"]);
    assert.deepEqual(after(args, "--allowedTools"), [
      `Read(/${tree}/**)`,
      `Read(/${run}/**)`,
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(git show:*)",
      "Bash(git blame:*)",
      "Bash(git merge-base:*)",
      "Bash(git rev-parse:*)",
      "Bash(git ls-files:*)",
    ]);
    assert.deepEqual(after(args, "--add-dir"), [run]);
    assert.deepEqual(after(args, "--model"), ["opus"]);
    assert.deepEqual(args.slice(-2), ["--effort", "high"]);
    assert.equal(JSON.parse(after(args, "--settings")[0]).sandbox.enabled, true);
  });
});

describe("readCodeReview", () => {
  test("takes the report from a real /code-review stream, with the tokens from modelUsage", () => {
    const review = readCodeReview(readFileSync(new URL("./fixtures/claude-code-review.jsonl", import.meta.url), "utf8"));
    assert.match(review.report, /^work\/checkout\/pay\.js:4 — `return balance` when `amount > balance` is wrong/);
    assert.deepEqual(review.result && { subtype: review.result.subtype, isError: review.result.isError }, { subtype: "success", isError: false });
    assert.equal(review.costUsd, 0.001788855);
    assert.deepEqual(review.tokens, { input: 4 + 10513 + 10033, cachedInput: 10033, output: 748 });
    assert.equal(review.model, "claude-haiku-5-5");
  });

  test("adds what the skill passed to ReportFindings, which doesn't always come back as text", () => {
    const findings = { findings: [{ file: "pay.js", line: 3, summary: "Over-balance charge deducts nothing", failure_scenario: "charge(150, 100) returns 100" }] };
    const review = readCodeReview(
      streamOf(
        { type: "assistant", parent_tool_use_id: "forked-command-code-review", message: { content: [{ type: "tool_use", name: "ReportFindings", input: findings }] } },
        { type: "result", subtype: "success", is_error: false, result: "Command completed", modelUsage: {} },
      ),
    );
    assert.match(review.report, /^Command completed\n\nFindings it reported, as JSON:\n\n/);
    assert.deepEqual(JSON.parse(review.report.split("as JSON:\n\n")[1]), findings);
  });
});

describe("runCodeReview", () => {
  const repo = mkdtempSync(path.join(tmpdir(), "xrayviewer-review-repo-"));
  const request: CodeReviewRequest = { prompt: "You are the Code review agent.", schema: { type: "object" }, cwd: repo, readDirs: [], timeoutMs: 60_000, codeReview: { args: "high a...b --max-findings 8" } };
  const reviewStream = streamOf({
    type: "result",
    subtype: "success",
    is_error: false,
    result: "pay.js:3 — over-balance charge deducts nothing",
    total_cost_usd: 0.02,
    modelUsage: { "claude-opus-5-5": { inputTokens: 10, outputTokens: 4, cacheReadInputTokens: 6 } },
  });

  test("hands the report to the bundle's Claude Code runner and adds up both runs", async () => {
    const { internals, runs } = fakeInternals(() => ok(reviewStream));
    const converted: AgentRequest[] = [];
    const result = await runCodeReview(internals, claude, request, async (_config, next) => {
      converted.push(next);
      return { output: { findings: [] }, costUsd: 0.01, tokens: { input: 5, cachedInput: 0, output: 1 }, model: "claude-opus-5-5", durationMs: 1 };
    });

    assert.equal(runs.length, 1);
    assert.equal(runs[0].args[1], "/code-review high a...b --max-findings 8");
    assert.equal(runs[0].options.cwd, repo);
    assert.equal(runs[0].options.input, undefined);
    assert.equal(converted.length, 1);
    assert.equal(converted[0].prompt, "You are the Code review agent.\n\n## What Claude Code's /code-review reported\n\npay.js:3 — over-balance charge deducts nothing\n");
    assert.ok(converted[0].timeoutMs! <= 180_000);
    assert.deepEqual(result.output, { findings: [] });
    assert.equal(result.costUsd, 0.03);
    assert.deepEqual(result.tokens, { input: 21, cachedInput: 6, output: 5 });
    assert.equal(result.model, "claude-opus-5-5");
  });

  const killedOnAbort = (signal: AbortSignal | undefined) =>
    new Promise<RunResult>((resolve) => {
      const killed = () => resolve({ code: 143, stdout: "", stderr: "", killed: true });
      if (signal?.aborted) killed();
      else signal?.addEventListener("abort", killed, { once: true });
    });
  const shaped: AgentResult = { output: { findings: [] }, costUsd: null, tokens: null, model: null, durationMs: 1 };

  test("both runs share a hard cap of three times the agent time limit", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: 0 });
    const { internals, runs } = fakeInternals(() => {
      t.mock.timers.tick(45_000);
      return ok(reviewStream);
    });
    const converted: AgentRequest[] = [];
    await runCodeReview(internals, claude, request, async (_config, next) => {
      converted.push(next);
      return shaped;
    });

    assert.equal(runs[0].options.timeoutMs, 180_000);
    assert.equal(converted[0].timeoutMs, 135_000);
  });

  test("a /code-review that keeps sending events runs past the stall limit", async () => {
    const { internals } = fakeInternals(async ({ options }) => {
      for (let i = 0; i < 6; i++) {
        await delay(10);
        options.onStdout?.(streamOf({ type: "assistant", message: { content: [] } }));
      }
      return ok(reviewStream);
    });

    const result = await runCodeReview(internals, claude, request, async () => shaped, 30);

    assert.deepEqual(result.output, { findings: [] });
  });

  test("stops a /code-review that sends nothing for the stall limit", async () => {
    const { internals } = fakeInternals(({ options }) => killedOnAbort(options.signal));

    await assert.rejects(runCodeReview(internals, claude, request, async () => shaped, 20), (error: unknown) => {
      assert.ok(error instanceof HarnessError);
      assert.equal(error.kind, "timeout");
      assert.match(error.message, /^Claude Code's \/code-review made no progress for \d+ minutes and was stopped\.$/);
      return true;
    });
  });

  test("stops the run that shapes the report when it sends nothing for the stall limit, and says /code-review reported", async () => {
    const { internals } = fakeInternals(() => ok(reviewStream));
    const silent = async (_config: ClaudeConfig, next: AgentRequest): Promise<never> => {
      await killedOnAbort(next.signal);
      throw new HarnessError("cancelled", "Stopped.");
    };

    await assert.rejects(runCodeReview(internals, claude, request, silent, 20), (error: unknown) => {
      assert.ok(error instanceof HarnessError);
      assert.equal(error.kind, "timeout");
      assert.match(error.message, /\/code-review reported, but turning its report into findings made no progress for \d+ minutes/);
      return true;
    });
  });

  test("the run that shapes the report counts each event it sends as progress", async () => {
    const { internals } = fakeInternals(() => ok(reviewStream));
    const fed: string[] = [];
    const busy = async (_config: ClaudeConfig, next: AgentRequest): Promise<AgentResult> => {
      const feed = next.activity!.stream("claude");
      for (let i = 0; i < 6; i++) {
        await delay(10);
        feed(`event ${i}\n`);
      }
      assert.equal(next.signal?.aborted, false);
      return shaped;
    };
    const activity = { stream: () => (chunk: string) => fed.push(chunk) };

    await runCodeReview(internals, claude, { ...request, activity }, busy, 30);

    assert.equal(fed.length, 6, "events still reach the activity log");
  });

  test("says the hard cap was reached when the run that shapes the report runs out of time", async () => {
    const { internals } = fakeInternals(() => ok(reviewStream));
    const slow = async (): Promise<never> => {
      throw new HarnessError("timeout", "The agent took too long and was stopped.");
    };

    await assert.rejects(runCodeReview(internals, claude, request, slow), (error: unknown) => {
      assert.ok(error instanceof HarnessError);
      assert.equal(error.kind, "timeout");
      assert.match(error.message, /\/code-review reported, but turning its report into findings took longer than 3 minutes, three times xrayviewer\.agents\.timeoutMinutes/);
      return true;
    });
  });

  test("stopping the review still reads as cancelled in either run", async () => {
    const first = new AbortController();
    const { internals: whileReviewing } = fakeInternals(({ options }) => {
      first.abort();
      return killedOnAbort(options.signal);
    });
    await assert.rejects(runCodeReview(whileReviewing, claude, { ...request, signal: first.signal }, async () => shaped, 1_000), { kind: "cancelled" });

    const second = new AbortController();
    const { internals: whileShaping } = fakeInternals(() => ok(reviewStream));
    const stopped = async (_config: ClaudeConfig, next: AgentRequest): Promise<never> => {
      second.abort();
      await killedOnAbort(next.signal);
      throw new HarnessError("cancelled", "Stopped.");
    };
    await assert.rejects(runCodeReview(whileShaping, claude, { ...request, signal: second.signal }, stopped, 1_000), { kind: "cancelled" });
  });

  test("a shaped reply that doesn't parse is fixed without running /code-review again, and the total counts all three runs", async () => {
    const { internals, runs } = fakeInternals(() => ok(reviewStream));
    const shaped: AgentRequest[] = [];
    const used = { costUsd: 0.01, tokens: { input: 5, cachedInput: 0, output: 1 }, model: "claude-opus-5-5" };
    const runClaude = async (_config: ClaudeConfig, next: AgentRequest): Promise<AgentResult> => {
      shaped.push(next);
      if (shaped.length === 1) throw unreadable(new HarnessError("badOutput", "Claude Code didn't return structured output."), '{"findings":[}', used);
      return { output: { findings: [] }, ...used, durationMs: 1 };
    };
    const dispatch = (config: ClaudeConfig, next: CodeReviewRequest) => (next.codeReview ? runCodeReview(internals, config, next, runClaude) : runClaude(config, next));

    const result = await fixReply(internals, dispatch, () => {}, claude, request);

    assert.equal(runs.length, 1, "/code-review runs once");
    assert.equal(shaped.length, 2);
    assert.match(shaped[1].prompt, /doesn't parse/);
    assert.deepEqual(result.output, { findings: [] });
    assert.equal(result.costUsd?.toFixed(2), "0.04");
    assert.deepEqual(result.tokens, { input: 26, cachedInput: 6, output: 6 });
  });

  test("reports a failed, signed-out, stopped or silent /code-review in X-RayViewer's words", async () => {
    const never = async (): Promise<never> => {
      throw new Error("the report isn't converted after a failure");
    };
    const cases = [
      { run: { code: 1, stdout: "", stderr: "boom", killed: false }, kind: "failed", message: /Claude Code failed \(1\): boom/ },
      { run: ok(streamOf({ type: "result", subtype: "success", is_error: true, result: "Not logged in · Please run /login" })), kind: "auth", message: /Not logged in/ },
      { run: ok(streamOf({ type: "result", subtype: "error_max_turns", is_error: false, result: "" })), kind: "failed", message: /error_max_turns/ },
      { run: { code: 0, stdout: "", stderr: "", killed: true }, kind: "timeout", message: /^Claude Code's \/code-review took longer than 3 minutes, three times xrayviewer\.agents\.timeoutMinutes, and was stopped\.$/ },
      { run: ok(streamOf({ type: "result", subtype: "success", is_error: false, result: "  " })), kind: "badOutput", message: /didn't report anything/ },
    ];
    for (const failure of cases) {
      const { internals } = fakeInternals(() => failure.run);
      await assert.rejects(runCodeReview(internals, claude, request, never), (error: unknown) => {
        assert.ok(error instanceof HarnessError);
        assert.equal(error.kind, failure.kind);
        assert.match(error.message, failure.message);
        return true;
      });
    }
  });
});
