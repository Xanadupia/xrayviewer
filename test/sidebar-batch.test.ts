import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { agentUnavailable, comparePullRequests } from "../src/agent-pool.ts";
import { armAutoPost, bindSelectionBar, chosenPullRequests, clearAutoPost, clearChecked, isChecked, selectionBarHTML, setChecked, sidebarBadge, wantsAutoPost } from "../src/sidebar-batch.ts";

const row = (title: string, extra: Record<string, unknown> = {}) => ({
  record: { key: { owner: "acme", name: "app", number: 1 }, summary: { title, updatedAt: "2026-10-01", createdAt: "2026-09-01", additions: 1, deletions: 1 }, ...((extra.record as object) || {}) },
  risk: { score: 1 },
  ...extra,
});

describe("sidebar order", () => {
  test("sorts inside a group by the chosen key", () => {
    const rows = [
      row("Bravo", { risk: { score: 10 }, record: { key: { number: 3 }, summary: { title: "Bravo", updatedAt: "2026-10-01", createdAt: "2026-09-01", additions: 2, deletions: 1 } } }),
      row("alpha", { risk: { score: 40 }, record: { key: { number: 9 }, summary: { title: "alpha", updatedAt: "2026-10-20", createdAt: "2026-10-02", additions: 100, deletions: 20 } } }),
      row("Charlie", { risk: { score: 20 }, record: { key: { number: 1 }, summary: { title: "Charlie", updatedAt: "2026-10-10", createdAt: "2026-08-01", additions: 4, deletions: 0 } } }),
    ];
    const titles = (sortBy: string) => [...rows].sort(comparePullRequests(sortBy)).map((item) => item.record.summary.title);

    assert.deepEqual(titles("risk"), ["alpha", "Charlie", "Bravo"]);
    assert.deepEqual(titles("updated"), ["alpha", "Charlie", "Bravo"]);
    assert.deepEqual(titles("created"), ["alpha", "Bravo", "Charlie"]);
    assert.deepEqual(titles("title"), ["alpha", "Bravo", "Charlie"]);
    assert.deepEqual(titles("size"), ["alpha", "Charlie", "Bravo"]);
    assert.deepEqual(titles("number"), ["alpha", "Bravo", "Charlie"]);
  });
});

describe("opening a selection", () => {
  const pr = (number: number) => ({ kind: "pr", record: { key: { owner: "acme", name: "app", number } } });

  test("checks at most five pull requests", () => {
    clearChecked();
    for (let number = 1; number <= 5; number += 1) assert.equal(setChecked(`acme/app#${number}`, true).ok, true);
    assert.equal(setChecked("acme/app#6", true).ok, false);
    assert.equal(isChecked("acme/app#6"), false);
    assert.equal(setChecked("acme/app#2", false).ok, true);
    assert.equal(setChecked("acme/app#6", true).ok, true);
    clearChecked();
    assert.equal(isChecked("acme/app#1"), false);
  });

  test("keeps at most five pull requests and ignores groups", () => {
    const rows = [pr(1), { kind: "group" }, pr(2), pr(3), pr(4), pr(5), pr(6), pr(7)];
    const pick = chosenPullRequests(rows);

    assert.deepEqual(pick.chosen.map((item) => item.record?.key?.number), [1, 2, 3, 4, 5]);
    assert.equal(pick.leftOut, 2);
  });

  test("remembers which opened reviews should post when the agents finish", () => {
    clearAutoPost("Acme/App#4");
    assert.equal(wantsAutoPost("acme/app#4"), false);
    armAutoPost("Acme/App#4");
    assert.equal(wantsAutoPost("acme/app#4"), true);
    clearAutoPost("acme/app#4");
    assert.equal(wantsAutoPost("Acme/App#4"), false);
  });
});

describe("a busy agent", () => {
  test("is paused and tried again, while a real failure is not", () => {
    assert.equal(agentUnavailable(new Error("resource temporarily unavailable")), true);
    assert.equal(agentUnavailable({ message: "another instance is already running", detail: "locked" }), true);
    assert.equal(agentUnavailable("Claude Code: 429 too many requests"), true);
    assert.equal(agentUnavailable(new Error("Claude Code isn't signed in.")), false);
    assert.equal(agentUnavailable(new Error("The agent took too long and was stopped.")), false);
  });
});

describe("selection buttons", () => {
  test("uses the same filled, centered button as the empty pull-request view", () => {
    const html = selectionBarHTML(`ab'c`, 2);
    assert.match(html, /--vscode-button-background/);
    assert.match(html, /border-radius: 4px/);
    assert.match(html, /padding: 0 20px 1em/);
    assert.equal(html.includes("'c"), false);
  });

  test("says how many pull requests each button acts on", () => {
    assert.match(selectionBarHTML("n", 1), /<a href="command:xrayviewer\.openSelected">Open 1 pull request<\/a>/);
    assert.match(selectionBarHTML("n", 3), /<a href="command:xrayviewer\.openSelected">Open 3 pull requests<\/a>/);
    assert.match(selectionBarHTML("n", 3), /<a href="command:xrayviewer\.runSelected">Review 3 and post<\/a>/);
  });

  test("dims both buttons and runs nothing while no pull request is checked", () => {
    const html = selectionBarHTML("n");
    assert.match(html, /<a role="link" aria-disabled="true">Open selected PRs<\/a>/);
    assert.match(html, /<a role="link" aria-disabled="true">Review all selected and post<\/a>/);
    assert.equal(html.includes("command:"), false);
  });

  test("keeps the label readable on hover, over the webview's link colors", () => {
    assert.match(selectionBarHTML("n", 1), /a:hover, a:focus, a:active \{ color: var\(--vscode-button-foreground\); \}/);
  });

  test("draws again with the count in the section title whenever a check changes, until the view goes away", () => {
    clearChecked();
    let dispose = () => {};
    const view = { title: "", description: "", webview: { html: "" }, onDidDispose: (fn: () => void) => (dispose = fn) };
    bindSelectionBar(view);
    assert.deepEqual([view.title, view.description], ["Selection", "Check up to 5 pull requests"]);

    setChecked("acme/app#1", true);
    assert.deepEqual([view.title, view.description], ["1 selected", ""]);
    assert.match(view.webview.html, /Review 1 and post/);
    setChecked("acme/app#9", true);
    setChecked("acme/app#1", false);
    assert.match(view.webview.html, /Open 1 pull request</);
    clearChecked();
    assert.match(view.webview.html, /aria-disabled/);

    dispose();
    setChecked("acme/app#2", true);
    assert.equal(view.title, "Selection", "a closed view is left alone");
    clearChecked();
  });
});

describe("the activity bar count", () => {
  const pr = (summary: Record<string, unknown> | null) => ({ summary: summary as never });

  test("counts open pull requests that request your review by name", () => {
    const records = [
      pr({ state: "OPEN", reasons: ["review-requested"] }),
      pr({ reasons: ["review-requested", "assigned"] }),
      pr({ state: "OPEN", reasons: ["team-requested"] }),
      pr({ state: "OPEN", isDraft: true, reasons: ["review-requested"] }),
      pr({ state: "MERGED", reasons: ["review-requested"] }),
      pr(null),
    ];
    assert.deepEqual(sidebarBadge(records), { value: 2, tooltip: "2 pull requests waiting for your review" });
    assert.equal(sidebarBadge(records, 1)?.tooltip, "2 pull requests waiting for your review · 1 agent run in progress");
  });

  test("shows no count when nothing waits for you, even while agents run", () => {
    assert.equal(sidebarBadge([pr({ state: "OPEN", reasons: ["authored"] })], 3), undefined);
  });
});
