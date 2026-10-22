import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { activityGroups, activityHTML, activitySummary, activityTime } from "../scripts/activity-ui.mjs";

const esc = (s: string) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const icon = (name: string, cls = "") => `<i data-icon="${name}"${cls ? ` class="${cls}"` : ""}></i>`;
const view = (open = new Map<string, boolean>(), now = 100_000, detail = "") => ({ esc, icon, now, open, detail, avatar: '<span class="agent-av xs"></span>' });
const detailView = (detail: string, open = new Map<string, boolean>()) => view(open, 100_000, detail);

type Step = { id: string; kind: string; title: string; state: string; startedAt: number; ms?: number; detail?: string; sub?: boolean };
let seq = 0;
const step = (kind: string, title: string, state = "done", extra: Partial<Step> = {}): Step => ({ id: `s${++seq}`, kind, title, state, startedAt: 0, ...extra });
const openKeys = (html: string) => [...html.matchAll(/data-key="([^"]+)" data-was="1" open/g)].map((m) => m[1]);
const text = (html: string, cls: string) =>
  [...html.matchAll(new RegExp(`<(span|b|button)\\b[^>]*? class="${cls}"[^>]*>(.*?)</\\1>`, "g"))].map((m) => m[2].replace(/<[^>]+>/g, ""));

describe("activityTime", () => {
  test("reads like a job timer", () => {
    assert.equal(activityTime(400), "0s");
    assert.equal(activityTime(12_400), "12s");
    assert.equal(activityTime(65_000), "1m 05s");
    assert.equal(activityTime(3_725_000), "1h 02m");
    assert.equal(activityTime(-5), "0s");
  });
});

describe("activityGroups", () => {
  test("folds the steps between two messages into one group", () => {
    const steps = [step("message", "Looking."), step("read", "a.js"), step("command", "ls"), step("message", "Found it."), step("search", "add")];

    assert.deepEqual(
      activityGroups(steps).map((group) => (group.kind === "message" ? group.step.title : group.steps.map((s) => s.title))),
      ["Looking.", ["a.js", "ls"], "Found it.", ["add"]],
    );
  });
});

describe("activitySummary", () => {
  test("counts what a group did, naming a single file or pattern", () => {
    const steps = [step("command", "ls"), step("command", "git diff"), step("read", "src/a.js"), step("search", "TODO"), step("thinking", "Hmm.")];

    assert.equal(activitySummary(steps, false), "Ran 2 commands, read src/a.js, searched TODO, thought");
  });

  test("names up to two tools and counts more", () => {
    assert.equal(activitySummary([step("tool", "Ran /code-review"), step("tool", "Wrote its answer")], false), "Ran /code-review, wrote its answer");
    assert.equal(activitySummary([step("tool", "a"), step("tool", "b"), step("tool", "c")], false), "Used 3 tools");
  });

  test("says what's running now, and how many steps failed", () => {
    const steps = [step("read", "a.js"), step("read", "b.js"), step("command", "npm test", "failed"), step("command", "npm run lint\n--fix", "running")];

    assert.equal(activitySummary(steps, true), "Ran 1 command, read 2 files, 1 failed, running npm run lint");
    assert.equal(activitySummary(steps, false), "Ran 2 commands, read 2 files, 1 failed", "a step left running after its agent stopped counts as done");
  });
});

