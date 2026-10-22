import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { PickItem } from "../src/cursor-model-picker.ts";
import type { CliVersion } from "../src/installed-versions.ts";
import { pickCliVersion, type VersionPickerDeps } from "../src/version-picker.ts";

function setup(options: {
  choose: (items: readonly PickItem[], title: string) => PickItem | undefined;
  versions: CliVersion[];
  confirm?: string | null;
  install?: () => Promise<{ ok: boolean; output: string }>;
}) {
  const picks: Array<{ title: string; items: readonly PickItem[] }> = [];
  const warnings: string[] = [];
  const updates: Array<{ key: string; value: unknown }> = [];
  const logs: string[] = [];
  let listed = options.versions;
  let installs = 0;
  const deps: VersionPickerDeps = {
    vscode: {
      window: {
        async showQuickPick(items, pickOptions) {
          picks.push({ title: pickOptions.title, items });
          return options.choose(items, pickOptions.title) as (typeof items)[number] | undefined;
        },
        async showWarningMessage(message) {
          warnings.push(message);
          return undefined;
        },
        async showInformationMessage(_message, _modal, ...items) {
          return options.confirm === null ? undefined : (options.confirm ?? items[0]);
        },
        withProgress: (_progress, task) => task(),
      },
      workspace: {
        getConfiguration: () => ({
          async update(key, value) {
            updates.push({ key, value });
          },
        }),
      },
      ProgressLocation: { Notification: 15 },
      ConfigurationTarget: { Global: 1 },
    },
    list: () => listed,
    currentPath: () => "",
    install: async () => {
      installs += 1;
      const result = options.install ? await options.install() : { ok: true, output: "" };
      if (result.ok) listed = [{ version: "2.1.294", path: "/tmp/claude-2.1.294" }];
      return result;
    },
    log: (line) => logs.push(line),
  };
  return { deps, picks, warnings, updates, logs, installs: () => installs };
}

const byValue = (value: string) => (items: readonly PickItem[]) => items.find((item) => item.value === value);
const next = (answers: string[]) => (items: readonly PickItem[]) => {
  const value = answers.shift();
  return items.find((item) => item.value === value);
};

