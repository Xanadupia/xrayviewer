import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { createActivityLog, unwrapShell, type AgentActivity } from "../src/activity.ts";
import { claudeResult } from "../src/claude-review.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

function stepsOf(harness: string, file: string, roots: string[]) {
  const log = createActivityLog(roots, () => {}, 60_000);
  log.agent("a").stream(harness)(fixture(file));
  return log.snapshot().a;
}

const rows = (activity: AgentActivity) => activity.steps.map((step) => [step.kind, step.title.split("\n")[0], step.state]);

describe("createActivityLog", () => {
  test("reads Cursor Agent's thoughts, messages, reads and searches, with paths relative to the checkout", () => {
    const activity = stepsOf("cursor", "stream-success.ndjson", ["/work/case/repo", "/work/case/rundir"]);

    assert.deepEqual(rows(activity), [
      ["thinking", "Reading the patch and math.js to identify bugs.", "done"],
      ["message", "Reading the patch and `math.js` to identify bugs.", "done"],
      ["read", "diff.patch", "done"],
      ["read", "math.js", "done"],
      ["thinking", "The patch replaces addition with subtraction in the `add` function.", "done"],
      ["search", "add\\(", "done"],
      ["search", "**/*", "done"],
      ["thinking", "Only math.js was changed. The bug is clear.", "done"],
      ["tool", "Wrote its answer", "done"],
    ]);
    assert.equal(activity.steps.some((step) => step.title.includes("/work/case")), false);
  });

  test("reads Codex's messages and the command inside its shell wrapper, with the command's output", () => {
    const activity = stepsOf("codex", "codex-exec.jsonl", []);

    assert.deepEqual(rows(activity), [
      ["message", "I’ll run the shell commands and read `math.js` to check what `add` does.", "done"],
      ["command", "ls", "done"],
      ["message", "`add(a, b)` returns `a - b`, subtracting `b` from `a`.", "done"],
    ]);
    assert.equal(activity.steps[1].title, "ls\ngit log --oneline -1\ncat math.js");
    assert.match(activity.steps[1].detail ?? "", /export const add = \(a, b\) => a - b;$/);
  });

  test("reads Claude Code's commands, including the ones inside a forked /code-review", () => {
    const activity = stepsOf("claude", "claude-stream.jsonl", ["/work/checkout", "/work/run"]);

    assert.deepEqual(
      activity.steps.map((step) => [step.kind, step.title.split(" ")[0], step.state, !!step.sub]),
      [
        ["tool", "Ran", "done", false],
        ["command", "git", "done", true],
        ["command", "cat", "done", false],
        ["command", "grep", "done", false],
        ["tool", "Wrote", "done", false],
      ],
    );
    assert.equal(activity.steps[0].title, "Ran /code-review");
    assert.match(activity.steps[0].detail ?? "", /^Skill "code-review" completed/, "a tool's result keeps its beginning");
  });

  test("shows the report a forked /code-review ends with, and leaves out an answer that's only JSON", () => {
    const log = createActivityLog([], () => {}, 60_000);
    const feed = log.agent("a").stream("claude");
    const forked = { parent_tool_use_id: "toolu_1" };
    feed(`${JSON.stringify({ type: "assistant", ...forked, message: { content: [{ type: "text", text: "Checking the diff." }] } })}\n`);
    feed(`${JSON.stringify({ type: "result", result: "pay.js:2 lets a zero charge through" })}\n`);
    const json = log.agent("b").stream("claude");
    json(`${JSON.stringify({ type: "assistant", ...forked, message: { content: [{ type: "text", text: "Done." }] } })}\n`);
    json(`${JSON.stringify({ type: "result", result: '{"findings":[]}' })}\n`);

    assert.deepEqual(log.snapshot().a.steps.map((step) => [step.kind, step.title, !!step.sub]), [
      ["message", "Checking the diff.", true],
      ["message", "pay.js:2 lets a zero charge through", false],
    ]);
    assert.deepEqual(log.snapshot().b.steps.map((step) => step.title), ["Done."]);
  });

  test("puts back together events split across chunks, and skips lines that aren't JSON", () => {
    const log = createActivityLog([], () => {}, 60_000);
    const feed = log.agent("a").stream("codex");
    const line = JSON.stringify({ type: "item.completed", item: { id: "i1", type: "agent_message", text: "Looking at the diff." } });
    feed("not json\n");
    feed(line.slice(0, 20));
    feed(`${line.slice(20)}\n`);

    assert.deepEqual(rows(log.snapshot().a), [["message", "Looking at the diff.", "done"]]);
  });

  test("times a command from start to finish and marks a failed one", () => {
    let clock = 1_000;
    const log = createActivityLog([], () => {}, 60_000, () => clock);
    const feed = log.agent("a").stream("codex");
    const command = (type: string, extra = {}) => `${JSON.stringify({ type, item: { id: "c1", type: "command_execution", command: "npm test", ...extra } })}\n`;
    feed(command("item.started"));
    assert.equal(log.snapshot().a.steps[0].state, "running");
    clock = 4_500;
    feed(command("item.completed", { exit_code: 1, aggregated_output: "1 failing" }));

    assert.deepEqual(log.snapshot().a.steps[0], { id: "s1", kind: "command", title: "npm test", state: "failed", startedAt: 1_000, ms: 3_500, detail: "1 failing" });
  });

  test("tells the page about new steps at most once per interval", async () => {
    let calls = 0;
    const log = createActivityLog([], () => calls++, 20);
    const feed = log.agent("a").stream("codex");
    for (let i = 0; i < 5; i++) feed(`${JSON.stringify({ type: "item.completed", item: { id: `m${i}`, type: "agent_message", text: `Step ${i}` } })}\n`);
    assert.equal(calls, 0);
    await new Promise((resolve) => setTimeout(resolve, 40));

    assert.equal(calls, 1);
    assert.equal(log.snapshot().a.steps.length, 5);
  });

  test("keeps the latest 200 steps and counts the ones it left out", () => {
    const log = createActivityLog([], () => {}, 60_000);
    const feed = log.agent("a").stream("codex");
    for (let i = 0; i < 205; i++) feed(`${JSON.stringify({ type: "item.completed", item: { id: `m${i}`, type: "agent_message", text: `Step ${i}` } })}\n`);
    const activity = log.snapshot().a;

    assert.equal(activity.steps.length, 200);
    assert.equal(activity.dropped, 5);
    assert.equal(activity.steps[0].title, "Step 5");
  });

  test("lets Pi run without steps, since it doesn't stream them", () => {
    const log = createActivityLog([], () => {}, 60_000);
    log.agent("a").stream("pi")(`${JSON.stringify({ type: "message", text: "hi" })}\n`);

    assert.deepEqual(log.snapshot().a.steps, []);
  });
});

describe("unwrapShell", () => {
  test("reads the command inside zsh -lc and bash -lc", () => {
    assert.equal(unwrapShell('/bin/zsh -lc "git diff --stat"'), "git diff --stat");
    assert.equal(unwrapShell("bash -lc 'rg \"add\" src'"), 'rg "add" src');
    assert.equal(unwrapShell('/bin/zsh -lc "echo \\"hi\\" \\$HOME"'), 'echo "hi" $HOME');
    assert.equal(unwrapShell("git status"), "git status");
  });
});

describe("claudeResult", () => {
  test("reads the result event at the end of Claude Code's stream", () => {
    const stream = [
      JSON.stringify({ type: "system", subtype: "init" }),
      JSON.stringify({ type: "result", structured_output: { lede: "Fine." }, total_cost_usd: 0.01 }),
      "",
    ].join("\n");

    assert.deepEqual(claudeResult(stream), { type: "result", structured_output: { lede: "Fine." }, total_cost_usd: 0.01 });
  });

  test("reads a single JSON reply too", () => {
    assert.deepEqual(claudeResult('{"result":"ok"}'), { result: "ok" });
    assert.throws(() => claudeResult("not json"));
  });
});
