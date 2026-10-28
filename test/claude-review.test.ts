import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import {
  CODE_REVIEW_ID,
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
import type { AgentRequest, AgentResult } from "../src/cursor-harness.ts";
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

describe("planCodeReview", () => {
  test("runs /code-review once in place of the reviewer agents on Claude Code; the guide and other harnesses stay", () => {
    const plan = planCodeReview(selection, settings, harnessOf, "guide", { extraArgs: ["--effort", "xhigh"] }, range);

    assert.deepEqual(plan.run, ["guide", "security", CODE_REVIEW_ID]);
    assert.deepEqual(plan.skipped.map((s) => s.id), ["tests", "architecture", "correctness"]);
    assert.match(plan.skipped[1].why, /\/code-review reviews in its place, with this agent's instructions/);
    const review = plan.settings.agents[CODE_REVIEW_ID];
    assert.equal(review.name, "Code review agent");
    assert.equal(review.focus, "Claude Code's /code-review, run once for the Architecture and Correctness agents");
    assert.equal(review.harness, "claude");
    assert.equal(review.model, "opus", "the first replaced agent's model");
    assert.equal(review.maxFindings, 16, "the report's 8 plus each replaced agent's own limit");
    assert.equal(review.minConfidence, "minor");
    assert.deepEqual(review.codeReview, { args: "xhigh 1111111...2222222 --max-findings 8", agents: ["architecture", "correctness"] });
    assert.equal(plan.settings.severity, settings.severity, "the rest of the settings carry over");
    assert.equal(settings.agents[CODE_REVIEW_ID], undefined, "the settings passed in are left as they were");
  });

  test("hands the run that shapes the report each replaced agent's instructions, limit, confidence and skipped files", () => {
    const { instructions } = planCodeReview(selection, settings, harnessOf, "guide", undefined, range).settings.agents[CODE_REVIEW_ID];
    const [lead, architecture, correctness] = instructions.split(/^(?=## )/m);

    assert.match(lead, /Return every finding it reported, in the shape below, with `agent` set to "claude-code-review"/);
    assert.match(lead, /Add a finding for a problem they describe that the report missed, with `agent` set to that agent's id, only when you confirm it by reading the code/);
    assert.equal(
      architecture.trim(),
      [
        '## Architecture agent (`agent`: "architecture")',
        'Focus: Where code lives. At most 3 findings. No "Minor" findings. Skip files matching `**/*.lock`, `docs/**`.',
        "### Look for\n\nHelpers that duplicate existing ones.\n\n### Leave alone\n\nNaming.",
      ].join("\n\n"),
    );
    assert.equal(correctness.trim(), '## Correctness agent (`agent`: "correctness")\n\nAt most 5 findings.\n\nOff-by-one errors.');
    assert.ok(!instructions.includes("Security agent"), "an agent on another harness runs on its own");
  });

  test("caps /code-review at the 32 findings it reports; the shaping run adds each agent's limit", () => {
    const many: ReviewSettings = { agents: { a: agent("A agent", { maxFindings: 20 }), b: agent("B agent", { maxFindings: 20 }) } };
    const plan = planCodeReview({ run: ["a", "b"], skipped: [] }, many, () => "claude", "guide", undefined, range);
    assert.equal(plan.settings.agents[CODE_REVIEW_ID].maxFindings, 72);
    assert.match(plan.settings.agents[CODE_REVIEW_ID].codeReview!.args, /--max-findings 32$/);
    assert.equal(plan.settings.agents[CODE_REVIEW_ID].focus, "Claude Code's /code-review, run once for the A and B agents");
  });

  test("changes nothing without a reviewer on Claude Code, without a range, or when agents.yml has the id", () => {
    const codexOnly = planCodeReview(selection, settings, (id) => (id === "guide" ? "claude" : "codex"), "guide", undefined, range);
    assert.deepEqual(codexOnly.run, selection.run);
    assert.equal(codexOnly.settings, settings);

    assert.deepEqual(planCodeReview(selection, settings, harnessOf, "guide", undefined, null).run, selection.run);

    const taken: ReviewSettings = { agents: { ...settings.agents, [CODE_REVIEW_ID]: agent("Mine agent") } };
    assert.deepEqual(planCodeReview(selection, taken, harnessOf, "guide", undefined, range).run, selection.run);
  });

  test("leaves the skill's own level when the effort isn't one /code-review knows", () => {
    assert.equal(codeReviewLevel(["--effort", "high"]), "high");
    assert.equal(codeReviewLevel(["--effort=max"]), "max");
    assert.equal(codeReviewLevel([]), "");
    assert.equal(codeReviewLevel(["--effort", "turbo"]), "");
    const plan = planCodeReview(selection, settings, harnessOf, "guide", { extraArgs: [] }, range);
    assert.equal(plan.settings.agents[CODE_REVIEW_ID].codeReview!.args, "1111111...2222222 --max-findings 8");
  });

  test("runs at the highest level a replaced agent runs at, its own or the one every Claude Code agent shares", () => {
    const withLevels = (architecture: string, correctness: string, shared: string[]) => {
      const own: ReviewSettings = {
        agents: {
          ...settings.agents,
          architecture: { ...settings.agents.architecture, effort: architecture },
          correctness: { ...settings.agents.correctness, effort: correctness },
        },
      };
      const review = planCodeReview(selection, own, harnessOf, "guide", { extraArgs: shared }, range).settings.agents[CODE_REVIEW_ID];
      return [review.effort, review.codeReview!.args.split(" ")[0]];
    };

    assert.deepEqual(withLevels("max", "", ["--effort", "high"]), ["max", "max"]);
    assert.deepEqual(withLevels("low", "", ["--effort", "high"]), ["high", "high"], "an agent without its own level runs at the shared one");
    assert.deepEqual(withLevels("low", "medium", ["--effort", "xhigh"]), ["medium", "medium"]);
    assert.deepEqual(withLevels("turbo", "", ["--effort", "low"]), ["low", "low"], "a level /code-review doesn't know falls back to the shared one");
    assert.deepEqual(withLevels("", "", []), ["", "1111111...2222222"], "none at all leaves the skill's own default");
  });
});

describe("the agent on each code review finding", () => {
  const plan = planCodeReview(selection, settings, harnessOf, "guide", undefined, range);
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
  test("shows one Code review agent on the model line for the Claude Code reviewers", () => {
    const planned: PlannedAgent[] = [
      { id: "guide", name: "Guide agent", short: "Guide", harness: "claude", model: "Opus 5.5", thinking: "xhigh" },
      { id: "architecture", name: "Architecture agent", short: "Architecture", harness: "claude", model: "Opus 5.5", thinking: "xhigh" },
      { id: "correctness", name: "Correctness agent", short: "Correctness", harness: "claude", model: "Opus 5.5", thinking: "xhigh" },
      { id: "security", name: "Security agent", short: "Security", harness: "codex", model: "gpt-6.1-sol", thinking: "" },
    ];
    assert.deepEqual(
      plannedWithCodeReview(planned, "guide").map((a) => [a.id, a.short, a.harness, a.model]),
      [
        ["guide", "Guide", "claude", "Opus 5.5"],
        ["security", "Security", "codex", "gpt-6.1-sol"],
        [CODE_REVIEW_ID, "Code review", "claude", "Opus 5.5"],
      ],
    );
    assert.equal(plannedWithCodeReview(planned.slice(3), "guide").length, 1);
  });

  test("shows the highest level among the reviewers it runs for", () => {
    const row = (id: string, thinking: string): PlannedAgent => ({ id, name: `${id} agent`, short: id, harness: "claude", model: "Opus 5.5", thinking });
    const shown = (...levels: string[]) => plannedWithCodeReview([row("guide", "low"), ...levels.map((level, i) => row(`r${i}`, level))], "guide").at(-1)!.thinking;
    assert.equal(shown("high", "max", "low"), "max");
    assert.equal(shown("", "medium"), "medium");
    assert.equal(shown("turbo"), "turbo", "a level it doesn't know is shown as it is");
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
    assert.ok(converted[0].timeoutMs! <= 60_000);
    assert.deepEqual(result.output, { findings: [] });
    assert.equal(result.costUsd, 0.03);
    assert.deepEqual(result.tokens, { input: 21, cachedInput: 6, output: 5 });
    assert.equal(result.model, "claude-opus-5-5");
  });

  test("the run that shapes the report gets the full time limit, however long /code-review took", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: 0 });
    const { internals } = fakeInternals(() => {
      t.mock.timers.tick(45_000);
      return ok(reviewStream);
    });
    const converted: AgentRequest[] = [];
    await runCodeReview(internals, claude, request, async (_config, next) => {
      converted.push(next);
      return { output: { findings: [] }, costUsd: null, tokens: null, model: null, durationMs: 1 };
    });

    assert.equal(converted[0].timeoutMs, 60_000);
  });

  test("says /code-review reported when the run that shapes its report runs out of time", async () => {
    const { internals } = fakeInternals(() => ok(reviewStream));
    const slow = async (): Promise<never> => {
      throw new HarnessError("timeout", "The agent took too long and was stopped.");
    };

    await assert.rejects(runCodeReview(internals, claude, request, slow), (error: unknown) => {
      assert.ok(error instanceof HarnessError);
      assert.equal(error.kind, "timeout");
      assert.match(error.message, /\/code-review reported, but turning its report into findings took too long/);
      return true;
    });
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
      { run: { code: 0, stdout: "", stderr: "", killed: true }, kind: "timeout", message: /took too long/ },
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
