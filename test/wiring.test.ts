import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { buildExtension } from "../scripts/build.mjs";
import { loadExtension, stub, stubModule } from "./support/load-extension.ts";

interface Pick {
  title?: string;
  placeHolder?: string;
  items: Array<Record<string, any>>;
}
type Chooser = (items: Pick["items"]) => Record<string, any> | undefined;

const state = {
  settings: {} as Record<string, unknown>,
  updates: [] as Array<{ section: string; key: string; value: unknown }>,
  logs: [] as string[],
  picks: [] as Pick[],
  messages: [] as string[],
  script: [] as Chooser[],
  commands: new Map<string, (...args: unknown[]) => unknown>(),
  trees: [] as string[],
};

class ThemeIcon {
  id: string;
  constructor(id: string) {
    this.id = id;
  }
}

const vscode = stubModule("vscode", {
  ThemeIcon,
  window: stub("vscode.window", {
    createOutputChannel: () => stub("output", { info: (line: string) => state.logs.push(line) }),
    createQuickPick() {
      const qp = {
        title: "",
        placeholder: "",
        items: [] as Pick["items"],
        matchOnDescription: false,
        selectedItems: [] as Pick["items"],
        _accept: undefined as (() => void) | undefined,
        _hide: undefined as (() => void) | undefined,
        onDidAccept(fn: () => void) {
          qp._accept = fn;
        },
        onDidHide(fn: () => void) {
          qp._hide = fn;
        },
        onDidTriggerItemButton() {},
        show() {
          state.picks.push({ title: qp.title, placeHolder: qp.placeholder, items: qp.items });
          const chosen = state.script.shift()?.(qp.items);
          if (chosen) {
            qp.selectedItems = [chosen];
            qp._accept?.();
          }
          qp._hide?.();
        },
        hide() {},
        dispose() {},
      };
      return qp;
    },
    async showQuickPick(items: Pick["items"] | Promise<Pick["items"]>, options?: { title?: string; placeHolder?: string }) {
      const resolved = await items;
      state.picks.push({ title: options?.title, placeHolder: options?.placeHolder, items: resolved });
      return state.script.shift()?.(resolved);
    },
    withProgress: (_options: unknown, task: (...args: unknown[]) => unknown) => task(stub("progress"), stub("token")),
    showInformationMessage: async (message: string) => {
      state.messages.push(message);
      return undefined;
    },
    showWarningMessage: async () => undefined,
    showErrorMessage: async (message: string) => {
      state.messages.push(message);
      return undefined;
    },
    createTreeView: (id: string) => {
      state.trees.push(id);
      return stub("tree", { selection: [] });
    },
  }),
  workspace: stub("vscode.workspace", {
    workspaceFolders: [],
    getConfiguration: (section: string) => ({
      get: (key: string, fallback?: unknown) => state.settings[`${section}.${key}`] ?? fallback,
      has: () => false,
      inspect: () => undefined,
      async update(key: string, value: unknown) {
        state.updates.push({ section, key, value });
        state.settings[`${section}.${key}`] = value;
      },
    }),
  }),
  commands: stub("vscode.commands", {
    registerCommand(id: string, handler: (...args: unknown[]) => unknown) {
      state.commands.set(id, handler);
      return { dispose() {} };
    },
    executeCommand: async () => undefined,
  }),
});

let root: string;
let extensionDir: string;
let ext: any;
let context: { subscriptions: Array<{ dispose?: () => unknown }> } & Record<string, unknown>;

async function fakeCli(name: string, behavior: { events?: object[]; stderr?: string; exitCode?: number } = {}) {
  const file = path.join(root, "bin", name);
  const record = `${file}.record.json`;
  await writeFile(
    file,
    `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args[0] === "--version") { console.log("2026.0.0-fake"); process.exit(0); }
if (args[0] === "--list-models") { console.log("Available models\\n\\nauto - Auto (default)\\nfake-model - Fake Model\\n"); process.exit(0); }
let input = "";
process.stdin.on("data", (chunk) => (input += chunk)).on("end", () => {
  const files = fs.readdirSync(process.cwd(), { recursive: true }).sort();
  fs.writeFileSync(${JSON.stringify(record)}, JSON.stringify({ args, cwd: process.cwd(), env: process.env, input, files }));
  for (const event of ${JSON.stringify(behavior.events ?? [])}) console.log(JSON.stringify(event));
  process.stderr.write(${JSON.stringify(behavior.stderr ?? "")});
  process.exit(${behavior.exitCode ?? 0});
});
`,
  );
  await chmod(file, 0o755);
  return { file, record: async () => JSON.parse(await readFile(record, "utf8")) };
}

