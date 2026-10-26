import type { AgentSetting, HarnessId, HarnessTable } from "./run-confirm.ts";

/** What one pull request runs on where it differs from the default. A field left out follows the default. */
export interface ModelChoice {
  /** Settings under `xrayviewer`: `harness`, and each CLI's `model` and `extraArgs`. */
  config: Record<string, unknown>;
  agents: Record<string, { harness?: string; model?: string; effort?: string }>;
}

/** The slice of `ExtensionContext.globalState` the choices are saved in. */
export interface ModelStore {
  get<T>(key: string, fallback: T): T;
  update(key: string, value: unknown): PromiseLike<void>;
}

type Loaded = { settings: { agents: Record<string, AgentSetting> } };

export interface ScopeDeps<L extends Loaded> {
  /** A pull request's key, such as `owner/repo#12`. Anything else picks the default every pull request uses. */
  key: unknown;
  harnesses(): HarnessTable;
  settings(): Promise<L>;
  setAgentHarness(agentId: string, harness: string): Promise<{ clearedModel?: string | null }>;
  setAgentModel(agentId: string, model: string): Promise<void>;
  setAgentEffort(agentId: string, effort: string): Promise<void>;
  saveSetting(key: string, value: unknown): PromiseLike<void>;
}

/** Where the model picker reads and saves: one pull request's own choice, or the default. */
export interface ModelScope<L extends Loaded> {
  /** `#12` for one pull request; empty for the default. */
  label: string;
  /** What the picker shows about the scope; absent for the default. */
  picker?: { label: string; custom: boolean };
  harnesses(): HarnessTable;
  settings(): Promise<L>;
  setAgentHarness(agentId: string, harness: string): Promise<{ clearedModel: string | null }>;
  setAgentModel(agentId: string, model: string): Promise<void>;
  setAgentEffort(agentId: string, effort: string): Promise<void>;
  saveSetting(key: string, value: unknown): Promise<void>;
  /** Drops the pull request's own choice and says so. */
  reset(): Promise<string>;
}

const STORE_KEY = "xrayviewer.pullRequestModels";
const PER_PULL_REQUEST = /^(harness|(claude|codex|cursor)\.(model|extraArgs))$/;
const HARNESSES = ["claude", "codex", "cursor"] as const satisfies readonly HarnessId[];
const KEY = /^[^/\s]+\/[^#\s]+#(\d+)$/;

let store: ModelStore | undefined;
let choices: Record<string, ModelChoice> = {};

export function bindModelStore(memento: ModelStore | undefined): void {
  store = memento;
  choices = { ...(memento?.get<Record<string, ModelChoice>>(STORE_KEY, {}) ?? {}) };
}

const storeId = (key: string) => key.toLowerCase();

async function save(key: string, choice: ModelChoice | undefined): Promise<void> {
  const id = storeId(key);
  choices = choice ? { ...choices, [id]: choice } : Object.fromEntries(Object.entries(choices).filter(([other]) => other !== id));
  await store?.update(STORE_KEY, choices);
}

export function hasModelChoice(key: string): boolean {
  return storeId(key) in choices;
}

function chosenHarnesses(harnesses: HarnessTable, { config }: ModelChoice): HarnessTable {
  const table = { ...harnesses };
  const harness = config.harness;
  if (HARNESSES.some((id) => id === harness)) table.default = harness as HarnessId;
  for (const id of HARNESSES) {
    const model = config[`${id}.model`];
    const extraArgs = config[`${id}.extraArgs`];
    table[id] = {
      ...harnesses[id],
      ...(typeof model === "string" ? { model } : {}),
      ...(Array.isArray(extraArgs) ? { extraArgs: extraArgs.map(String) } : {}),
    };
  }
  return table;
}

function chosenAgents<A extends AgentSetting>(agents: Record<string, A>, choice: ModelChoice): Record<string, A> {
  return Object.fromEntries(Object.entries(agents).map(([id, agent]) => [id, { ...agent, ...choice.agents[id] }]));
}

/** The harnesses and agent settings one pull request runs with: the default, with its own choice on top. */
export function withModelChoice<S extends Loaded["settings"]>(key: string, harnesses: HarnessTable, settings: S): { harnesses: HarnessTable; settings: S } {
  const choice = choices[storeId(key)];
  if (!choice) return { harnesses, settings };
  return { harnesses: chosenHarnesses(harnesses, choice), settings: { ...settings, agents: chosenAgents(settings.agents, choice) } };
}

/**
 * The model picker's reads and writes for one pull request, or for the default when `key` names none. A pull
 * request's scope saves into its own choice and leaves settings.json and agents.yml alone.
 */
export function modelScope<L extends Loaded>(deps: ScopeDeps<L>): ModelScope<L> {
  const key = typeof deps.key === "string" ? deps.key : "";
  const number = KEY.exec(key)?.[1];
  if (!number) {
    return {
      label: "",
      harnesses: deps.harnesses,
      settings: deps.settings,
      setAgentHarness: async (agentId, harness) => ({ clearedModel: (await deps.setAgentHarness(agentId, harness)).clearedModel ?? null }),
      setAgentModel: deps.setAgentModel,
      setAgentEffort: deps.setAgentEffort,
      saveSetting: async (name, value) => deps.saveSetting(name, value),
      reset: async () => "",
    };
  }

  const label = `#${number}`;
  const current = (): ModelChoice => choices[storeId(key)] ?? { config: {}, agents: {} };
  const ownAgent = async (agentId: string) => {
    const { settings } = await deps.settings();
    return { base: settings.agents[agentId], own: { ...current().agents[agentId] } };
  };
  const saveAgent = (agentId: string, own: ModelChoice["agents"][string]) =>
    save(key, { ...current(), agents: { ...current().agents, [agentId]: own } });

  return {
    label,
    get picker() {
      return { label, custom: hasModelChoice(key) };
    },
    harnesses: () => withModelChoice(key, deps.harnesses(), { agents: {} }).harnesses,
    settings: async () => {
      const loaded = await deps.settings();
      return { ...loaded, settings: withModelChoice(key, deps.harnesses(), loaded.settings).settings };
    },
    async setAgentHarness(agentId, harness) {
      const { base, own } = await ownAgent(agentId);
      const was = own.harness ?? base?.harness ?? "";
      const model = (own.model ?? base?.model ?? "").trim();
      const effort = (own.effort ?? base?.effort ?? "").trim();
      const clearedModel = was !== harness && model ? model : null;
      await saveAgent(agentId, { ...own, harness, ...(clearedModel ? { model: "" } : {}), ...(was !== harness && effort ? { effort: "" } : {}) });
      return { clearedModel };
    },
    async setAgentModel(agentId, model) {
      const { own } = await ownAgent(agentId);
      await saveAgent(agentId, { ...own, model });
    },
    async setAgentEffort(agentId, effort) {
      const { own } = await ownAgent(agentId);
      await saveAgent(agentId, { ...own, effort });
    },
    async saveSetting(name, value) {
      if (!PER_PULL_REQUEST.test(name)) return deps.saveSetting(name, value);
      await save(key, { ...current(), config: { ...current().config, [name]: value } });
    },
    async reset() {
      await save(key, undefined);
      return `${label} is back on the default models.`;
    },
  };
}
