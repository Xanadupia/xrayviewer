import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { bindModelStore, hasModelChoice, modelScope, withModelChoice, type ModelStore } from "../src/pr-models.ts";
import type { AgentSetting, HarnessTable } from "../src/run-confirm.ts";

const harnesses: HarnessTable = {
  default: "claude",
  claude: { command: "claude", model: "opus", extraArgs: ["--effort", "high"] },
  codex: { command: "codex", model: "", extraArgs: [] },
  cursor: { command: "cursor-agent", model: "", extraArgs: [] },
};

function memento(saved: Record<string, unknown> = {}) {
  const data = { ...saved };
  const store: ModelStore = {
    get: <T>(key: string, fallback: T) => (key in data ? (data[key] as T) : fallback),
    update: async (key, value) => {
      data[key] = structuredClone(value);
    },
  };
  return { store, data };
}

function defaults() {
  const agents: Record<string, AgentSetting> = {
    guide: { name: "Guide agent", enabled: true },
    security: { name: "Security agent", harness: "claude", model: "sonnet", enabled: true },
  };
  const writes = { settings: [] as Array<[string, unknown]>, agents: [] as Array<[string, string, string]> };
  const deps = (key: unknown) =>
    modelScope({
      key,
      harnesses: () => harnesses,
      settings: async () => ({ settings: { agents }, path: "agents.yml" }),
      setAgentHarness: async (id: string, harness: string) => {
        writes.agents.push([id, "harness", harness]);
        return { clearedModel: null };
      },
      setAgentModel: async (id: string, model: string) => {
        writes.agents.push([id, "model", model]);
      },
      saveSetting: async (name: string, value: unknown) => {
        writes.settings.push([name, value]);
      },
    });
  return { agents, writes, scope: deps };
}

beforeEach(() => bindModelStore(memento().store));

describe("per pull request models", () => {
  test("two pull requests keep different CLIs and models, and the default stays as it was", async () => {
    const { agents, writes, scope } = defaults();
    const first = scope("acme/app#12");
    const second = scope("acme/app#13");

    await first.saveSetting("harness", "codex");
    await first.saveSetting("codex.model", "gpt-6.1-sol");
    await first.saveSetting("codex.extraArgs", ["-c", 'model_reasoning_effort="high"']);
    await second.saveSetting("harness", "cursor");
    await second.saveSetting("cursor.model", "fake-model");

    const a = withModelChoice("acme/app#12", harnesses, { agents });
    const b = withModelChoice("acme/app#13", harnesses, { agents });
    assert.deepEqual([a.harnesses.default, a.harnesses.codex.model, a.harnesses.codex.extraArgs], ["codex", "gpt-6.1-sol", ["-c", 'model_reasoning_effort="high"']]);
    assert.deepEqual([b.harnesses.default, b.harnesses.cursor.model, b.harnesses.codex.model], ["cursor", "fake-model", ""]);
    assert.equal(withModelChoice("acme/app#14", harnesses, { agents }).harnesses, harnesses, "a pull request without a choice runs on the default");
    assert.deepEqual(writes, { settings: [], agents: [] }, "settings.json and agents.yml are left alone");
  });

  test("a pull request's scope reads its own choice on top of the default", async () => {
    const { scope } = defaults();
    const pr = scope("acme/app#12");
    await pr.saveSetting("claude.model", "sonnet");
    await pr.setAgentModel("guide", "haiku");

    assert.equal(pr.label, "#12");
    assert.deepEqual([pr.harnesses().default, pr.harnesses().claude.model, pr.harnesses().claude.extraArgs], ["claude", "sonnet", ["--effort", "high"]]);
    const { settings, path } = await pr.settings();
    assert.deepEqual(settings.agents.guide, { name: "Guide agent", enabled: true, model: "haiku" });
    assert.equal(path, "agents.yml", "the rest of what was loaded passes through");
  });

  test("moving an agent to another CLI drops the model it had for the old one, like agents.yml does", async () => {
    const { agents, scope } = defaults();
    const pr = scope("acme/app#12");

    assert.deepEqual(await pr.setAgentHarness("security", "codex"), { clearedModel: "sonnet" });
    assert.deepEqual(withModelChoice("acme/app#12", harnesses, { agents }).settings.agents.security, {
      name: "Security agent",
      harness: "codex",
      model: "",
      enabled: true,
    });
    assert.deepEqual(await pr.setAgentHarness("security", "codex"), { clearedModel: null }, "staying on the same CLI keeps the model");
    assert.equal(agents.security.harness, "claude", "the default is unchanged");
  });

  test("a CLI's path is saved for every pull request, since it names the install on this machine", async () => {
    const { writes, scope } = defaults();
    await scope("acme/app#12").saveSetting("codex.path", "/usr/local/bin/codex");
    assert.deepEqual(writes.settings, [["codex.path", "/usr/local/bin/codex"]]);
    assert.equal(hasModelChoice("acme/app#12"), false);
  });

  test("without a pull request, the picker changes the default", async () => {
    const { writes, scope } = defaults();
    for (const key of [undefined, "", { contextValue: "group" }, "not a key"]) {
      const all = scope(key);
      assert.equal(all.label, "");
      assert.equal(all.picker, undefined);
    }
    const all = scope(undefined);
    await all.saveSetting("harness", "codex");
    await all.setAgentHarness("guide", "cursor");
    await all.setAgentModel("guide", "fake-model");
    assert.deepEqual(writes, { settings: [["harness", "codex"]], agents: [["guide", "harness", "cursor"], ["guide", "model", "fake-model"]] });
  });

  test("Use the default drops the pull request's own choice", async () => {
    const { agents, scope } = defaults();
    const pr = scope("acme/app#12");
    assert.deepEqual(pr.picker, { label: "#12", custom: false });
    await pr.saveSetting("harness", "codex");
    assert.deepEqual(pr.picker, { label: "#12", custom: true });

    assert.equal(await pr.reset(), "#12 is back on the default models.");
    assert.deepEqual(pr.picker, { label: "#12", custom: false });
    assert.equal(withModelChoice("acme/app#12", harnesses, { agents }).harnesses, harnesses);
  });

  test("choices are saved, survive a reload, and match keys in any case", async () => {
    const saved = memento();
    bindModelStore(saved.store);
    const { agents, scope } = defaults();
    await scope("Acme/App#12").saveSetting("harness", "codex");

    bindModelStore(memento(saved.data).store);
    assert.equal(withModelChoice("acme/app#12", harnesses, { agents }).harnesses.default, "codex");
    bindModelStore(undefined);
    assert.equal(withModelChoice("acme/app#12", harnesses, { agents }).harnesses.default, "claude");
  });

  test("ignores a saved CLI it doesn't know", async () => {
    const { agents } = defaults();
    bindModelStore(memento({ "xrayviewer.pullRequestModels": { "acme/app#12": { config: { harness: "pi" }, agents: {} } } }).store);
    assert.equal(withModelChoice("acme/app#12", harnesses, { agents }).harnesses.default, "claude");
  });
});
