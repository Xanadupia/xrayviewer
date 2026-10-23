import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { bindRunningView, runningRows, type RunningRecord, type RunningVscode } from "../src/running-view.ts";

const NOW = Date.parse("2026-10-23T16:00:00Z");
const minutes = (n: number) => NOW - n * 60_000;

function pr(number: number, run: RunningRecord["run"], title = `Change ${number}`): RunningRecord {
  return { key: { owner: "Motion-Creative", name: "mondrian", number }, summary: { title }, run };
}

const agents = (...states: string[]) => ({ agents: Object.fromEntries(states.map((state, i) => [`a${i}`, { state }])) });

describe("runningRows", () => {
  test("lists only pull requests being reviewed or about to be, running ones first and the longest first", () => {
    const rows = runningRows(
      [
        pr(1, { state: "idle" }),
        pr(2, { state: "queued", startedAt: minutes(1) }),
        pr(3, { state: "running", startedAt: minutes(2), progress: agents("done", "running") }),
        pr(4, { state: "done", startedAt: minutes(30) }),
        pr(5, { state: "running", startedAt: minutes(12), progress: agents("running") }),
        pr(6, { state: "waiting" }),
        pr(7, { state: "elsewhere", startedAt: minutes(4) }),
        pr(8, { state: "failed" }),
      ],
      NOW,
    );
    assert.deepEqual(rows.map((row) => row.key), [
      "Motion-Creative/mondrian#5",
      "Motion-Creative/mondrian#3",
      "Motion-Creative/mondrian#7",
      "Motion-Creative/mondrian#2",
      "Motion-Creative/mondrian#6",
    ]);
  });

  test("a row leads with the title, then the number, repository, progress and how long it has run", () => {
    const [row] = runningRows([pr(10137, { state: "running", startedAt: minutes(4), progress: agents("done", "failed", "running", "skipped") }, "fix(runtime): patch Node.js pins")], NOW);
    assert.deepEqual(row, {
      id: "motion-creative/mondrian#10137",
      key: "Motion-Creative/mondrian#10137",
      label: "fix(runtime): patch Node.js pins",
      description: "#10137 · mondrian · 2 of 3 agents done · 4 min",
      tooltip: "Motion-Creative/mondrian#10137\nfix(runtime): patch Node.js pins\n2 of 3 agents done for 4 min. Click to open its review.",
      icon: "sync~spin",
    });
  });

  test("says when a run is starting, paused for a free agent, queued, about to start, or in another window", () => {
    const text = (run: RunningRecord["run"]) => {
      const [row] = runningRows([pr(1, run)], NOW);
      return [row.description, row.icon];
    };
    assert.deepEqual(text({ state: "running", startedAt: NOW }), ["#1 · mondrian · Starting · <1 min", "sync~spin"]);
    assert.deepEqual(text({ state: "running", startedAt: minutes(75), progress: agents("done", "queued") }), ["#1 · mondrian · Waiting for a free agent · 1 h 15 min", "clock"]);
    assert.deepEqual(text({ state: "queued", startedAt: minutes(120) }), ["#1 · mondrian · Queued · 2 h", "clock"]);
    assert.deepEqual(text({ state: "waiting" }), ["#1 · mondrian · Starting soon", "clock"]);
    assert.deepEqual(text({ state: "elsewhere", startedAt: minutes(3) }), ["#1 · mondrian · In another window · 3 min", "window"]);
  });

  test("uses the key when the title isn't loaded yet", () => {
    const [row] = runningRows([{ key: { owner: "acme", name: "app", number: 7 }, summary: null, run: { state: "queued" } }], NOW);
    assert.equal(row.label, "acme/app#7");
  });
});

function fakeVscode() {
  const fired: number[] = [];
  const views: Array<{ id: string; description?: string; provider: any }> = [];
  const vscode: RunningVscode = {
    window: {
      createTreeView(id, options) {
        const view = { id, provider: options.treeDataProvider, description: undefined as string | undefined, dispose() {} };
        views.push(view);
        return view;
      },
    },
    EventEmitter: class {
      event = () => {};
      fire() {
        fired.push(Date.now());
      }
      dispose() {}
    },
    TreeItem: class {
      id?: string;
      label: string;
      collapsibleState: number;
      constructor(label: string, collapsibleState: number) {
        this.label = label;
        this.collapsibleState = collapsibleState;
      }
    },
    TreeItemCollapsibleState: { None: 0 },
    ThemeIcon: class {
      id: string;
      constructor(id: string) {
        this.id = id;
      }
    },
  };
  return { vscode, fired, views };
}

describe("bindRunningView", () => {
  test("shows the running pull requests, counts them, opens one on click, and redraws only when a run changes", () => {
    const { vscode, fired, views } = fakeVscode();
    let records: RunningRecord[] = [];
    let changed = () => {};
    const disposables: Array<{ dispose(): unknown }> = [];
    bindRunningView({ vscode, records: () => records, onChange: (listener) => (changed = listener), subscriptions: disposables, now: () => NOW });

    const [view] = views;
    assert.equal(view.id, "xrayviewer.running");
    assert.deepEqual(view.provider.getChildren(), []);
    assert.equal(view.description, "");

    records = [pr(7, { state: "running", startedAt: minutes(2), progress: agents("running") }), pr(8, { state: "idle" })];
    changed();
    const rows = view.provider.getChildren();
    assert.equal(rows.length, 1);
    assert.equal(view.description, "1");
    const item = view.provider.getTreeItem(rows[0]);
    assert.equal(item.label, "Change 7");
    assert.equal(item.description, "#7 · mondrian · 0 of 1 agent done · 2 min");
    assert.equal(item.iconPath.id, "sync~spin");
    assert.deepEqual(item.command, { command: "xrayviewer.open", title: "Open Review", arguments: ["Motion-Creative/mondrian#7"] });

    const draws = fired.length;
    changed();
    assert.equal(fired.length, draws, "nothing new to draw");

    records = [];
    changed();
    assert.deepEqual(view.provider.getChildren(), []);
    assert.equal(view.description, "");
    for (const item of disposables) item.dispose();
  });
});
