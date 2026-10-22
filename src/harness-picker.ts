import { harnessName, type HarnessId, type PlannedAgent } from "./run-confirm.ts";

export interface PickerAgent {
  name: string;
  focus?: string;
  enabled?: boolean;
}

/** An item in the agent picker. `agent` says what picking it does; a separator only has a label. */
export interface PickerRow {
  label: string;
  description?: string;
  detail?: string;
  agent?: string;
  separator?: true;
}

export interface PickerInput {
  agents: Record<string, PickerAgent>;
  /** What each agent runs on, turned off or not, in agents.yml's order. */
  plan: PlannedAgent[];
  /** Each CLI's installed version; empty when it isn't installed. */
  installed: Record<HarnessId, string>;
  guideId: string;
}

export interface Picker {
  title: string;
  placeHolder: string;
  rows: PickerRow[];
}

const agentCount = (n: number) => (n === 1 ? "the agent" : `all ${n} agents`);

const sentence = (text: string) => (/[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);

function cliRow(harness: HarnessId, installed: string, total: number, usedBy: number, running: number): PickerRow | null {
  const move = `Move ${agentCount(total)} to ${harnessName(harness)}`;
  const used = !usedBy ? "" : usedBy === running ? `used by ${agentCount(running)}` : `used by ${usedBy} of ${running} agents`;
  switch (harness) {
    case "cursor":
      return installed
        ? { label: `Cursor Agent ${installed}`, description: used, detail: `${move}, then pick a model on your Cursor account.`, agent: "pick-cursor" }
        : { label: "Cursor Agent CLI", description: "Not found", detail: "Install it, or set xrayview.cursor.path to where it is.", agent: "pick-cursor" };
    case "codex":
      return installed
        ? { label: `Codex ${installed}`, description: used, detail: `${move}, then pick a model and reasoning level, or another installed version.`, agent: "install-codex" }
        : { label: "Install Codex…", description: "Not installed", detail: `Download the Codex CLI and pick a model. Then ${agentCount(total)} move to Codex.`, agent: "install-codex" };
    case "claude":
      return installed
        ? { label: `Claude Code ${installed}`, description: used, detail: `${move}, then pick a model and effort level, or another installed version.`, agent: "install-claude" }
        : { label: "Install Claude Code…", description: "Not installed", detail: `Download Claude Code and pick a model. Then ${agentCount(total)} move to Claude Code.`, agent: "install-claude" };
    case "pi":
      return installed ? { label: `Pi ${installed}`, description: used, detail: `${move}, then pick a model.`, agent: "pick-pi" } : null;
    default: {
      const never: never = harness;
      return never;
    }
  }
}

/**
 * The agent picker: move every agent to one CLI, or change one agent. It only saves the choice. Every agent that's
 * on runs together when Run agents is pressed, whichever row was changed, so the placeholder says so.
 */
export function harnessPicker(input: PickerInput): Picker {
  const { agents, plan, installed, guideId } = input;
  const running = plan.filter((p) => agents[p.id]?.enabled !== false);
  const usedBy = (harness: HarnessId) => running.filter((p) => p.harness === harness).length;
  const clis = (["cursor", "codex", "claude", "pi"] as const)
    .map((harness) => cliRow(harness, installed[harness], plan.length, usedBy(harness), running.length))
    .filter((row): row is PickerRow => !!row);

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
    rows: [{ label: "Change all agents", separator: true }, ...clis, { label: "Change one agent", separator: true }, ...agentRows],
  };
}