describe("activityHTML: the agents, like GitHub's checks", () => {
  const plan = [
    { id: "correctness", name: "Correctness agent", harness: "codex", model: "gpt-5.5" },
    { id: "tests", name: "Test agent", harness: "cursor", model: "" },
  ];

  test("invites a run when there's no progress yet", () => {
    assert.match(activityHTML(null, plan, view()), /class="act-empty">No agent run on this pull request yet/);
  });

  test("sums the agents up, then lists them under their status in GitHub's order, all open", () => {
    const progress = {
      agents: {
        style: { state: "skipped", error: "Turned off" },
        correctness: { state: "running", harness: "codex", startedAt: 28_000 },
        tests: { state: "done", harness: "cursor", ms: 41_000, costUsd: 0.0123 },
        security: { state: "failed", harness: "codex", ms: 65_000 },
      },
      activity: {},
    };
    const html = activityHTML(progress, plan, view());

    assert.deepEqual(text(html, "checks-title"), ["Some agents haven't finished yet"]);
    assert.deepEqual(text(html, "checks-tally"), ["1 failing, 1 in progress, 1 skipped, 1 successful agents"]);
    assert.deepEqual(text(html, "checks-group-name"), ["1 failing agent", "1 agent in progress", "1 skipped agent", "1 successful agent"]);
    assert.deepEqual(openKeys(html), ["c:failing", "c:progress", "c:skipped", "c:successful"]);
    assert.deepEqual(text(html, "check-name"), ["Security / Codex", "Correctness agent / Codex · gpt-5.5", "Style", "Test agent / Cursor Agent · CLI default"]);
    assert.deepEqual(text(html, "check-status"), ["Failed after 1m 05s", "In progress for 1m 12s", "Skipped: Turned off", "Successful in 41s"]);
    assert.match(html, /In progress for <span class="act-time" data-since="28000">1m 12s<\/span>/, "the running clock ticks");
    assert.match(html, /<span class="check-pill">\$0\.012<\/span>/);
    assert.equal(html.includes('class="checks-ring is-live"'), true, "the ring turns while agents run");
  });

  test("gives every agent View details, in its ⋯ menu and on its name", () => {
    const html = activityHTML({ agents: { correctness: { state: "done", harness: "codex", ms: 1_000 } }, activity: {} }, plan, view());

    assert.match(html, /<button type="button" class="check-name" data-act="activity-detail" data-id="correctness">/);
    assert.match(html, /<summary tabindex="0" aria-label="More for Correctness agent" title="More">[\s\S]*?<div class="check-menu" role="menu"><button type="button" role="menuitem" data-act="activity-detail" data-id="correctness"><i data-icon="arrow"><\/i>View details<\/button>/);
    assert.deepEqual(openKeys(html), ["c:successful"], "the menu starts closed");
    assert.deepEqual(openKeys(activityHTML({ agents: { correctness: { state: "done" } }, activity: {} }, plan, view(new Map([["m:correctness", true]])))), ["c:successful", "m:correctness"], "an open menu stays open as progress arrives");
  });

  test("says all agents have finished, or that some were not successful, once nothing runs", () => {
    const done = activityHTML({ agents: { correctness: { state: "done" }, style: { state: "skipped" } }, activity: {} }, plan, view());
    const failed = activityHTML({ agents: { correctness: { state: "done" }, tests: { state: "cancelled" } }, activity: {} }, plan, view());

    assert.deepEqual([...text(done, "checks-title"), ...text(done, "checks-tally")], ["All agents have finished", "1 skipped, 1 successful agents"]);
    assert.deepEqual(text(failed, "checks-title"), ["Some agents were not successful"]);
    assert.equal(done.includes("is-live"), false);
  });

  test("draws the ring in parts: green for successful, red for failing, amber for running and queued", () => {
    const html = activityHTML({ agents: { a: { state: "done" }, b: { state: "failed" }, c: { state: "running" }, d: { state: "queued" } }, activity: {} }, plan, view());

    assert.deepEqual([...html.matchAll(/stroke="var\(--([a-z0-9-]+)\)"/g)].map((m) => m[1]), ["ok", "bad", "warn", "warn"]);
  });

  test("lists the agents /code-review covers under the Code review agent, in its state, not as skipped", () => {
    const covered = (name: string) => ({ state: "skipped", error: "Claude Code's /code-review reviews in its place", by: "claude-code-review", name });
    const progress = {
      agents: {
        guide: { state: "running", harness: "claude", startedAt: 90_000 },
        style: { state: "skipped", error: "Turned off" },
        architecture: covered("Architecture agent"),
        tests: covered("Test agent"),
        "claude-code-review": { state: "running", harness: "claude", startedAt: 83_000 },
      },
      activity: { "claude-code-review": { steps: [step("command", "git diff --stat")], dropped: 0 } },
    };
    const reviewPlan = [
      { id: "guide", name: "Guide agent", harness: "claude", model: "Opus 5.5" },
      { id: "claude-code-review", name: "Code review agent", harness: "claude", model: "Opus 5.5" },
    ];
    const html = activityHTML(progress, reviewPlan, view());

    assert.deepEqual(text(html, "checks-tally"), ["2 in progress, 1 skipped agents"]);
    assert.deepEqual(text(html, "checks-group-name"), ["2 agents in progress", "1 skipped agent"]);
    assert.deepEqual(text(html, "check-name"), [
      "Guide agent / Claude Code · Opus 5.5",
      "Code review agent / Claude Code · Opus 5.5",
      "Architecture agent / Claude Code · Opus 5.5",
      "Test agent / Claude Code · Opus 5.5",
      "Style",
    ]);
    assert.deepEqual(text(html, "check-status").slice(2, 4), ["Covered by Code review agent · In progress for 17s", "Covered by Code review agent · In progress for 17s"]);
    assert.equal(html.match(/class="check is-running is-sub"/g)?.length, 2);

    const detail = activityHTML(progress, reviewPlan, detailView("architecture"));
    assert.match(detail, /<b class="job-name">Architecture agent<\/b><span class="job-meta">Claude Code · Opus 5\.5<\/span><span class="job-status">Covered by Code review agent · In progress/);
    assert.match(detail, /Code review agent reviews for this agent, using its instructions, and its findings for it show under Architecture agent\. Its steps:/);
    assert.match(detail, /git diff --stat/);
  });

  test("names the summary run and agents missing from the plan", () => {
    const html = activityHTML({ agents: { lede: { state: "queued" }, "risky-code": { state: "queued" } }, activity: {} }, plan, view());

    assert.deepEqual(text(html, "check-name"), ["Summary", "Risky code"]);
    assert.deepEqual(text(html, "check-status"), ["Queued", "Queued"]);
  });
});

