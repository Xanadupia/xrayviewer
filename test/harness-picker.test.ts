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
  installed: { cursor: "2026.10.19", codex: "0.162.1", claude: "2.1.294", pi: "" },
  guideId: "guide",
};

const rows = (picker: ReturnType<typeof harnessPicker>) => picker.rows.map((row) => (row.separator ? `-- ${row.label}` : row.agent));

describe("harnessPicker", () => {
  test("moves every agent first, then changes one agent, and offers no run of its own", () => {
    const picker = harnessPicker(input);

    assert.equal(picker.title, "Choose model");
    assert.equal(picker.placeHolder, "Run agents runs all 3 agents together. A change here is saved for the next run.");
    assert.deepEqual(rows(picker), [
      "-- Change all agents",
      "pick-cursor",
      "install-codex",
      "install-claude",
      "-- Change one agent",
      "guide",
      "architecture",
      "correctness",
      "security",
    ]);
  });

  test("each CLI says how many of the agents that run use it, and that picking it moves every agent", () => {
    const [, cursor, codex, claude] = harnessPicker(input).rows;
    assert.deepEqual(cursor, { label: "Cursor Agent 2026.10.19", description: "", detail: "Move all 4 agents to Cursor, then pick a model on your Cursor account.", agent: "pick-cursor" });
    assert.equal(codex.description, "used by 1 of 3 agents");
    assert.equal(claude.description, "used by 2 of 3 agents");
    assert.equal(claude.detail, "Move all 4 agents to Claude Code, then pick a model and effort level, or another installed version.");

    const allClaude = harnessPicker({ ...input, plan: input.plan.map((p) => ({ ...p, harness: "claude" as const })) });
    assert.equal(allClaude.rows[3].description, "used by all 3 agents");
  });

  test("an agent row has its CLI, model and level, what it looks at, and whether /code-review covers it", () => {
    const byId = Object.fromEntries(harnessPicker(input).rows.map((row) => [row.agent, row]));
    assert.deepEqual(byId.guide, {
      label: "Guide",
      description: "Claude Code · Opus 5.5 · xhigh",
      detail: "Checks the description. Also writes the briefing's opening line.",
      agent: "guide",
    });
    assert.equal(byId.architecture.detail, "Where code lives.");
    assert.equal(byId.correctness.detail, "Logic errors. On Claude Code, /code-review reviews for it, using its instructions.");
    assert.equal(byId.security.description, "Cursor · its default model · off");
    assert.equal(byId.security.detail, "Sign-in. Turned off, so it doesn't run.");
  });

  test("says a change is saved for the next run when one agent or none runs", () => {
    const off = { name: "Off agent", enabled: false };
    const picker = harnessPicker({ ...input, agents: { ...input.agents, architecture: off, correctness: off } });
    assert.equal(picker.placeHolder, "A change here is saved for the next run.");
  });

  test("lists Pi only when it is installed, and says when a CLI is missing", () => {
    const picker = harnessPicker({ ...input, installed: { cursor: "", codex: "", claude: "2.1.294", pi: "0.9.0" } });
    const byAgent = Object.fromEntries(picker.rows.map((row) => [row.agent, row]));
    assert.deepEqual([byAgent["pick-cursor"].label, byAgent["pick-cursor"].description], ["Cursor Agent CLI", "Not found"]);
    assert.deepEqual([byAgent["install-codex"].label, byAgent["install-codex"].description], ["Install Codex…", "Not installed"]);
    assert.equal(byAgent["pick-pi"].label, "Pi 0.9.0");
    assert.ok(!harnessPicker(input).rows.some((row) => row.agent === "pick-pi"));
  });
});
