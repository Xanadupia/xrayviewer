import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { pickCursorModel, type PickItem, type PickerDeps } from "../src/cursor-model-picker.ts";
import type { CursorModel } from "../src/cursor-models.ts";
import { fakeVscode } from "./support/fake-vscode.ts";

const models: CursorModel[] = [
  { id: "auto", name: "Auto", isDefault: true, isCurrent: false },
  { id: "composer-2.5", name: "Composer 2.5", isDefault: false, isCurrent: false },
  { id: "gpt-5.2", name: "GPT-5.2", isDefault: false, isCurrent: false },
];

function setup(choose: (items: readonly PickItem[]) => PickItem | undefined, options: { shared?: string; list?: CursorModel[] | null } = {}) {
  const fake = fakeVscode(choose);
  const agentModels: Array<[string, string]> = [];
  const logs: string[] = [];
  const deps: PickerDeps = {
    vscode: fake.vscode,
    readConfig: () => ({ id: "cursor", command: "cursor-agent", model: options.shared ?? "", extraArgs: [] }),
    setAgentModel: async (id, model) => {
      agentModels.push([id, model]);
    },
    log: (line) => logs.push(line),
    listModels: async () => (options.list === undefined ? models : options.list),
  };
  return { ...fake, deps, agentModels, logs };
}

const byValue = (value: string) => (items: readonly PickItem[]) => items.find((item) => item.value === value);

describe("pickCursorModel", () => {
  test("saves the model for every Cursor agent in the user's settings", async () => {
    const { deps, updates, logs, picks } = setup(byValue("composer-2.5"), { shared: "gpt-5.2" });

    assert.equal(await pickCursorModel(deps, null), true);

    assert.deepEqual(updates, [{ section: "xrayview", key: "cursor.model", value: "composer-2.5", target: 1 }]);
    assert.deepEqual(logs, ["Cursor agents now use composer-2.5"]);
    assert.equal(picks[0].title, "Model for agents on Cursor");
    assert.deepEqual(
      picks[0].items.map((item) => [item.label, item.description]),
      [
        ["Cursor's default", ""],
        ["Auto", "auto · Cursor's default"],
        ["Composer 2.5", "composer-2.5"],
        ["GPT-5.2", "gpt-5.2 · in use"],
      ],
    );
  });

  test("saves one agent's model in agents.yml, and can put it back on the shared model", async () => {
    const pickGpt = setup(byValue("gpt-5.2"), { shared: "composer-2.5" });
    const pickShared = setup(byValue(""), { shared: "composer-2.5" });
    const agent = { id: "security", name: "Security", model: "auto" };

    assert.equal(await pickCursorModel(pickGpt.deps, agent), true);
    assert.equal(await pickCursorModel(pickShared.deps, agent), true);

    assert.deepEqual(pickGpt.agentModels, [["security", "gpt-5.2"]]);
    assert.deepEqual(pickShared.agentModels, [["security", ""]]);
    assert.deepEqual(pickGpt.updates, []);
    assert.equal(pickGpt.picks[0].title, "Model for the security agent");
    assert.deepEqual(pickGpt.picks[0].items[0], {
      label: "Same as the other Cursor agents",
      description: "composer-2.5",
      detail: "Uses xrayview.cursor.model.",
      value: "",
    });
    assert.deepEqual(pickShared.logs, ["Security now runs on Cursor with the other Cursor agents' model"]);
  });

  test("keeps a model in use that the account no longer lists", async () => {
    const { deps, picks } = setup(() => undefined, { shared: "claude-opus-4-8[effort=high]" });

    await pickCursorModel(deps, null);

    assert.deepEqual(picks[0].items[1], {
      label: "claude-opus-4-8[effort=high]",
      description: "in use · not in your account's list",
      value: "claude-opus-4-8[effort=high]",
    });
  });

  test("changes nothing when the user cancels", async () => {
    const { deps, updates, agentModels } = setup(() => undefined);

    assert.equal(await pickCursorModel(deps, null), false);
    assert.equal(await pickCursorModel(deps, { id: "guide", name: "Guide", model: "" }), false);

    assert.deepEqual(updates, []);
    assert.deepEqual(agentModels, []);
  });

  test("warns instead of showing a picker when the models can't be listed", async () => {
    const { deps, warnings, picks, updates } = setup(byValue("auto"), { list: null });

    assert.equal(await pickCursorModel(deps, null), false);

    assert.equal(picks.length, 0);
    assert.deepEqual(updates, []);
    assert.match(warnings[0], /cursor-agent login/);
  });
});
