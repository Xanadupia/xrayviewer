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

function cliRow(harness: HarnessId, installed: string, latest: string, usedBy: number, running: number): PickerRow {
  const action: PickerRow["action"] = !installed ? "install" : latest ? "update" : undefined;
  const all = Boolean(installed) && running > 0 && usedBy === running;
  const used = !installed || !usedBy ? "" : all ? "In use" : `${usedBy} of ${running} agents`;
  const description = [used, installed ? shortVersion(installed) : "Not installed"].filter(Boolean).join(" · ");
  const base = { description, icon: all ? "pass-filled" : usedBy && installed ? "pass" : "circle-large-outline", harness, ...(action ? { action } : {}) };
  switch (harness) {
    case "cursor":
      return {
        ...base,
        label: "Cursor Agent",
        detail: installed ? "Pick a model on your Cursor account." : "Picking it installs Cursor Agent, then you pick a model.",
        agent: "pick-cursor",
      };
    case "codex":
      return {
        ...base,
        label: "Codex",
        detail: installed ? "Pick a model and reasoning level." : "Picking it installs Codex, then you pick a model.",
        agent: "install-codex",
      };
    case "claude":
      return {
        ...base,
        label: "Claude Code",
        detail: installed ? "Pick a model and effort level." : "Picking it installs Claude Code, then you pick a model.",
        agent: "install-claude",
      };
    default: {
      const never: never = harness;
      return never;
    }
  }
}

function downloadRow(action: "install" | "update", cli: string, harness: HarnessId, latest: string): PickerRow {
  const icon = "cloud-download";
  switch (action) {
    case "install":
      return { label: "Install", description: cli, icon, harness, runs: "install" };
    case "update":
      return { label: "Install update", description: `${cli} ${shortVersion(latest)}`, icon, harness, runs: "update" };
    default: {
      const never: never = action;
      return never;
    }
  }
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
 * Install and Install update are the CLI row's button, which the editor only draws while the mouse is on the row, so
 * a missing CLI gets an Install row under it and an update gets an Install update row. Picking a missing CLI installs
 * it. Picking an installed CLI still chooses that CLI.
 * With a scope, the choice is for that pull request only, and the last rows lead back to the default.
 */
export function harnessPicker(input: PickerInput): Picker {
  const { agents, plan, installed, guideId, scope } = input;
  const updates = input.updates ?? {};
  const running = plan.filter((p) => agents[p.id]?.enabled !== false);
  const usedBy = (harness: HarnessId) => running.filter((p) => p.harness === harness).length;
  const clis = (["cursor", "codex", "claude"] as const).flatMap((harness) => {
    const latest = updates[harness] ?? "";
    const row = cliRow(harness, installed[harness], latest, usedBy(harness), running.length);
    return row.action ? [row, downloadRow(row.action, row.label, harness, latest)] : [row];
  });

  const agentRows = plan.map((p): PickerRow => {
    const agent = agents[p.id];
    const off = agent?.enabled === false;
    const viaReview = !off && p.harness === "claude" && p.id !== guideId;
    const model = p.model === "auto" ? "Auto" : p.model || "Default model";
    return {
      label: p.short,
      description: [harnessName(p.harness), model, p.thinking, viaReview ? "via /code-review" : "", off ? "Off" : ""].filter(Boolean).join(" · "),
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