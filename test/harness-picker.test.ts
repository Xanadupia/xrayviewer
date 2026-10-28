import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { harnessPicker, type PickerInput } from "../src/harness-picker.ts";

const input: PickerInput = {
  agents: {
    guide: { name: "Guide agent", focus: "Checks the description", enabled: true },
    architecture: { name: "Architecture agent", focus: "Where code lives", enabled: true },
    correctness: { name: "Correctness agent", focus: "Logic errors.", enabled: true },
    security: { name: "Security agent", focus: "Sign-in", enabled: false },
  },
  plan: [
    { id: "guide", name: "Guide agent", short: "Guide", harness: "claude", model: "Opus 5.5", thinking: "xhigh" },
    { id: "architecture", name: "Architecture agent", short: "Architecture", harness: "codex", model: "gpt-6.1-sol", thinking: "high" },
    { id: "correctness", name: "Correctness agent", short: "Correctness", harness: "claude", model: "Opus 5.5", thinking: "xhigh" },
    { id: "security", name: "Security agent", short: "Security", harness: "cursor", model: "", thinking: "" },
  ],
  installed: { cursor: "2026.10.19", codex: "0.162.1", claude: "2.1.294" },
  guideId: "guide",
};

const rows = (picker: ReturnType<typeof harnessPicker>) => picker.rows.map((row) => (row.separator ? `-- ${row.label}` : row.agent));

