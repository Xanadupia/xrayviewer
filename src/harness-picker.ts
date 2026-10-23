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
  agent?: string;
  /** Which CLI the right-hand control downloads. */
  harness?: HarnessId;
  /** Install when the CLI is missing. Install update when a newer version is published. */
  action?: "install" | "update";
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
}

export interface Picker {
  title: string;
  placeHolder: string;
  rows: PickerRow[];
}

const agentCount = (n: number) => (n === 1 ? "the agent" : `all ${n} agents`);

const sentence = (text: string) => (/[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);

const cliLabel = (harness: HarnessId) => (harness === "cursor" ? "Cursor Agent" : harnessName(harness));

/** A quiet rule, so a section break stays visible in a dim menu without a heavy bar. */
const section = (title: string): PickerRow => ({ label: `—  ${title}  —`, separator: true });

function cliRow(harness: HarnessId, installed: string, latest: string, total: number, usedBy: number, running: number): PickerRow {
  const name = cliLabel(harness);
  const move = `Move ${agentCount(total)} to ${harnessName(harness)}`;
  const used = !usedBy ? "" : usedBy === running ? `used by ${agentCount(running)}` : `used by ${usedBy} of ${running} agents`;
  const action: PickerRow["action"] = !installed ? "install" : latest ? "update" : undefined;
  const actionLabel = action === "install" ? "Install" : action === "update" ? "Install update" : "";
  const description = [installed ? used : "", actionLabel].filter(Boolean).join(" · ");
  const base = { description, harness, ...(action ? { action } : {}) };
  switch (harness) {
    case "cursor":
      return {
        ...base,
        label: installed ? `Cursor Agent ${installed}` : "Cursor Agent",
        detail: installed
          ? `${move}, then pick a model on your Cursor account.`
          : "Not installed. Install downloads it. Picking the row chooses a model once it is there.",
        agent: "pick-cursor",
      };
    case "codex":
      return {
        ...base,
        label: installed ? `Codex ${installed}` : "Codex",
        detail: installed
          ? `${move}, then pick a model and reasoning level. The run uses the newest Codex on this machine.`
          : `Not installed. Install downloads it. Picking the row downloads it and moves ${agentCount(total)} to Codex.`,
        agent: "install-codex",
      };
    case "claude":
      return {
        ...base,
        label: installed ? `Claude Code ${installed}` : "Claude Code",
        detail: installed
          ? `${move}, then pick a model and effort level. The run uses the newest Claude Code on this machine.`
          : `Not installed. Install downloads it. Picking the row downloads it and moves ${agentCount(total)} to Claude Code.`,
        agent: "install-claude",
      };
    default: {
      const never: never = harness;
      return never;
    }
  }
}

/**
 * The agent picker: move every agent to one CLI, or change one agent. It only saves the choice. Every agent that's
 * on runs together when Run agents is pressed, whichever row was changed, so the placeholder says so.
 * Install and Install update sit on the CLI row. Picking the row still chooses that CLI.
 */
export function harnessPicker(input: PickerInput): Picker {
  const { agents, plan, installed, guideId } = input;
  const updates = input.updates ?? {};
  const running = plan.filter((p) => agents[p.id]?.enabled !== false);
  const usedBy = (harness: HarnessId) => running.filter((p) => p.harness === harness).length;
  const clis = (["cursor", "codex", "claude"] as const).map((harness) =>
    cliRow(harness, installed[harness], updates[harness] ?? "", plan.length, usedBy(harness), running.length),
  );

  const agentRows = plan.map((p): PickerRow => {
    const agent = agents[p.id];
    const off = agent?.enabled === false;
    const notes = [
      agent?.focus ? sentence(agent.focus) : "",
      p.id === guideId ? "Also writes the briefing's opening line." : "",
      off ? "Turned off, so it doesn't run." : p.harness === "claude" && p.id !== guideId ? "On Claude Code, /code-review reviews for it, using its instructions." : "",
    ];
    return {
      label: p.short,
      description: [harnessName(p.harness), p.model || "its default model", p.thinking, off ? "off" : ""].filter(Boolean).join(" · "),
      detail: notes.filter(Boolean).join(" "),
      agent: p.id,
    };
  });

  return {
    title: "Choose model",
    placeHolder:
      running.length > 1
        ? `Run agents runs all ${running.length} agents together. A change here is saved for the next run.`
        : "A change here is saved for the next run.",
    rows: [section("Change all agents"), ...clis, section("Change one agent"), ...agentRows],
  };
}