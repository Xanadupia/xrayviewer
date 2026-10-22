import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { announceChoice, choiceSentence, plannedAgents, type HarnessTable, type NoticeDeps, type RunChoice } from "../src/run-confirm.ts";

function setup() {
  const messages: string[] = [];
  const logs: string[] = [];
  const deps: NoticeDeps = {
    vscode: {
      window: {
        async showInformationMessage(message) {
          messages.push(message);
          return undefined;
        },
      },
    },
    log: (line) => logs.push(line),
  };
  return { deps, messages, logs };
}

const claude: RunChoice = { harness: "claude", settings: { model: "opus", extraArgs: ["--effort", "high"] }, agent: null, inUse: true };

describe("choiceSentence", () => {
  test("names the model and level each harness will run with", () => {
    assert.equal(choiceSentence(claude), "Claude Code agents will use opus at high effort.");
    assert.equal(
      choiceSentence({ harness: "codex", settings: { model: "gpt-6.1-sol", extraArgs: ["-c", 'model_reasoning_effort="medium"'] }, agent: null, inUse: true }),
      "Codex agents will use gpt-6.1-sol at medium reasoning.",
    );
    assert.equal(choiceSentence({ harness: "cursor", settings: { model: "", extraArgs: [] }, agent: null, inUse: true }), "Cursor agents will use Cursor's default.");
  });

  test("shows the model's name with its version when it is known", () => {
    assert.equal(choiceSentence({ ...claude, modelName: "Opus 5.5" }), "Claude Code agents will use Opus 5.5 at high effort.");
  });

  test("uses one agent's own model", () => {
    assert.equal(
      choiceSentence({ ...claude, agent: { name: "Guide", model: "" } }),
      "The guide agent will use Claude Code with opus at high effort.",
    );
  });
});

const plan = (n: number) =>
  ["Guide", "Architecture", "Correctness", "Test", "Security"].slice(0, n).map((short) => ({ id: short.toLowerCase(), name: `${short} agent`, short, harness: "claude" as const, model: "Opus 5.5", thinking: "high" }));

describe("announceChoice", () => {
  test("says the choice is saved and that Run agents starts every agent together, without running anything", () => {
    const { deps, messages, logs } = setup();

    const message = announceChoice(deps, { ...claude, modelName: "Opus 5.5", plan: plan(5) });

    assert.equal(message, "Saved. Claude Code agents will use Opus 5.5 at high effort. Run agents starts all 5 agents together.");
    assert.deepEqual(messages, [message]);
    assert.deepEqual(logs, [message]);
  });

  test("after one agent changes, says the next run still starts all of them", () => {
    const { deps } = setup();
    assert.equal(
      announceChoice(deps, { ...claude, agent: { name: "Architecture", model: "" }, plan: plan(3) }),
      "Saved. The architecture agent will use Claude Code with opus at high effort. Run agents starts all 3 agents together.",
    );
    assert.match(announceChoice(deps, { ...claude, plan: plan(1) }), / Run agents starts it\.$/);
    assert.match(announceChoice(deps, claude), / Run agents starts them\.$/);
  });

  test("says when no agent runs on that CLI yet", () => {
    const { deps } = setup();
    assert.equal(
      announceChoice(deps, { ...claude, inUse: false }),
      "Saved. Claude Code agents will use opus at high effort. No agent runs on Claude Code yet. Pick it for all agents, or for one.",
    );
  });
});

describe("plannedAgents", () => {
  const harnesses: HarnessTable = {
    default: "codex",
    claude: { command: "claude", model: "opus", extraArgs: ["--effort", "high"] },
    codex: { model: "gpt-6-astra", extraArgs: ["-c", 'model_reasoning_effort="medium"'] },
    cursor: { model: "", extraArgs: [] },
  };
  const versions = (harness: string, model: string) => (harness === "claude" && model === "opus" ? "Opus 5.5" : "");

  test("gives each enabled agent its harness, the model with its version, and the level", () => {
    const plan = plannedAgents(
      {
        guide: { name: "Guide agent", harness: "", model: "", enabled: true },
        security: { name: "Security", harness: "claude", model: "", enabled: true },
        tests: { name: "Tests", harness: "cursor", model: "gpt-6.1-sol", enabled: true },
        old: { name: "Old", harness: "cursor", enabled: false },
      },
      harnesses,
      versions,
    );

    assert.deepEqual(plan, [
      { id: "guide", name: "Guide agent", short: "Guide", harness: "codex", model: "gpt-6-astra", thinking: "medium" },
      { id: "security", name: "Security", short: "Security", harness: "claude", model: "Opus 5.5", thinking: "high" },
      { id: "tests", name: "Tests", short: "Tests", harness: "cursor", model: "gpt-6.1-sol", thinking: "" },
    ]);
  });

  test("uses the default harness for an agent whose harness is not one X-RayViewer knows", () => {
    const [agent] = plannedAgents({ guide: { name: "Guide", harness: "gemini", enabled: true } }, harnesses, versions);

    assert.equal(agent.harness, "codex");
  });
});