/**
 * A Claude Code stand-in. `/code-review` streams `report` as its result; the run that gets the report back answers
 * with `review` as its structured output, and any other run with `lede`.
 */
async function fakeClaude(name: string, outputs: { report: string; review: object; lede: object }) {
  const file = path.join(root, "bin", name);
  const record = `${file}.calls.jsonl`;
  await writeFile(
    file,
    `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
let input = "";
process.stdin.on("data", (chunk) => (input += chunk)).on("end", () => {
  fs.appendFileSync(${JSON.stringify(record)}, JSON.stringify({ args, input }) + "\\n");
  const say = (event) => console.log(JSON.stringify(event));
  if (args[1].startsWith("/code-review ")) {
    say({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "git diff --stat" } }] } });
    say({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: " src/cart.js | 2 +-" }] } });
    say({ type: "result", subtype: "success", is_error: false, result: ${JSON.stringify(outputs.report)},
      total_cost_usd: 0.02, modelUsage: { "claude-fake": { inputTokens: 7, outputTokens: 3 } } });
    return;
  }
  const output = input.includes("/code-review reported") ? ${JSON.stringify(outputs.review)} : ${JSON.stringify(outputs.lede)};
  say({ type: "assistant", message: { content: [{ type: "text", text: "Shaping the report into findings." }] } });
  say({ type: "result", subtype: "success", is_error: false, result: "", structured_output: output,
    total_cost_usd: 0.01, usage: { input_tokens: 5, output_tokens: 2 }, modelUsage: { "claude-fake": {} } });
});
`,
  );
  await chmod(file, 0o755);
  const calls = async () =>
    (await readFile(record, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as { args: string[]; input: string });
  return { file, calls };
}

/**
 * A Claude Code, Codex or Cursor Agent stand-in that answers a review with `broken` until a request carries that
 * reply back, then with `fixed`. The summary line gets `lede`, and Claude Code's /code-review a one-line report.
 */
async function fakeAgentCli(name: string, harness: "claude" | "codex" | "cursor", replies: { broken: string; fixed: object; lede: object }) {
  const file = path.join(root, "bin", name);
  const record = `${file}.calls.jsonl`;
  await writeFile(
    file,
    `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
let input = "";
process.stdin.on("data", (chunk) => (input += chunk)).on("end", () => {
  fs.appendFileSync(${JSON.stringify(record)}, JSON.stringify({ args, input }) + "\\n");
  const say = (event) => console.log(JSON.stringify(event));
  if (args[1].startsWith("/code-review ")) {
    say({ type: "result", subtype: "success", is_error: false, result: "src/cart.js:3 divides by ten",
      total_cost_usd: 0.02, modelUsage: { "claude-fake": { inputTokens: 7, outputTokens: 3 } } });
    return;
  }
  const broken = ${JSON.stringify(replies.broken)};
  const reply = input.includes(broken) ? ${JSON.stringify(JSON.stringify(replies.fixed))}
    : input.startsWith("Write the opening line") ? ${JSON.stringify(JSON.stringify(replies.lede))} : broken;
  switch (${JSON.stringify(harness)}) {
    case "claude": {
      let parsed;
      try { parsed = JSON.parse(reply); } catch {}
      say({ type: "result", subtype: "success", is_error: false, result: reply, ...(parsed ? { structured_output: parsed } : {}),
        total_cost_usd: 0.01, usage: { input_tokens: 5, output_tokens: 2 }, modelUsage: { "claude-fake": {} } });
      break;
    }
    case "codex":
      fs.writeFileSync(args[args.indexOf("--output-last-message") + 1], reply);
      say({ type: "turn.completed", usage: { input_tokens: 5, cached_input_tokens: 1, output_tokens: 2 } });
      break;
    default:
      say({ type: "assistant", message: { content: [{ type: "text", text: reply }] } });
      say({ type: "result", is_error: false, result: "", usage: { inputTokens: 5, outputTokens: 2, cacheReadTokens: 1, cacheWriteTokens: 0 } });
  }
});
`,
  );
  await chmod(file, 0o755);
  const calls = async () =>
    (await readFile(record, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as { args: string[]; input: string });
  return { file, calls };
}

const systemPath = process.env.PATH ?? "";
const previousHome = process.env.HOME;

const changed = "  return sum - sum * discount / 10;";
const discountDetail = {
  pr: { title: "Discount", body: "", author: { login: "t" }, isDraft: false, headRefName: "d", baseRefName: "main", labels: [], checks: [] },
  threads: [],
};

/** A checkout whose last commit adds a discount to src/cart.js, with the bundle's data for that commit. */
async function cartCheckout(name: string) {
  const repo = path.join(root, name);
  const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", env: { ...process.env, PATH: systemPath } }).trim();
  await mkdir(path.join(repo, "src"), { recursive: true });
  git("init", "-q", "-b", "main");
  await writeFile(path.join(repo, "src", "cart.js"), "export function total(items) {\n  return items.reduce((sum, item) => sum + item.price, 0);\n}\n");
  git("add", "-A");
  git("-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-qm", "Cart total");
  const base = git("rev-parse", "HEAD");
  await writeFile(
    path.join(repo, "src", "cart.js"),
    "export function total(items, discount) {\n  const sum = items.reduce((sum, item) => sum + item.price, 0);\n  return sum - sum * discount / 10;\n}\n",
  );
  git("-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-qam", "Discount");
  const head = git("rev-parse", "HEAD");
  const realGit = execFileSync("/usr/bin/which", ["git"], { encoding: "utf8", env: { PATH: systemPath } }).trim();
  await writeFile(path.join(root, "bin", "git"), `#!/bin/sh\nexec ${JSON.stringify(realGit)} "$@"\n`);
  await chmod(path.join(root, "bin", "git"), 0o755);
  return { repo, head, data: await ext.__xrayviewer.Mo(repo, base, head) };
}

before(async () => {
  root = await mkdtemp(path.join(tmpdir(), "xrayviewer-wiring-"));
  process.env.HOME = root;
  await mkdir(path.join(root, "bin"));
  await mkdir(path.join(root, "storage"));
  process.env.XRAYVIEWER_HOME = path.join(root, "home");
  process.env.PATH = path.join(root, "bin");
  process.env.GH_TOKEN = "must-not-reach-cursor";
  extensionDir = await buildExtension(path.join(root, "extension"));
  state.settings["xrayviewer.cursor.path"] = (await fakeCli("cursor-agent")).file;
  ext = await loadExtension(path.join(extensionDir, "dist"), vscode);
  context = Object.preventExtensions({
    subscriptions: [],
    globalStorageUri: { fsPath: path.join(root, "storage") },
    globalState: { get: (_key: string, fallback?: unknown) => fallback, update: async () => {}, keys: () => [], setKeysForSync() {} },
    extensionUri: stub("extensionUri"),
    extension: { packageJSON: { version: "0.4.0" } },
  });
  await ext.activate(context);
});

after(() => {
  if (previousHome === undefined) delete process.env.HOME;
  else process.env.HOME = previousHome;
  for (const subscription of context?.subscriptions ?? []) subscription.dispose?.();
  ext?.deactivate();
});

describe("the patched extension", () => {
  test("registers every command its package.json contributes", async () => {
    const manifest = JSON.parse(await readFile(path.join(extensionDir, "package.json"), "utf8"));
    const contributed = manifest.contributes.commands.map((command: { command: string }) => command.command).sort();

    assert.deepEqual([...state.commands.keys()].sort(), contributed);
  });

  test("draws every tree view its package.json contributes", async () => {
    const manifest = JSON.parse(await readFile(path.join(extensionDir, "package.json"), "utf8"));
    const trees = manifest.contributes.views.xrayviewer.filter((view: { type?: string }) => view.type !== "webview").map((view: { id: string }) => view.id);

    assert.deepEqual([...state.trees].sort(), trees.sort());
  });

  test("opening or reviewing with nothing checked asks for a selection", async () => {
    state.messages = [];
    await state.commands.get("xrayviewer.openSelected")!();
    await state.commands.get("xrayviewer.runSelected")!();
    assert.deepEqual(state.messages, ["Check up to 5 pull requests first.", "Check up to 5 pull requests first."]);
  });

  test("knows Cursor as a harness and reads its settings", () => {
    const { Xt, Nt, ji, Yt } = ext.__xrayviewer;

    assert.ok(ji.includes("cursor"));
    assert.equal(Xt("cursor"), true);
    assert.equal(Nt.cursor, "Cursor Agent CLI");
    assert.deepEqual(Yt().harnesses.cursor, { id: "cursor", command: state.settings["xrayviewer.cursor.path"], model: "", extraArgs: [] });
  });

  test("agents.yml keeps one agent's own level until the agent moves to another harness", async () => {
    const { Eu, xrvSetEffort, $t } = ext.__xrayviewer;
    const [id] = Object.keys((await $t()).settings.agents);
    const effort = async () => (await $t()).settings.agents[id].effort;
    const fresh = await readFile(path.join(process.env.XRAYVIEWER_HOME!, "agents.yml"), "utf8");
    assert.match(fresh, /^# effort: how long this agent's model thinks, /m);
    assert.match(fresh.slice(fresh.indexOf(`\n  ${id}:`)), /^ {4}model: ""\n {4}effort: ""$/m, "every agent lists the field, empty");
    assert.equal(await effort(), "");

    await Eu(id, "claude");
    await xrvSetEffort(id, "max");
    assert.equal(await effort(), "max");
    await Eu(id, "claude");
    assert.equal(await effort(), "max", "staying on the same harness keeps it");
    await Eu(id, "codex");
    assert.equal(await effort(), "");
    await Eu(id, "");
  });

  test("a fresh install has the architecture agent check each file's paradigm, only in what the pull request changes", async () => {
    const { $t } = ext.__xrayviewer;
    const { instructions } = (await $t()).settings.agents.architecture;
    const onDisk = await readFile(path.join(process.env.XRAYVIEWER_HOME!, "agents", "architecture.md"), "utf8");

    assert.ok(onDisk.includes(instructions.trim()), "the agent reads the file it wrote");
    assert.match(instructions, /^Check that each change sits in the module that owns it/m, "it keeps its module check");
    assert.match(instructions, /whether it's object-oriented .+ or functional/);
    assert.match(instructions, /it should be a method of the class, private if nothing else needs it/);
    assert.match(instructions, /it belongs in a module of functions/);
    assert.match(instructions, /^Code the pull request didn't add or change\. If a file already mixed both paradigms before this pull request, don't flag that\./m);
    assert.ok(instructions.indexOf("## Leave alone") < instructions.indexOf("Code the pull request didn't add or change"));
  });

  test("Choose model lists the CLIs that move every agent, then each agent, and says they all run together", async () => {
    const { $t } = ext.__xrayviewer;
    const agents = (await $t()).settings.agents as Record<string, { name: string; focus: string }>;
    const ids = Object.keys(agents);
    state.picks = [];
    state.script = [() => undefined];

    await state.commands.get("xrayviewer.selectHarness")!();

    const [pick] = state.picks;
    assert.equal(pick.title, "What the agents run on");
    assert.equal(pick.placeHolder, `All ${ids.length} agents run together. Changes apply to the next run.`);
    assert.deepEqual(pick.items.filter((item) => "kind" in item).map((item) => item.label), ["All agents", "One agent"]);
    assert.deepEqual(pick.items.filter((item) => item.agent).map((item) => item.agent), ["pick-cursor", "install-codex", "install-claude", ...ids]);
    assert.ok(pick.items.filter((item) => item.agent).every((item) => item.iconPath instanceof ThemeIcon && item.iconPath.id === item.icon), "every row draws its icon");
    const guide = pick.items.find((item) => item.agent === "guide")!;
    assert.equal(guide.label, "Guide");
    assert.equal(guide.detail, `${agents.guide.focus}.`);
    assert.equal(guide.iconPath.id, "compass");
    assert.ok(!pick.items.some((item) => item.agent === "run" || item.agent === "default"), "the picker only saves; Run agents runs");
  });

  test("Choose Agent Harnesses can put one agent on Cursor with its own model, then confirm", async () => {
    const { $t } = ext.__xrayviewer;
    const before = (await $t()).settings.agents as Record<string, { instructions: string; focus: string; name: string; harness: string }>;
    state.picks = [];
    state.messages = [];
    let agentId = "";
    state.script = [
      (items) => {
        const agent = items.filter((item) => item.agent && !String(item.agent).includes("-") && item.agent !== "default").at(-1)!;
        agentId = agent.agent;
        return agent;
      },
      (items) => items.find((item) => item.value === "cursor"),
      (items) => items.find((item) => item.value === "fake-model"),
    ];

    await state.commands.get("xrayviewer.selectHarness")!();

    assert.match(state.picks[1].title!, /^Which CLI runs the .+ agent\?$/);
    assert.deepEqual(
      state.picks[1].items.map((item) => item.value),
      ["cursor", "codex", "claude"],
    );
    assert.match(state.picks[1].items[0].detail, /Then this agent runs on Cursor/);
    assert.match(state.picks[2].title!, /^Model for the .+ agent$/);
    const agentsYml = await readFile(path.join(process.env.XRAYVIEWER_HOME!, "agents.yml"), "utf8");
    const block = agentsYml.slice(agentsYml.indexOf(`\n  ${agentId}:`));
    assert.match(block, /^\s+harness: "cursor"$/m);
    assert.match(block, /^\s+model: "fake-model"$/m);
    const after = (await $t()).settings.agents as Record<string, { instructions: string; focus: string; name: string; harness: string }>;
    for (const [id, agent] of Object.entries(before)) {
      assert.equal(after[id].instructions, agent.instructions, `${id} keeps its instructions`);
      assert.equal(after[id].focus, agent.focus, `${id} keeps its focus`);
      assert.equal(after[id].name, agent.name);
      if (id !== agentId) assert.equal(after[id].harness, agent.harness, `${id} is left on its harness`);
    }
    assert.equal(state.picks.length, 3, "the harness menu does not open again after the model");
    assert.match(state.messages.at(-1)!, /^Saved\. The .+ agent will use Cursor with fake-model\. Run agents starts all \d+ agents together\.$/);
  });

  test("the Cursor row at the top lists the account's models, then moves every agent onto Cursor", async () => {
    const { Eu, Cu, xrvSetEffort, $t } = ext.__xrayviewer;
    const [onClaude, withCodexModel, withLevel] = Object.keys((await $t()).settings.agents);
    await Eu(onClaude, "claude");
    await Cu(onClaude, "opus");
    await Cu(withCodexModel, "gpt-6-astra");
    await xrvSetEffort(withLevel, "high");
    state.settings["xrayviewer.harness"] = "codex";
    state.picks = [];
    state.messages = [];
    state.logs = [];
    state.script = [
      (items) => items.find((item) => item.agent === "pick-cursor"),
      (items) => items.find((item) => item.value === "fake-model"),
    ];

    await state.commands.get("xrayviewer.selectHarness")!();

    const count = Object.keys((await $t()).settings.agents).length;
    assert.deepEqual(state.picks[0].items.find((item) => item.agent === "pick-cursor"), {
      label: "Cursor Agent",
      description: `1 of ${count} agents · 2026.0.0-fake`,
      detail: "Pick a model on your Cursor account.",
      icon: "pass",
      iconPath: new ThemeIcon("pass"),
      agent: "pick-cursor",
      harness: "cursor",
    });
    assert.equal(state.picks[1].title, "Model for agents on Cursor");
    assert.equal(state.settings["xrayviewer.harness"], "cursor");
    assert.equal(state.settings["xrayviewer.cursor.model"], "fake-model");
    const { agents } = (await $t()).settings;
    assert.deepEqual([agents[onClaude].harness, agents[onClaude].model, agents[withCodexModel].model, agents[withLevel].effort], ["", "", "", ""]);
    assert.ok(Object.values(agents).every((agent: any) => !agent.harness || agent.harness === "cursor"));
    const short = (id: string) => agents[id].name.replace(/ agent$/i, "");
    assert.ok(state.logs.includes(`Every agent now runs on Cursor Agent CLI. ${short(onClaude)}, ${short(withCodexModel)}, ${short(withLevel)} no longer have a harness, model or level of their own`));
    assert.equal(state.picks.length, 2, "the harness menu does not open again after the model");
    assert.deepEqual(state.messages, [`Saved. Cursor agents will use fake-model. Run agents starts all ${count} agents together.`]);
  });

  test("Choose model on a review page saves for that pull request only, until Use the default", async () => {
    const { $t, Yt } = ext.__xrayviewer;
    const harness = createRequire(import.meta.url)(path.join(extensionDir, "dist", "cursor-harness.cjs")).createCursorHarness(stub("internals"));
    const agentsYml = path.join(process.env.XRAYVIEWER_HOME!, "agents.yml");
    const yml = await readFile(agentsYml, "utf8");
    const runsOn = async (key: string) => harness.withModelChoice(key, Yt().harnesses, (await $t()).settings).harnesses.cursor.model;
    const count = Object.keys((await $t()).settings.agents).length;
    state.picks = [];
    state.messages = [];
    state.updates = [];
    state.script = [(items) => items.find((item) => item.agent === "pick-cursor"), (items) => items.find((item) => item.value === "auto")];

    await state.commands.get("xrayviewer.selectHarness")!("acme/app#7");

    assert.equal(state.picks[0].title, "What the agents run on for #7");
    assert.equal(state.picks[0].items.at(-1)!.agent, "scope-global");
    assert.deepEqual(state.messages, [`Saved for #7. Cursor agents will use auto. Run agents starts all ${count} agents together.`]);
    assert.deepEqual(state.updates, [], "settings.json is left alone");
    assert.equal(await readFile(agentsYml, "utf8"), yml, "agents.yml is left alone");
    assert.deepEqual([await runsOn("acme/app#7"), await runsOn("acme/app#8"), Yt().harnesses.cursor.model], ["auto", "fake-model", "fake-model"]);
    const agents = (await $t()).settings.agents as Record<string, { model?: string }>;
    const plan = await harness.modelPlan(Yt().harnesses, agents, "acme/app#7");
    assert.ok(plan.length);
    for (const agent of plan) assert.equal(agent.model, agents[agent.id]?.model || "auto", `the review page shows ${agent.id}'s model on #7`);

    state.picks = [];
    state.messages = [];
    state.script = [(items) => items.find((item) => item.agent === "scope-reset")];
    await state.commands.get("xrayviewer.selectHarness")!("acme/app#7");
    assert.deepEqual(state.messages, ["#7 is back on the default models."]);
    assert.equal(await runsOn("acme/app#7"), "fake-model");

    state.picks = [];
    state.script = [(items) => items.find((item) => item.agent === "scope-global"), () => undefined];
    await state.commands.get("xrayviewer.selectHarness")!("acme/app#7");
    assert.deepEqual(state.picks.map((pick) => pick.title), ["What the agents run on for #7", "What the agents run on"]);
    assert.ok(!state.picks[0].items.some((item) => item.agent === "scope-reset"), "nothing to reset once #7 follows the default");
    assert.deepEqual(state.updates, []);
  });

  test("the dispatcher runs Cursor agents isolated and returns their findings with repository paths", async () => {
    const repo = path.join(root, "checkout");
    const runDir = path.join(root, "run");
    await mkdir(repo, { recursive: true });
    await mkdir(runDir, { recursive: true });
    const cli = await fakeCli("cursor-success", {
      events: [
        { type: "system", subtype: "init", model: "Fake Model" },
        { type: "assistant", message: { content: [{ type: "text", text: JSON.stringify({ findings: [{ path: `${repo}/src/app.ts` }] }) }] } },
        { type: "result", is_error: false, result: "", usage: { inputTokens: 3, outputTokens: 2, cacheReadTokens: 1, cacheWriteTokens: 0 } },
      ],
    });
    const workDir = path.join(runDir, "cursor-guide");

    const result = await ext.__xrayviewer.Na(
      { id: "cursor", command: cli.file, model: "", extraArgs: [] },
      { prompt: "Review.", schema: { type: "object" }, cwd: repo, readDirs: [runDir], workDir, timeoutMs: 30_000 },
    );

    const record = await cli.record();
    assert.deepEqual(result.output, { findings: [{ path: "src/app.ts" }] });
    assert.deepEqual(result.tokens, { input: 4, cachedInput: 1, output: 2 });
    assert.equal(result.model, "Fake Model");
    assert.equal(record.cwd, path.join(await realpath(runDir), "cursor-guide"));
    assert.equal(await stat(workDir).then(() => true, () => false), false, "the workspace is removed after the run");
    assert.deepEqual(record.files, [".cursor", path.join(".cursor", "cli.json")]);
    assert.deepEqual(record.args.slice(0, 5), ["--print", "--output-format", "stream-json", "--mode", "ask"]);
    assert.equal(record.env.GH_TOKEN, undefined);
    assert.match(record.input, /^Review\.\n\nReply with only a JSON object matching this JSON Schema:/);
  });

  test("a review runs Claude Code's /code-review once in place of the reviewer agents on Claude Code, with their instructions", async () => {
    const { zu, $t, ui, Yt } = ext.__xrayviewer;
    const { repo, head, data } = await cartCheckout("review-checkout");
    const finding = {
      agent: "claude-code-review",
      severity: "high",
      confidence: "High confidence",
      label: "blocking",
      path: "src/cart.js",
      match: changed,
      title: "Discount divides by ten, not a hundred",
      body: "A 10% discount takes the whole total off.",
      steps: [{ path: null, match: changed, text: "Divides by 10." }],
      fix: "Divide by 100.",
      comment: "Should this divide by 100?",
    };
    const untested = {
      ...finding,
      agent: "tests",
      severity: "medium",
      confidence: "Worth asking",
      label: "question",
      title: "No test covers the discount",
      body: "Nothing calls total with a discount.",
      steps: [],
      fix: null,
      comment: "Could a test pin the discount math?",
    };
    const cli = await fakeClaude("claude-review", {
      report: "src/cart.js:3 — a 10% discount takes the whole total off",
      review: { findings: [finding, untested], checked: [{ path: null, text: "The reduce starts at zero." }] },
      lede: { lede: "One high finding." },
    });

    const { settings } = await $t();
    settings.agents.tests = { ...settings.agents.tests, effort: "xhigh" };
    const harnesses = { ...Yt().harnesses, default: "claude" };
    harnesses.claude = { ...harnesses.claude, command: cli.file, model: "", extraArgs: ["--effort", "high"] };
    const progress: Array<Record<string, { state: string; error?: string; startedAt?: number }>> = [];
    let activity: Record<string, { steps: Array<{ kind: string; title: string; state: string; detail?: string }> }> = {};
    const agentRuns: Array<Record<string, unknown>> = [];
    const result = await zu({
      key: { owner: "acme", name: "shop", number: 1 },
      repoPath: repo,
      baseDir: null,
      data,
      detail: discountDetail,
      harnesses,
      settings,
      enabled: ["correctness", "tests"],
      runDir: path.join(root, "review-run"),
      timeoutMs: 30_000,
      limiter: new ui(3),
      signal: new AbortController().signal,
      onProgress: (p: { agents: (typeof progress)[number]; activity: typeof activity }) => {
        progress.push(p.agents);
        activity = p.activity;
      },
      agentRuns,
    });

    const calls = await cli.calls();
    assert.equal(calls.length, 3, "one /code-review run, the run that shapes its report, then the summary line");
    const [review, shape, lede] = calls;
    assert.deepEqual(review.args.slice(0, 2), ["-p", `/code-review xhigh ${data.mergeBase}...${head} --max-findings 10`], "the tests agent's own level is the highest");
    const effortOf = (run: { args: string[] }) => run.args.filter((arg, i) => run.args[i - 1] === "--effort");
    assert.deepEqual([effortOf(review), effortOf(shape), effortOf(lede)], [["xhigh"], ["xhigh"], ["high"]], "the summary line keeps the guide's level");
    assert.ok(!review.args.includes("--json-schema"));
    assert.equal(review.input, "");
    assert.match(shape.input, /^You are the Code review agent in X-RayViewer/);
    assert.match(shape.input, /## What Claude Code's \/code-review reported\n\nsrc\/cart\.js:3 — a 10% discount takes the whole total off\n$/);
    for (const id of ["correctness", "tests"]) {
      const brief = new RegExp(`## ${settings.agents[id].name} \\(\`agent\`: "${id}"\\)\\n\\nFocus: ${settings.agents[id].focus}\\.`);
      assert.match(shape.input, brief, `${id}'s own instructions reach the run that shapes the report`);
      assert.ok(shape.input.includes(settings.agents[id].instructions.trim().replace(/^(#{1,5}) /gm, "#$1 ")));
    }
    const schema = JSON.parse(shape.args[shape.args.indexOf("--json-schema") + 1]);
    assert.deepEqual(schema.properties.findings.items.properties.agent.enum, ["claude-code-review", "correctness", "tests"]);
    for (const run of [shape, lede]) {
      assert.ok(run.args.includes("--disable-slash-commands") && run.args.includes("--json-schema"), "the bundle's own read-only Claude Code flags");
      assert.ok(!run.args.includes("Bash"));
      assert.deepEqual(run.args.slice(run.args.indexOf("--output-format"), run.args.indexOf("--output-format") + 3), ["--output-format", "stream-json", "--verbose"]);
    }
    assert.ok(progress.some((agents) => typeof agents["claude-code-review"]?.startedAt === "number"), "a running agent carries its start time");
    assert.deepEqual(
      activity["claude-code-review"].steps.map((step) => [step.kind, step.title, step.state, step.detail ?? null]),
      [
        ["command", "git diff --stat", "done", "src/cart.js | 2 +-"],
        ["message", "Shaping the report into findings.", "done", null],
      ],
      "both of the agent's Claude Code runs report their steps",
    );

    assert.deepEqual(result.file.agents.map((a: { id: string; short: string }) => [a.id, a.short]), [
      ["claude-code-review", "Code review"],
      ["correctness", "Correctness"],
      ["tests", "Test"],
    ]);
    assert.deepEqual(result.file.findings.map((f: { agent: string; title: string; severity: string }) => [f.agent, f.title, f.severity]), [
      ["claude-code-review", finding.title, "high"],
      ["tests", untested.title, "medium"],
    ]);
    const first = progress[0];
    assert.equal(first.correctness.state, "skipped");
    assert.match(first.correctness.error ?? "", /\/code-review reviews in its place, with this agent's instructions/);
    assert.deepEqual([(first.correctness as { by?: string }).by, (first.correctness as { name?: string }).name], ["claude-code-review", settings.agents.correctness.name], "the activity sheet lists it under the Code review agent");
    assert.equal(first.tests.state, "skipped");
    assert.deepEqual(agentRuns.filter((run) => run.id !== "lede").map((run) => [run.id, run.harness, run.findings, run.costUsd]), [
      ["claude-code-review", "claude", 1, 0.03],
    ]);
    assert.equal(settings.agents["claude-code-review"], undefined, "agents.yml's settings are left as they were");
  });

  const schemaOn = { claude: "--json-schema", codex: "--output-schema", cursor: "Reply with only a JSON object matching this JSON Schema" };
  const tokensOn = {
    claude: { input: 17, cachedInput: 0, output: 7 },
    codex: { input: 10, cachedInput: 2, output: 4 },
    cursor: { input: 12, cachedInput: 2, output: 4 },
  };
  for (const harness of ["claude", "codex", "cursor"] as const) {
    test(`a review on ${harness} asks an agent whose JSON doesn't parse to fix it once, and uses the fixed reply`, async () => {
      const { zu, $t, ui, Yt } = ext.__xrayviewer;
      const { repo, data } = await cartCheckout(`fix-reply-checkout-${harness}`);
      const agent = harness === "claude" ? "claude-code-review" : "correctness";
      const finding = {
        agent,
        severity: "high",
        confidence: "High confidence",
        label: "blocking",
        path: "src/cart.js",
        match: changed,
        title: "Discount divides by ten, not a hundred",
        body: "A 10% discount takes the whole total off.",
        steps: [{ path: null, match: changed, text: "Divides by 10." }],
        fix: "Divide by 100.",
        comment: "Should this divide by 100?",
      };
      const fixed = { findings: [finding], checked: [] };
      const broken = JSON.stringify(fixed).replace("]", "]}");
      const cli = await fakeAgentCli(`${harness}-fix-reply`, harness, { broken, fixed, lede: { lede: "One high finding." } });
      const { settings } = await $t();
      settings.agents.correctness = { ...settings.agents.correctness, harness: "", model: "" };
      const harnesses = { ...Yt().harnesses, default: harness };
      harnesses[harness] = { ...harnesses[harness], command: cli.file, model: "", extraArgs: [] };
      const runDir = path.join(root, `fix-reply-run-${harness}`);
      const agentRuns: Array<Record<string, unknown>> = [];

      const result = await zu({
        key: { owner: "acme", name: "shop", number: 2 },
        repoPath: repo,
        baseDir: null,
        data,
        detail: discountDetail,
        harnesses,
        settings,
        enabled: ["correctness"],
        runDir,
        timeoutMs: 30_000,
        limiter: new ui(3),
        signal: new AbortController().signal,
        agentRuns,
      });

      const calls = await cli.calls();
      const asked = calls.filter((call) => call.input.includes(broken));
      assert.equal(asked.length, 1, "asked once, with the whole reply");
      assert.equal(calls.length, harness === "claude" ? 4 : 3, "the review, the request to fix it and the summary line, after Claude Code's /code-review");
      assert.match(asked[0].input, /doesn't parse: \S/);
      assert.ok(asked[0].args.concat(asked[0].input).some((part) => part.includes(schemaOn[harness])), "the same schema");
      assert.ok(!asked[0].args.some((arg) => arg.startsWith("/code-review")), "/code-review doesn't run again");
      assert.deepEqual(result.file.findings.map((f: { agent: string; title: string }) => [f.agent, f.title]), [[agent, finding.title]]);
      const run = agentRuns.find((entry) => entry.id === agent);
      assert.deepEqual(run?.tokens, tokensOn[harness], "the tokens cover every run of the agent");
      if (harness === "claude") assert.equal((run?.costUsd as number).toFixed(2), "0.04");
      const log = await readFile(path.join(runDir, "run.log"), "utf8");
      assert.match(log, new RegExp(`${agent} sent JSON that doesn't parse, asking it to fix it: \\S`));
      assert.match(log, new RegExp(`${agent} done on ${harness}`));
    });
  }

  test("the dispatcher reports a missing CLI and Cursor's own errors in X-RayViewer's words", async () => {
    const { Na } = ext.__xrayviewer;
    const request = { prompt: "Review.", schema: {}, cwd: root, readDirs: [], timeoutMs: 30_000 };
    const failing = await fakeCli("cursor-bad-model", { exitCode: 1, stderr: "Cannot use this model: nope. Available models: auto" });

    await assert.rejects(Na({ id: "cursor", command: path.join(root, "nowhere", "cursor-agent"), model: "", extraArgs: [] }, request), {
      kind: "missing",
      message: /The Cursor Agent CLI wasn't found/,
    });
    await assert.rejects(Na({ id: "cursor", command: failing.file, model: "nope", extraArgs: [] }, request), {
      kind: "failed",
      message: /Cursor can't use the model "nope"/,
    });
  });
});