describe("activityHTML: one agent's log, like a GitHub job", () => {
  const plan = [{ id: "correctness", name: "Correctness agent", harness: "codex", model: "gpt-5.5" }];

  test("heads the log with the agent's status, a way back to all agents, and its time", () => {
    const html = activityHTML({ agents: { correctness: { state: "done", harness: "codex", ms: 41_000, costUsd: 0.5 } }, activity: {} }, plan, detailView("correctness"));

    assert.match(html, /<button type="button" class="act-back" data-act="activity-back"><i data-icon="left"><\/i>All agents<\/button>/);
    assert.match(html, /<b class="job-name">Correctness agent<\/b><span class="job-meta">Codex · gpt-5\.5<\/span><span class="job-status">Successful in 41s<\/span>/);
    assert.match(html, /<span class="check-pill">\$0\.500<\/span>/);
    assert.equal(html.includes('class="checks"'), false);
  });

  test("goes back to all agents when the agent it shows is gone", () => {
    assert.match(activityHTML({ agents: { tests: { state: "done" } }, activity: {} }, plan, detailView("correctness")), /class="checks"/);
  });

  test("shows messages as text and folds the steps between them, opening the group that's running", () => {
    const steps = [
      step("message", "Reading `cart.js` <first>."),
      step("read", "src/cart.js"),
      step("command", "npm test", "done", { detail: "ok", ms: 3_000 }),
      step("command", "npm run lint", "running", { startedAt: 95_000 }),
    ];
    const html = activityHTML({ agents: { correctness: { state: "running", harness: "codex", startedAt: 0 } }, activity: { correctness: { steps, dropped: 0 } } }, plan, detailView("correctness"));

    assert.match(html, /<p class="act-msg">Reading <code>cart\.js<\/code> &#60;first&#62;\.<\/p>/, "messages are escaped, with inline code");
    assert.match(html, /<span class="act-sum">Ran 1 command, read src\/cart\.js, running npm run lint<\/span><span class="spin"/);
    assert.match(html, /<span class="act-verb">Ran<\/span><code class="act-title">npm test<\/code><span class="act-time">3s<\/span><\/summary><pre class="act-out" aria-label="Output">ok<\/pre>/);
    assert.match(html, /<code class="act-title">npm run lint<\/code><span class="act-time" data-since="95000">5s<\/span>/);
    assert.deepEqual(openKeys(html), [`g:correctness:${steps[1].id}`]);
  });

  test("keeps the rows the reader opened or closed", () => {
    const steps = [step("read", "a.js"), step("command", "ls", "done", { detail: "a.js" })];
    const progress = { agents: { correctness: { state: "done", harness: "codex", ms: 1_000 } }, activity: { correctness: { steps, dropped: 0 } } };
    const open = new Map([
      [`g:correctness:${steps[0].id}`, true],
      [`s:correctness:${steps[1].id}`, true],
    ]);

    assert.deepEqual(openKeys(activityHTML(progress, plan, detailView("correctness"))), [], "a finished agent's steps start closed");
    assert.deepEqual(openKeys(activityHTML(progress, plan, detailView("correctness", open))), [...open.keys()]);
  });

  test("shows a failed agent's error and opens the failed step's output", () => {
    const failed = step("command", "npm test", "failed", { detail: "1 failing" });
    const html = activityHTML(
      { agents: { correctness: { state: "failed", harness: "codex", error: "Codex timed out." } }, activity: { correctness: { steps: [failed], dropped: 2 } } },
      plan,
      detailView("correctness"),
    );

    assert.match(html, /<p class="act-note">2 earlier steps aren't shown\.<\/p>/);
    assert.match(html, /<p class="act-error"><i data-icon="alert"><\/i><span>Codex timed out\.<\/span><\/p>/);
    assert.deepEqual(openKeys(html), [`s:correctness:${failed.id}`]);
  });

  test("stops the spinners of an agent that ended with steps still open", () => {
    const html = activityHTML(
      { agents: { correctness: { state: "cancelled", harness: "codex" } }, activity: { correctness: { steps: [step("command", "sleep 99", "running")], dropped: 0 } } },
      plan,
      detailView("correctness"),
    );

    assert.equal(html.includes('class="spin'), false);
    assert.match(html, /<span class="act-sum">Ran 1 command<\/span>/);
  });

  test("explains a log with nothing in it", () => {
    const log = (state: string, harness = "codex") => activityHTML({ agents: { correctness: { state, harness } }, activity: {} }, plan, detailView("correctness"));

    assert.match(log("queued"), /Waiting for a free slot\./);
    assert.match(log("skipped"), /This agent didn't run\./);
    assert.match(log("done"), /No steps reported\./);
  });
});
