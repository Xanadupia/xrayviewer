import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { chromeSource } from "../scripts/chrome-ui.mjs";

interface Finding {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  f: number;
  k: string;
  state?: "open" | "accepted" | "dismissed";
}

interface Env {
  liveSync?: string;
  liveSyncError?: string;
  LIVE?: Record<string, unknown>;
  stages?: () => Array<{ name: string; caption: string; st: string }>;
  counts?: () => { all: number; reviewed: number; todo: number };
  PENDING?: boolean;
  FIND?: Finding[];
  S?: Record<string, unknown>;
}

function page(env: Env = {}) {
  const globals = {
    liveSync: env.liveSync ?? "saved",
    liveSyncError: env.liveSyncError ?? "",
    esc: (s: unknown) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`),
    icon: (name: string) => `<i data-icon="${name}"></i>`,
    inline: (s: string) => s,
    LIVE: env.LIVE ?? { github: true, pr: { state: "OPEN" } },
    stages: env.stages ?? (() => []),
    flowSummary: () => "Ready to merge",
    counts: env.counts ?? (() => ({ all: 4, reviewed: 1, todo: 3 })),
    PENDING: env.PENDING ?? false,
    $: () => null,
    requestAnimationFrame: (fn: () => void) => fn(),
    findingState: (x: Finding) => x.state ?? "open",
    files: [{ base: "app.ts", path: "src/app.ts" }],
    FIND: env.FIND ?? [],
    SEV: { high: "High", medium: "Medium", low: "Low" },
    S: env.S ?? {},
  };
  return new Function(...Object.keys(globals), `${chromeSource()}; return { syncHTML, ribbonHTML, miniLabel, reviewedShare, progressLineHTML, briefItemsHTML };`)(...Object.values(globals));
}

const finding = (id: number, severity: Finding["severity"], state: Finding["state"] = "open"): Finding => ({ id: `x${id}`, severity, title: `Finding ${id}`, f: 0, k: `n${id + 10}`, state });

describe("review page chrome", () => {
  test("the bar says comments are saved here, and why saving failed", () => {
    assert.match(page().syncHTML(), /title="Comments stay on this machine until you post them\.">.*Saved locally/);
    const failed = page({ liveSync: "error", liveSyncError: 'disk "full"' }).syncHTML();
    assert.match(failed, /role="alert" title="disk &#34;full&#34;"/);
    assert.match(failed, /Couldn't save/);
  });

  test("the strip above the bar shows only when GitHub isn't connected", () => {
    assert.equal(page().ribbonHTML(), "");
    assert.match(page({ LIVE: { github: false } }).ribbonHTML(), /GitHub isn't connected\..*gh auth login/);
  });

  test("the bar's path-to-merge label doesn't repeat the stage name", () => {
    const at = (caption: string) => page({ stages: () => [{ name: "Build", caption: "Passed", st: "done" }, { name: "Review", caption, st: "active" }] }).miniLabel();
    assert.equal(at("Review required"), "Review required");
    assert.equal(at("2 approvals needed"), "Review: 2 approvals needed");
    assert.equal(page({ LIVE: { pr: { state: "MERGED" } } }).miniLabel(), "Ready to merge");
  });

  test("the progress line fills with reviewed hunks, and stays empty while the diff loads", () => {
    assert.equal(page().reviewedShare(), 0.25);
    assert.equal(page({ PENDING: true }).reviewedShare(), 0);
    assert.equal(page({ counts: () => ({ all: 0, reviewed: 0, todo: 0 }) }).reviewedShare(), 0);
    assert.match(page({ counts: () => ({ all: 2, reviewed: 2, todo: 0 }) }).progressLineHTML(), /class="bar-progress is-done"[^>]*style="--done:1"/);
  });

  test("findings come grouped by severity, highest first, with how many are still open", () => {
    const html = page({ FIND: [finding(1, "low"), finding(2, "high"), finding(3, "medium", "accepted"), finding(4, "medium")] }).briefItemsHTML();
    const order = [...html.matchAll(/class="bi-group bi-(\w+)"/g)].map((m) => m[1]);
    assert.deepEqual(order, ["high", "medium", "low"]);
    assert.match(html, /Medium<span class="bi-count">1 of 2 open<\/span>/);
    assert.match(html, /High<span class="bi-count">1<\/span>/);
    assert.match(html, /data-icon="check-circle"><\/i><span class="sr-only">In your review<\/span>/);
    assert.equal(html.includes(">In your review</span></button>"), false, "the decision is an icon, not a repeated word");
  });

  test("a long tail of low findings folds behind one button until opened", () => {
    const lows = Array.from({ length: 9 }, (_, i) => finding(i + 10, "low"));
    const folded = page({ FIND: [finding(1, "high"), ...lows] }).briefItemsHTML();
    assert.equal((folded.match(/sev-row-low/g) || []).length, 4);
    assert.match(folded, /data-act="brief-low">Show 5 more low findings</);
    const opened = page({ FIND: [finding(1, "high"), ...lows], S: { lowOpen: true } }).briefItemsHTML();
    assert.equal((opened.match(/sev-row-low/g) || []).length, 9);
    const onlyLow = page({ FIND: lows }).briefItemsHTML();
    assert.equal(onlyLow.includes("brief-low"), false, "nothing is hidden when low findings are all there is");
  });
});
