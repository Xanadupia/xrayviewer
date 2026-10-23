import { spawn } from "node:child_process";
import { claudeEffort, withClaudeEffort } from "./claude-models.ts";
import type { CliModel } from "./cli-model.ts";
import { reasoningEffort, withReasoningEffort } from "./codex-models.ts";
import type { CliVersion } from "./installed-versions.ts";
import type { PickItem, VscodeLike } from "./cursor-model-picker.ts";

export type CliId = "claude" | "codex";

const INSTALL = "\0install";
const CHANGE_VERSION = "\0version";

export interface VersionPickerDeps {
  vscode: VscodeLike & {
    window: VscodeLike["window"] & {
      showInformationMessage(message: string, options: { modal: boolean }, ...items: string[]): PromiseLike<string | undefined>;
    };
  };
  list(): readonly CliVersion[] | Promise<readonly CliVersion[]>;
  /** The path last saved. A run uses the newest install instead of this when one exists. */
  currentPath(): string;
  install(): Promise<{ ok: boolean; output: string }>;
  log(line: string): void;
  currentModel?: () => string;
  currentExtraArgs?: () => readonly string[];
  setAgentModel?: (id: string, model: string) => Promise<void>;
  /** Saves a model or level setting under `xrayviewer`. Without it, the user's settings.json is written. */
  saveSetting?: (key: string, value: unknown) => PromiseLike<void>;
  listModels?: (command: string) => Promise<CliModel[] | null>;
}

interface CliSpec {
  title: string;
  installLabel: string;
  installDetail: string;
  setting: string;
  command: string;
  modelSetting: string;
  argsSetting: string;
  modelHint: string;
  levelWord: string;
  levelHint: string;
  readLevel(extraArgs: readonly string[]): string;
  writeLevel(extraArgs: readonly string[], level: string): string[];
}

function spec(id: CliId): CliSpec {
  switch (id) {
    case "claude":
      return {
        title: "Claude Code",
        installLabel: "Install Claude Code…",
        installDetail: "Downloads it with the official installer from claude.ai.",
        setting: "claude.path",
        command: "curl -fsSL https://claude.ai/install.sh | bash",
        modelSetting: "claude.model",
        argsSetting: "claude.extraArgs",
        modelHint: "Each row follows the newest version. Set xrayviewer.claude.model to a full id to keep one.",
        levelWord: "effort",
        levelHint: "Higher effort thinks longer and costs more",
        readLevel: claudeEffort,
        writeLevel: withClaudeEffort,
      };
    case "codex":
      return {
        title: "Codex",
        installLabel: "Install Codex…",
        installDetail: "Downloads the Codex CLI with OpenAI's official installer.",
        setting: "codex.path",
        command: "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
        modelSetting: "codex.model",
        argsSetting: "codex.extraArgs",
        modelHint: "Models this Codex CLI provides",
        levelWord: "reasoning",
        levelHint: "Medium is the everyday level",
        readLevel: reasoningEffort,
        writeLevel: withReasoningEffort,
      };
    default: {
      const never: never = id;
      return never;
    }
  }
}

export function officialInstallCommand(id: CliId): string {
  return spec(id).command;
}

export function versionItems(versions: readonly CliVersion[], install: Pick<CliSpec, "title" | "installLabel" | "installDetail">): PickItem[] {
  const newest = versions[0]?.path;
  return [
    ...versions.map((version) => ({
      label: version.version === "installed" ? "Installed copy" : version.version,
      description: [version.path, version.path === newest ? "in use" : ""].filter(Boolean).join(" · "),
      value: version.path,
    })),
    {
      label: versions.length ? `Install another ${install.title} version…` : install.installLabel,
      detail: install.installDetail,
      value: INSTALL,
    },
  ];
}

