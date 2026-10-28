import { harnessName, type HarnessId, type PlannedAgent } from "./run-confirm.ts";

export interface PickerAgent {
  name: string;
  focus?: string;
  enabled?: boolean;
}

/** An item in the agent picker. `agent` says what picking the row does. `action` is the control on its right. */
export interface PickerRow {
  label: string;
  description?: string;
  detail?: string;
  /** A codicon drawn before the label. */
  icon?: string;
  agent?: string;
  /** Which CLI the right-hand control downloads. */
  harness?: HarnessId;
  /** Install when the CLI is missing. Install update when a newer version is published. */
  action?: "install" | "update";
  /** The tooltip of the button on the right of the row. */
  actionTip?: string;
  /** Picking the row downloads `harness` instead of choosing anything. */
  runs?: "install" | "update";
  separator?: true;
}

export interface PickerInput {
  agents: Record<string, PickerAgent>;
  /** What each agent runs on, turned off or not, in agents.yml's order. */
  plan: PlannedAgent[];
  /** Each CLI's installed version; empty when it isn't installed. */
  installed: Record<HarnessId, string>;
  /** A newer published version, when one is available for that installed CLI. */
  updates?: Partial<Record<HarnessId, string>>;
  guideId: string;
  /** Set when the picker changes one pull request: its label, and whether it has a choice of its own yet. */
  scope?: { label: string; custom: boolean };
  /** The editor can paint a class on an icon. VS Code's icon syntax cannot, so only Cursor asks for this. */
  shade?: boolean;
}

export interface Picker {
  title: string;
  placeHolder: string;
  rows: PickerRow[];
}

const sentence = (text: string) => (/[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);

const section = (title: string): PickerRow => ({ label: title, separator: true });

/** Cursor's builds end in a commit hash, which tells a reader nothing. */
const shortVersion = (version: string) => version.replace(/-[0-9a-f]{7,}$/i, "");

const AGENT_ICONS: Record<string, string> = { architecture: "layers", correctness: "bug", tests: "beaker", security: "shield" };

/**
 * Cursor paints this class as a soft mix of the button color. Only Cursor's icon syntax can carry a class,
 * so the picker adds it when `shade` is set and leaves a plain icon otherwise.
 */
const UPDATE_SHADE = "usage-pricing-option-selected";

function cliRow(harness: HarnessId, installed: string, latest: string, usedBy: number, running: number, shade: boolean): PickerRow {
  const action: PickerRow["action"] = !installed ? "install" : latest ? "update" : undefined;
  const all = Boolean(installed) && running > 0 && usedBy === running;
  const used = !installed || !usedBy ? "" : all ? "In use" : `${usedBy} of ${running} agents`;
  const version = installed ? shortVersion(installed) : "Not installed";
  const description = [used, version].filter(Boolean).join(" · ");
  const updateIcon = shade ? `$(cloud-download#${UPDATE_SHADE})` : "$(cloud-download)";
  const update = action === "update" ? `${updateIcon} Update ${shortVersion(latest)}` : "";
  const actionTip = action === "install" ? "Install" : action === "update" ? `Install update to ${shortVersion(latest)}` : undefined;
  const base = { description, icon: all ? "pass-filled" : usedBy && installed ? "pass" : "circle-large-outline", harness, ...(action ? { action, actionTip } : {}) };
  const titled = (name: string) => [name, update].filter(Boolean).join(" ");
  switch (harness) {
    case "cursor":
      return {
        ...base,
        label: titled("Cursor Agent"),
        detail: installed ? "Pick a model on your Cursor account." : "Picking it installs Cursor Agent, then you pick a model.",
        agent: "pick-cursor",
      };
    case "codex":
      return {
        ...base,
        label: titled("Codex"),
        detail: installed ? "Pick a model and reasoning level." : "Picking it installs Codex, then you pick a model.",
        agent: "install-codex",
      };
    case "claude":
      return {
        ...base,
        label: titled("Claude Code"),
        detail: installed ? "Pick a model and effort level." : "Picking it installs Claude Code, then you pick a model.",
        agent: "install-claude",
      };
    default: {
      const never: never = harness;
      return never;
    }
  }
}

function installRow(cli: string, harness: HarnessId): PickerRow {
  return { label: "Install", description: cli, icon: "cloud-download", harness, runs: "install" };
}

function scopeRows(scope: NonNullable<PickerInput["scope"]>): PickerRow[] {
  return [
    section("Every pull request"),
    ...(scope.custom
      ? [{ label: "Use the default", detail: `Drop ${scope.label}'s own choice.`, icon: "discard", agent: "scope-reset" }]
      : []),
    { label: "Change the default…", detail: "For pull requests without a choice of their own.", icon: "globe", agent: "scope-global" },
  ];
}

/**
 * The agent picker: move every agent to one CLI, or change one agent. It only saves the choice. Every agent that's
 * on runs together when Run agents is pressed, whichever row was changed, so the placeholder says so.
 * An update keeps to the CLI's own row: the name line carries Update and the new version on a soft highlight, and
 * the download button on the right installs it. A missing CLI gets an Install row under it, and picking the CLI
 * installs it too. Picking an installed
 * CLI still chooses that CLI.
 * With a scope, the choice is for that pull request only, and the last rows lead back to the default.
 */
export function harnessPicker(input: PickerInput): Picker {
  const { agents, plan, installed, guideId, scope } = input;
  const updates = input.updates ?? {};
  const running = plan.filter((p) => agents[p.id]?.enabled !== false);
  const usedBy = (harness: HarnessId) => running.filter((p) => p.harness === harness).length;
  const clis = (["cursor", "codex", "claude"] as const).flatMap((harness) => {
    const latest = updates[harness] ?? "";
    const row = cliRow(harness, installed[harness], latest, usedBy(harness), running.length, Boolean(input.shade));
    return row.action === "install" ? [row, installRow(row.label, harness)] : [row];
  });

  const agentRows = plan.map((p): PickerRow => {
    const agent = agents[p.id];
    const off = agent?.enabled === false;
    const model = p.model === "auto" ? "Auto" : p.model || "Default model";
    return {
      label: p.short,
      description: [harnessName(p.harness), model, p.thinking, off ? "Off" : ""].filter(Boolean).join(" · "),
      ...(agent?.focus ? { detail: sentence(agent.focus) } : {}),
      icon: off ? "circle-slash" : p.id === guideId ? "compass" : AGENT_ICONS[p.id] ?? "hubot",
      agent: p.id,
    };
  });

  const together = running.length > 1 ? `All ${running.length} agents run together. ` : "";
  return {
    title: scope ? `What the agents run on for ${scope.label}` : "What the agents run on",
    placeHolder: scope ? `${together}Changes apply to ${scope.label} only.` : `${together}Changes apply to the next run.`,
    rows: [section("All agents"), ...clis, section("One agent"), ...agentRows, ...(scope ? scopeRows(scope) : [])],
  };
}