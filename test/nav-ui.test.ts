import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { navSource } from "../scripts/nav-ui.mjs";

interface Finding {
  id: string;
  severity: "high" | "medium" | "low";
  state?: "open" | "accepted" | "dismissed";
}

interface Hunk {
  top: number;
  bottom: number;
  classes: Set<string>;
}

interface State {
  lastFinding: string | null;
  focus: string | null;
}

function page(find: Finding[], hunks: Record<string, Hunk> = {}) {
  const S: State = { lastFinding: null, focus: null };
  const shown: string[] = [];
  const toasts: string[] = [];
  const globals = {
    S,
    FIND: find,
    SEV: { high: "High", medium: "Medium", low: "Low" },
    toast: (text: string) => toasts.push(text),
    goFinding: (id: string) => { S.lastFinding = id; shown.push(id); },
    findingState: (x: Finding) => x.state ?? "open",
    hunkEl: (key: string) => {
      const h = hunks[key];
      return h ? { getBoundingClientRect: () => ({ top: h.top, bottom: h.bottom }), classList: { remove: (c: string) => h.classes.delete(c) } } : null;
    },
    stickyOffset: () => 164,
    window: { innerHeight: 900 },
  };
  const fns = new Function(...Object.keys(globals), `${navSource()}; return { nextFinding, liveFocus };`)(...Object.values(globals)) as {
    nextFinding: () => void;
    liveFocus: () => string | null;
  };
  return { ...fns, S, shown, toasts };
}

const f = (id: string, severity: Finding["severity"], state?: Finding["state"]): Finding => ({ id, severity, state });

describe("moving one item at a time", () => {
  test("next agent finding follows the findings list: high, then medium, then low", () => {
    const p = page([f("low1", "low"), f("high1", "high"), f("med1", "medium"), f("high2", "high")]);
    for (let i = 0; i < 4; i++) p.nextFinding();
    assert.deepEqual(p.shown, ["high1", "high2", "med1", "low1"]);
  });

  test("deciding the finding on screen moves on to the one after it, not back to the first", () => {
    const find = [f("a", "high"), f("b", "high"), f("c", "medium"), f("d", "low")];
    const p = page(find);
    p.nextFinding();
    p.nextFinding();
    find[1].state = "dismissed";
    p.nextFinding();
    assert.deepEqual(p.shown, ["a", "b", "c"]);
  });

  test("decided findings are skipped, and the search wraps to open ones earlier in the list", () => {
    const p = page([f("a", "high"), f("b", "high", "accepted"), f("c", "low")]);
    p.S.lastFinding = "c";
    p.nextFinding();
    p.nextFinding();
    assert.deepEqual(p.shown, ["a", "c"]);
  });

  test("once every finding is decided, it still steps through all of them in order", () => {
    const p = page([f("a", "high", "accepted"), f("b", "medium", "dismissed")]);
    p.nextFinding();
    p.nextFinding();
    p.nextFinding();
    assert.deepEqual(p.shown, ["a", "b", "a"]);
  });

  test("with no findings it says so instead of moving", () => {
    const p = page([]);
    p.nextFinding();
    assert.deepEqual(p.shown, []);
    assert.equal(p.toasts.length, 1);
  });

  test("the focused hunk counts while any of it is on screen below the header", () => {
    const p = page([], { "1:0": { top: -400, bottom: 200, classes: new Set(["is-focus"]) } });
    p.S.focus = "1:0";
    assert.equal(p.liveFocus(), "1:0");
  });

  test("a focused hunk scrolled out of view is let go, so the keys start from what's on screen", () => {
    const above = { top: -2000, bottom: 150, classes: new Set(["is-focus"]) };
    const p = page([], { "1:0": above });
    p.S.focus = "1:0";
    assert.equal(p.liveFocus(), null);
    assert.equal(p.S.focus, null);
    assert.equal(above.classes.has("is-focus"), false, "the outline goes with it");

    const below = page([], { "2:0": { top: 950, bottom: 1400, classes: new Set() } });
    below.S.focus = "2:0";
    assert.equal(below.liveFocus(), null);
  });

  test("a focused hunk that isn't drawn (folded file, filtered out) doesn't count", () => {
    const p = page([]);
    p.S.focus = "3:1";
    assert.equal(p.liveFocus(), null);
    assert.equal(p.S.focus, null);
  });
});
