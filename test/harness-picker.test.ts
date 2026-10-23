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

    assert.equal(picker.title, "Choose model");
    assert.equal(picker.placeHolder, "Run agents runs all 3 agents together. A change here is saved for the next run.");
    assert.deepEqual(rows(picker), [
      "-- —  Change all agents  —",
      "pick-cursor",
      "install-codex",
      "install-claude",
      "-- —  Change one agent  —",
      "guide",
      "architecture",
      "correctness",
      "security",
    ]);
  });

  test("each CLI says how many of the agents that run use it, and that picking it moves every agent", () => {
    const [, cursor, codex, claude] = harnessPicker(input).rows;
    assert.deepEqual(cursor, {
      label: "Cursor Agent 2026.10.19",
      description: "",
      detail: "Move all 4 agents to Cursor, then pick a model on your Cursor account.",
      agent: "pick-cursor",
      harness: "cursor",
    });
    assert.equal(codex.description, "used by 1 of 3 agents");
    assert.equal(claude.description, "used by 2 of 3 agents");
    assert.equal(claude.detail, "Move all 4 agents to Claude Code, then pick a model and effort level. The run uses the newest Claude Code on this machine.");

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

  test("puts Install update on a CLI that has a newer version, and Install when it is missing", () => {
    const picker = harnessPicker({
      ...input,
      updates: { claude: "2.1.308", codex: "0.163.0", cursor: "2026.10.22-27dcf5f" },
    });
    const byAgent = Object.fromEntries(picker.rows.map((row) => [row.agent, row]));

    assert.equal(byAgent["pick-cursor"].action, "update");
    assert.equal(byAgent["pick-cursor"].description, "Install update");
    assert.equal(byAgent["install-codex"].description, "used by 1 of 3 agents · Install update");
    assert.equal(byAgent["install-claude"].action, "update");
    assert.equal(picker.rows.some((row) => row.agent?.startsWith("update-")), false);
    assert.deepEqual(
      picker.rows.filter((row) => row.separator).map((row) => row.label),
      ["—  Change all agents  —", "—  Change one agent  —"],
    );

    const missing = harnessPicker({ ...input, installed: { cursor: "", codex: "", claude: "2.1.294" } });
    const missingByAgent = Object.fromEntries(missing.rows.map((row) => [row.agent, row]));
    assert.deepEqual([missingByAgent["pick-cursor"].label, missingByAgent["pick-cursor"].description, missingByAgent["pick-cursor"].action], ["Cursor Agent", "Install", "install"]);
    assert.deepEqual([missingByAgent["install-codex"].label, missingByAgent["install-codex"].description, missingByAgent["install-codex"].action], ["Codex", "Install", "install"]);
    assert.equal(missingByAgent["install-claude"].action, undefined);
  });
});
