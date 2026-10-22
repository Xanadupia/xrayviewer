import type { CursorConfig } from "./cursor-harness.ts";
import type { CursorModel } from "./cursor-models.ts";

export interface PickItem {
  label: string;
  description?: string;
  detail?: string;
  value: string;
}

/** The slice of the `vscode` API the picker uses. */
export interface VscodeLike {
  window: {
    showQuickPick<T extends PickItem>(
      items: readonly T[],
      options: { title: string; placeHolder?: string; matchOnDescription?: boolean },
    ): PromiseLike<T | undefined>;
    showWarningMessage(message: string): PromiseLike<unknown>;
    withProgress<R>(options: { location: number; title: string }, task: () => PromiseLike<R>): PromiseLike<R>;
  };
  workspace: {
    getConfiguration(section: string): { update(key: string, value: unknown, target: number): PromiseLike<void> };
  };
  ProgressLocation: { Notification: number };
  ConfigurationTarget: { Global: number };
}

export interface AgentRef {
  id: string;
  name: string;
  model: string;
}

export interface PickerDeps {
  vscode: VscodeLike;
  readConfig(): CursorConfig;
  setAgentModel(agentId: string, model: string): Promise<void>;
  log(line: string): void;
  listModels(): Promise<CursorModel[] | null>;
}

interface FallbackItem {
  label: string;
  description?: string;
  detail: string;
}

export function modelItems(models: CursorModel[], current: string, fallback: FallbackItem): PickItem[] {
  const inUse = (id: string) => (id === current ? "in use" : "");
  const listed = models.some((model) => model.id === current);
  return [
    {
      label: fallback.label,
      description: [fallback.description, inUse("")].filter(Boolean).join(" · "),
      detail: fallback.detail,
      value: "",
    },
    ...(current && !listed ? [{ label: current, description: "in use · not in your account's list", value: current }] : []),
    ...models.map((model) => ({
      label: model.name,
      description: [model.id, model.isDefault ? "Cursor's default" : "", inUse(model.id)].filter(Boolean).join(" · "),
      value: model.id,
    })),
  ];
}

/**
 * Lets the user pick one of their Cursor account's models, for every Cursor agent (`agent` null, saved in
 * `xrayviewer.cursor.model`) or for one agent (saved in agents.yml). Resolves true when a model was saved.
 */
export async function pickCursorModel(deps: PickerDeps, agent: AgentRef | null): Promise<boolean> {
  const { window, workspace, ProgressLocation, ConfigurationTarget } = deps.vscode;
  const shared = deps.readConfig().model;
  const models = await window.withProgress(
    { location: ProgressLocation.Notification, title: "Listing the models on your Cursor account…" },
    () => deps.listModels(),
  );
  if (!models) {
    await window.showWarningMessage(
      "X-RayViewer couldn't list your Cursor models. Check that the Cursor Agent CLI is installed and signed in: run `cursor-agent login` in a terminal.",
    );
    return false;
  }
  const items = agent
    ? modelItems(models, agent.model, {
        label: "Same as the other Cursor agents",
        description: shared || "Cursor's default",
        detail: "Uses xrayviewer.cursor.model.",
      })
    : modelItems(models, shared, { label: "Cursor's default", detail: "The model the Cursor Agent CLI picks for you." });
  const picked = await window.showQuickPick(items, {
    title: `Model for ${agent ? `the ${agent.name.toLowerCase()} agent` : "agents on Cursor"}`,
    placeHolder: "Type to search by name or id",
    matchOnDescription: true,
  });
  if (!picked) return false;
  if (agent) {
    await deps.setAgentModel(agent.id, picked.value);
    deps.log(`${agent.name} now runs on Cursor with ${picked.value || "the other Cursor agents' model"}`);
  } else {
    await workspace.getConfiguration("xrayviewer").update("cursor.model", picked.value, ConfigurationTarget.Global);
    deps.log(`Cursor agents now use ${picked.value || "Cursor's default model"}`);
  }
  return true;
}