describe("pickCliVersion", () => {
  test("saves an installed Claude Code version", async () => {
    const versions = [{ version: "2.1.294", path: "/opt/claude/2.1.294" }];
    const { deps, updates, logs, picks } = setup({ choose: byValue(versions[0].path), versions });

    assert.equal(await pickCliVersion(deps, "claude", null), true);

    assert.equal(picks[0].title, "Claude Code version for agents on Claude Code");
    assert.equal(picks[0].items.at(-1)?.label, "Install another Claude Code version…");
    assert.deepEqual(updates, [{ key: "claude.path", value: "/opt/claude/2.1.294" }]);
    assert.deepEqual(logs, ["Claude Code agents now use 2.1.294 at /opt/claude/2.1.294"]);
  });

  test("uses the version the installer just added instead of asking to install again", async () => {
    const { deps, updates, installs, picks } = setup({
      versions: [],
      choose: (items) => items.find((item) => item.value === "\0install"),
    });

    assert.equal(await pickCliVersion(deps, "codex", { name: "Security agent" }), true);

    assert.equal(installs(), 1);
    assert.equal(picks.length, 1);
    assert.deepEqual(updates, [{ key: "codex.path", value: "/tmp/claude-2.1.294" }]);
  });

  test("does not download anything when install is declined", async () => {
    const { deps, installs } = setup({
      versions: [],
      confirm: null,
      choose: (items) => items.find((item) => item.value === "\0install"),
    });

    assert.equal(await pickCliVersion(deps, "claude", null), false);
    assert.equal(installs(), 0);
  });

  test("lists the Codex CLI's models and saves the reasoning level", async () => {
    let step = 0;
    const { deps, updates, picks } = setup({
      versions: [{ version: "0.162.1", path: "/codex" }],
      choose: (items) => {
        step += 1;
        return items.find((item) => item.value === (step === 1 ? "gpt-6.1-sol" : "medium"));
      },
    });
    deps.listModels = async () => [
      {
        slug: "gpt-6.1-sol",
        name: "GPT-6.1-Sol",
        description: "Latest workhorse model.",
        defaultEffort: "low",
        efforts: [
          { effort: "low", description: "Fast" },
          { effort: "medium", description: "Everyday" },
        ],
      },
    ];
    deps.currentExtraArgs = () => [];

    assert.equal(await pickCliVersion(deps, "codex", null), true);

    assert.equal(picks[0].title, "Model for agents on Codex");
    assert.equal(picks[1].title, "Reasoning for GPT-6.1-Sol");
    assert.deepEqual(updates, [
      { key: "codex.model", value: "gpt-6.1-sol" },
      { key: "codex.extraArgs", value: ["-c", 'model_reasoning_effort="medium"'] },
    ]);
  });

  test("lists Claude Code's models first and saves the effort with the other arguments", async () => {
    const answers = ["opus", "high"];
    const { deps, updates, picks, logs } = setup({
      versions: [{ version: "2.1.294", path: "/claude" }],
      choose: next(answers),
    });
    deps.listModels = async () => [
      {
        slug: "opus",
        name: "Opus 5.5",
        description: "",
        defaultEffort: "",
        efforts: [{ effort: "low", description: "" }, { effort: "high", description: "" }],
        fullId: "claude-opus-5-5",
      },
    ];
    deps.currentModel = () => "claude-sonnet-5-5";
    deps.currentExtraArgs = () => ["--verbose", "--effort", "low"];

    assert.equal(await pickCliVersion(deps, "claude", null), true);

    assert.equal(picks[0].title, "Model for agents on Claude Code");
    assert.deepEqual(
      picks[0].items.map((item) => [item.label, item.description ?? ""]),
      [
        ["Claude Code's default", ""],
        ["claude-sonnet-5-5", "in use"],
        ["Opus 5.5", "opus · claude-opus-5-5"],
        ["Change installed version…", ""],
      ],
    );
    assert.equal(picks[1].title, "Effort for Opus 5.5");
    assert.deepEqual(
      picks[1].items.map((item) => item.value),
      ["", "low", "high"],
    );
    assert.deepEqual(updates, [
      { key: "claude.model", value: "opus" },
      { key: "claude.extraArgs", value: ["--verbose", "--effort", "high"] },
    ]);
    assert.deepEqual(logs, ["agents on Claude Code now use opus, effort high"]);
  });

  test("saves one agent's Claude model on that agent", async () => {
    const answers = ["sonnet", ""];
    const saved: Array<[string, string]> = [];
    const { deps, updates } = setup({
      versions: [{ version: "2.1.294", path: "/claude" }],
      choose: next(answers),
    });
    deps.listModels = async () => [{ slug: "sonnet", name: "Sonnet", description: "", defaultEffort: "", efforts: [{ effort: "high", description: "" }] }];
    deps.setAgentModel = async (id, model) => {
      saved.push([id, model]);
    };

    assert.equal(await pickCliVersion(deps, "claude", { id: "security", name: "Security" }), true);

    assert.deepEqual(saved, [["security", "sonnet"]]);
    assert.deepEqual(updates, [{ key: "claude.extraArgs", value: [] }]);
  });

  test("Change installed version… keeps the newest binary and lists its models", async () => {
    const answers = ["\0version", "/claude-old", "sonnet"];
    const asked: string[] = [];
    const { deps, picks, updates } = setup({
      versions: [
        { version: "2.1.294", path: "/claude" },
        { version: "2.1.200", path: "/claude-old" },
      ],
      choose: next(answers),
    });
    deps.listModels = async (command) => {
      asked.push(command);
      return [{ slug: "sonnet", name: "Sonnet", description: "", defaultEffort: "", efforts: [] }];
    };

    assert.equal(await pickCliVersion(deps, "claude", null), true);

    assert.deepEqual(
      picks.map((pick) => pick.title),
      ["Model for agents on Claude Code", "Claude Code version for agents on Claude Code", "Model for agents on Claude Code"],
    );
    assert.deepEqual(asked, ["/claude", "/claude"]);
    assert.deepEqual(updates, [
      { key: "claude.path", value: "/claude" },
      { key: "claude.model", value: "sonnet" },
      { key: "claude.extraArgs", value: [] },
    ]);
  });

  test("changes nothing when the list is cancelled", async () => {
    const { deps, updates } = setup({ versions: [], choose: () => undefined });

    assert.equal(await pickCliVersion(deps, "codex", null), false);
    assert.deepEqual(updates, []);
  });
});