async function pickModel(
  deps: VersionPickerDeps,
  chosen: CliSpec,
  agent: { id?: string; name: string } | null,
  versions: readonly { path: string }[],
  who: string,
): Promise<boolean | "version"> {
  const { window, workspace, ProgressLocation, ConfigurationTarget } = deps.vscode;
  const command = versions[0].path;
  const models = await window.withProgress(
    { location: ProgressLocation.Notification, title: `Asking ${chosen.title} for its models…` },
    () => deps.listModels?.(command) ?? Promise.resolve(null),
  );
  if (!models) {
    await window.showWarningMessage(`X-RayViewer couldn't list the models in ${chosen.title} at ${command}.`);
    return true;
  }
  const fallback = `${chosen.title}'s default`;
  const current = deps.currentModel?.() ?? "";
  const listed = models.some((model) => model.slug === current);
  const picked = await window.showQuickPick(
    [
      { label: fallback, description: current ? "" : "in use", detail: "Whatever this CLI picks.", value: "" },
      ...(current && !listed ? [{ label: current, description: "in use", value: current }] : []),
      ...models.map((model) => ({
        label: model.name,
        description: [model.slug, model.fullId ?? "", model.slug === current ? "in use" : ""].filter(Boolean).join(" · "),
        detail: model.description,
        value: model.slug,
      })),
      { label: "Change installed version…", detail: `Pick another ${chosen.title} build, or install one.`, value: CHANGE_VERSION },
    ],
    { title: `Model for ${who}`, placeHolder: chosen.modelHint, matchOnDescription: true },
  );
  if (!picked) return false;
  if (picked.value === CHANGE_VERSION) return "version";
  const model = models.find((item) => item.slug === picked.value);
  const extraArgs = deps.currentExtraArgs?.() ?? [];
  let effort = "";
  if (model?.efforts.length) {
    const currentEffort = chosen.readLevel(extraArgs);
    const level = await window.showQuickPick(
      [
        ...(model.defaultEffort
          ? []
          : [{ label: fallback, description: currentEffort ? "" : "in use", detail: `Leaves the ${chosen.levelWord} to the CLI.`, value: "" }]),
        ...model.efforts.map((item) => ({
          label: item.effort.slice(0, 1).toUpperCase() + item.effort.slice(1),
          description: [item.effort === model.defaultEffort ? "default" : "", item.effort === currentEffort ? "in use" : ""].filter(Boolean).join(" · "),
          detail: item.description,
          value: item.effort,
        })),
      ],
      { title: `${chosen.levelWord.slice(0, 1).toUpperCase()}${chosen.levelWord.slice(1)} for ${model.name}`, placeHolder: chosen.levelHint },
    );
    if (!level) return false;
    effort = level.value;
  }
  const saveSetting = deps.saveSetting ?? ((key: string, value: unknown) => workspace.getConfiguration("xrayviewer").update(key, value, ConfigurationTarget.Global));
  if (agent?.id && deps.setAgentModel) await deps.setAgentModel(agent.id, picked.value);
  else await saveSetting(chosen.modelSetting, picked.value);
  if (model) await saveSetting(chosen.argsSetting, chosen.writeLevel(extraArgs, effort));
  deps.log(`${who} now ${agent ? "uses" : "use"} ${picked.value || fallback}${effort ? `, ${chosen.levelWord} ${effort}` : ""}`);
  return true;
}

/**
 * Asks which model an installed Claude Code or Codex uses, with its level.
 * Offers the official installer when none is installed, and also when some are, so a newer version can be added.
 * The run uses the newest installed binary. Choosing an older row does not pin it.
 */
export async function pickCliVersion(deps: VersionPickerDeps, id: CliId, agent: { id?: string; name: string } | null): Promise<boolean> {
  const { window, workspace, ProgressLocation, ConfigurationTarget } = deps.vscode;
  const chosen = spec(id);
  const who = agent ? `the ${agent.name.toLowerCase()} agent` : `agents on ${chosen.title}`;
  const thenModel = async () => {
    if (!deps.listModels) return true;
    return (await pickModel(deps, chosen, agent, await deps.list(), who)) || true;
  };
  let showVersion = false;
  for (;;) {
    const versions = await deps.list();
    if (!showVersion && versions.length && deps.listModels) {
      const choice = await pickModel(deps, chosen, agent, versions, who);
      if (choice === "version") {
        showVersion = true;
        continue;
      }
      return choice;
    }
    showVersion = false;
    const picked = await window.showQuickPick(versionItems(versions, chosen), {
      title: `${chosen.title} version for ${who}`,
      placeHolder: versions.length ? "Installed on this machine" : `${chosen.title} is not installed`,
      matchOnDescription: true,
    });
    if (!picked) return false;
    if (picked.value !== INSTALL) {
      const newest = versions[0];
      await workspace.getConfiguration("xrayviewer").update(chosen.setting, newest.path, ConfigurationTarget.Global);
      deps.log(`${chosen.title} agents now use ${newest.version} at ${newest.path}`);
      const choice = await thenModel();
      if (choice !== "version") return choice;
      showVersion = true;
      continue;
    }
    const agreed = await window.showInformationMessage(
      `Install ${chosen.title}? X-RayViewer will download it with the official installer.`,
      { modal: true },
      "Install",
    );
    if (agreed !== "Install") return false;
    const result = await window.withProgress(
      { location: ProgressLocation.Notification, title: `Installing ${chosen.title}…` },
      () => deps.install(),
    );
    if (!result.ok) {
      await window.showWarningMessage(`${chosen.title} did not install. ${result.output.trim().split("\n").at(-1) ?? "The installer failed."}`);
      continue;
    }
    const installed = await deps.list();
    if (!installed.length) {
      await window.showWarningMessage(`${chosen.title} installed, but no version was found on this machine.`);
      continue;
    }
    const newest = installed[0];
    await workspace.getConfiguration("xrayviewer").update(chosen.setting, newest.path, ConfigurationTarget.Global);
    deps.log(`${chosen.title} agents now use ${newest.version} at ${newest.path}`);
    const choice = await thenModel();
    if (choice !== "version") return choice;
    showVersion = true;
  }
}

/** Runs one of the official installer commands. The command is chosen by this module, not by the user. */
export function runOfficialInstall(command: string): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = spawn("bash", ["-lc", command], { timeout: 180_000 });
    let output = "";
    const keep = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-4000);
    };
    child.stdout?.on("data", keep);
    child.stderr?.on("data", keep);
    child.on("error", (error) => resolve({ ok: false, output: error.message }));
    child.on("close", (code) => resolve({ ok: code === 0, output }));
  });
}