describe("harnessPicker", () => {
  test("moves every agent first, then changes one agent, and offers no run of its own", () => {
    const picker = harnessPicker(input);

    assert.equal(picker.title, "What the agents run on");
    assert.equal(picker.placeHolder, "All 3 agents run together. Changes apply to the next run.");
    assert.deepEqual(rows(picker), [
      "-- All agents",
      "pick-cursor",
      "install-codex",
      "install-claude",
      "-- One agent",
      "guide",
      "architecture",
      "correctness",
      "security",
    ]);
  });

  test("a CLI row puts the name first, then how many running agents use it and its version", () => {
    const [, cursor, codex, claude] = harnessPicker(input).rows;
    assert.deepEqual(cursor, {
      label: "Cursor Agent",
      description: "2026.10.19",
      detail: "Pick a model on your Cursor account.",
      icon: "circle-large-outline",
      agent: "pick-cursor",
      harness: "cursor",
    });
    assert.deepEqual([codex.description, codex.icon], ["1 of 3 agents · 0.162.1", "pass"]);
    assert.deepEqual([claude.description, claude.icon, claude.detail], ["2 of 3 agents · 2.1.294", "pass", "Pick a model and effort level."]);

    const allClaude = harnessPicker({ ...input, plan: input.plan.map((p) => ({ ...p, harness: "claude" as const })) });
    assert.deepEqual([allClaude.rows[3].description, allClaude.rows[3].icon], ["In use · 2.1.294", "pass-filled"]);
  });

  test("drops the commit hash Cursor's builds end in", () => {
    const [, cursor] = harnessPicker({ ...input, installed: { ...input.installed, cursor: "2026.10.22-27dcf5f" } }).rows;
    assert.equal(cursor.description, "2026.10.22");
  });

  test("an agent row has an icon, its CLI, model and level, and one line on what it looks at", () => {
    const byId = Object.fromEntries(harnessPicker(input).rows.map((row) => [row.agent, row]));
    assert.deepEqual(byId.guide, {
      label: "Guide",
      description: "Claude Code · Opus 5.5 · xhigh",
      detail: "Checks the description.",
      icon: "compass",
      agent: "guide",
    });
    assert.deepEqual([byId.architecture.icon, byId.architecture.detail], ["layers", "Where code lives."]);
    assert.deepEqual([byId.correctness.description, byId.correctness.detail], ["Claude Code · Opus 5.5 · xhigh · via /code-review", "Logic errors."]);
    assert.deepEqual([byId.security.description, byId.security.icon], ["Cursor · Default model · Off", "circle-slash"]);
  });

  test("an agent added in agents.yml gets a generic icon and no detail when it has no focus", () => {
    const picker = harnessPicker({
      ...input,
      agents: { ...input.agents, docs: { name: "Docs agent" } },
      plan: [...input.plan, { id: "docs", name: "Docs agent", short: "Docs", harness: "codex", model: "auto", thinking: "" }],
    });
    assert.deepEqual(picker.rows.at(-1), { label: "Docs", description: "Codex · Auto", icon: "hubot", agent: "docs" });
  });

  test("for one pull request, names it and ends with the way back to the default", () => {
    const fresh = harnessPicker({ ...input, scope: { label: "#12", custom: false } });
    assert.equal(fresh.title, "What the agents run on for #12");
    assert.equal(fresh.placeHolder, "All 3 agents run together. Changes apply to #12 only.");
    assert.deepEqual(rows(fresh).slice(-2), ["-- Every pull request", "scope-global"]);
    assert.deepEqual(fresh.rows.at(-1), {
      label: "Change the default…",
      detail: "For pull requests without a choice of their own.",
      icon: "globe",
      agent: "scope-global",
    });

    const custom = harnessPicker({ ...input, scope: { label: "#12", custom: true } });
    assert.deepEqual(rows(custom).slice(-3), ["-- Every pull request", "scope-reset", "scope-global"]);
    assert.deepEqual(custom.rows.at(-2), { label: "Use the default", detail: "Drop #12's own choice.", icon: "discard", agent: "scope-reset" });
  });

  test("says a change applies to the next run when one agent or none runs", () => {
    const off = { name: "Off agent", enabled: false };
    const picker = harnessPicker({ ...input, agents: { ...input.agents, architecture: off, correctness: off } });
    assert.equal(picker.placeHolder, "Changes apply to the next run.");
  });

  test("says Update and the new version on a CLI that has one, and keeps the download button on that row", () => {
    const picker = harnessPicker({
      ...input,
      updates: { claude: "2.1.308", codex: "0.163.0", cursor: "2026.10.22-27dcf5f" },
    });
    const [, cursor, codex, claude, next] = picker.rows;

    assert.deepEqual([cursor.description, cursor.action, cursor.actionTip], ["2026.10.19 · $(cloud-download) Update 2026.10.22", "update", "Install update to 2026.10.22"]);
    assert.deepEqual([codex.description, codex.actionTip], ["1 of 3 agents · 0.162.1 · $(cloud-download) Update 0.163.0", "Install update to 0.163.0"]);
    assert.equal(claude.agent, "install-claude", "picking the CLI row still chooses that CLI");
    assert.equal(next.label, "One agent");
    assert.equal(picker.rows.some((row) => row.runs === "update"), false, "the update stays on the CLI row");

    const one = harnessPicker({ ...input, updates: { claude: "2.1.308" } });
    assert.deepEqual(
      one.rows.slice(0, 5).map((row) => row.agent ?? `-- ${row.label}`),
      ["-- All agents", "pick-cursor", "install-codex", "install-claude", "-- One agent"],
    );
  });

  test("offers Install on a CLI that is missing, and no update row for it", () => {
    const missing = harnessPicker({ ...input, installed: { cursor: "", codex: "", claude: "2.1.294" }, updates: { codex: "0.163.0" } });
    const missingByAgent = Object.fromEntries(missing.rows.map((row) => [row.agent, row]));
    const summary = (row: (typeof missing.rows)[number]) => [row.label, row.description, row.icon, row.action];
    assert.deepEqual(summary(missingByAgent["pick-cursor"]), ["Cursor Agent", "Not installed", "circle-large-outline", "install"]);
    assert.equal(missingByAgent["pick-cursor"].detail, "Picking it installs Cursor Agent, then you pick a model.");
    assert.deepEqual(summary(missingByAgent["install-codex"]), ["Codex", "Not installed", "circle-large-outline", "install"]);
    assert.equal(missingByAgent["install-codex"].detail, "Picking it installs Codex, then you pick a model.");
    assert.equal(missingByAgent["install-claude"].action, undefined);
    assert.deepEqual(
      missing.rows.slice(0, 6).map((row) => row.agent ?? (row.runs ? `${row.label}-${row.harness}` : `-- ${row.label}`)),
      ["-- All agents", "pick-cursor", "Install-cursor", "install-codex", "Install-codex", "install-claude"],
    );
    assert.equal(missing.rows.some((row) => row.runs === "update"), false, "a CLI that is not installed gets Install, not Install update");
  });
});
