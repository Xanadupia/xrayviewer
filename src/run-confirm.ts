import { claudeEffort } from "./claude-models.ts";
import { reasoningEffort } from "./codex-models.ts";

export type HarnessId = "claude" | "codex" | "cursor";

export interface HarnessSettings {
  command?: string;
  model: string;
  extraArgs?: readonly string[];
  thinking?: string | null;
}

export interface RunChoice {
  harness: HarnessId;
  settings: HarnessSettings;
  /** Set when one agent was changed. Its own model wins over the harness model. */
  agent: { name: string; model: string } | null;
  /** Whether any enabled agent runs on this harness. */
  inUse: boolean;
  /** A name with the version, such as "Opus 5.5", shown instead of the model setting. */
  modelName?: string;
  /** Every agent a run starts, with what each runs on. */
  plan?: PlannedAgent[];
  /** The pull request the choice is for, such as `#12`; empty when it's the default. */
  scope?: string;
}

export interface NoticeDeps {
  vscode: { window: { showInformationMessage(message: string): PromiseLike<unknown> } };
  log(line: string): void;
}

export function harnessName(id: HarnessId): string {
  switch (id) {
    case "claude":
      return "Claude Code";
    case "codex":
      return "Codex";
    case "cursor":
      return "Cursor";
    default: {
      const never: never = id;
      return never;
    }
  }
}

/** The model and level a harness runs with, the way each CLI reads its settings. */
export function chosenModel(choice: RunChoice): { model: string; level: string; levelWord: string } {
  const own = choice.agent?.model || "";
  const model = own || choice.settings.model;
  const extraArgs = choice.settings.extraArgs ?? [];
  switch (choice.harness) {
    case "claude":
      return { model, level: claudeEffort(extraArgs), levelWord: "effort" };
    case "codex":
      return { model, level: reasoningEffort(extraArgs), levelWord: "reasoning" };
    case "cursor":
      return { model, level: "", levelWord: "" };
    default: {
      const never: never = choice.harness;
      return never;
    }
  }
}

export interface AgentSetting {
  name: string;
  harness?: string;
  model?: string;
  enabled?: boolean;
}

export type HarnessTable = { default: HarnessId } & Record<HarnessId, HarnessSettings>;

/** What one agent runs on next, in the shape the review page's model line reads. */
export interface PlannedAgent {
  id: string;
  name: string;
  short: string;
  harness: HarnessId;
  model: string;
  thinking: string;
}

const HARNESSES: readonly string[] = ["claude", "codex", "cursor"] satisfies HarnessId[];
const isHarness = (id: string | undefined): id is HarnessId => !!id && HARNESSES.includes(id);

/**
 * The harness, model, and level each enabled agent would run with now. `nameOf` gives a model's name with its
 * version, such as "Opus 5.5" for `opus`, or an empty string to keep the setting as it is.
 */
export function plannedAgents(
  agents: Record<string, AgentSetting>,
  harnesses: HarnessTable,
  nameOf: (harness: HarnessId, model: string) => string,
): PlannedAgent[] {
  return Object.entries(agents).flatMap(([id, agent]) => {
    if (!agent.enabled) return [];
    const harness = isHarness(agent.harness) ? agent.harness : harnesses.default;
    const settings = harnesses[harness];
    if (!settings) return [];
    const { model, level } = chosenModel({ harness, settings, agent: { name: agent.name, model: agent.model ?? "" }, inUse: true });
    const short = agent.name.replace(/\s+agent$/i, "").trim() || agent.name;
    return [{ id, name: agent.name, short, harness, model: (model && nameOf(harness, model)) || model, thinking: level }];
  });
}

export function choiceSentence(choice: RunChoice): string {
  const name = harnessName(choice.harness);
  const { model, level, levelWord } = chosenModel(choice);
  const shown = choice.modelName || model || `${name}'s default`;
  const at = !level ? "" : level === "off" ? ` with ${levelWord} off` : ` at ${level} ${levelWord}`;
  return choice.agent
    ? `The ${choice.agent.name.toLowerCase()} agent will use ${name} with ${shown}${at}.`
    : `${name} agents will use ${shown}${at}.`;
}

/**
 * Ends a model choice, which is already saved: a short note says what the agents will use. Nothing runs from here;
 * Run agents starts them.
 */
export function announceChoice(deps: NoticeDeps, choice: RunChoice): string {
  const name = harnessName(choice.harness);
  const plan = choice.plan ?? [];
  const next = !choice.inUse
    ? `No agent runs on ${name} yet. Pick it for all agents, or for one.`
    : plan.length === 1
      ? "Run agents starts it."
      : plan.length
        ? `Run agents starts all ${plan.length} agents together.`
        : "Run agents starts them.";
  const message = `${choice.scope ? `Saved for ${choice.scope}.` : "Saved."} ${choiceSentence(choice)} ${next}`;
  deps.log(message);
  void deps.vscode.window.showInformationMessage(message);
  return message;
}
