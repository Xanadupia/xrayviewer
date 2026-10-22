import type { PickItem, VscodeLike } from "../../src/cursor-model-picker.ts";

export interface ConfigUpdate {
  section: string;
  key: string;
  value: unknown;
  target: number;
}

/** A vscode stand-in for the model picker: quick picks answer with `choose`, everything else is recorded. */
export function fakeVscode(choose: (items: readonly PickItem[], title: string) => PickItem | undefined) {
  const picks: Array<{ title: string; items: readonly PickItem[] }> = [];
  const warnings: string[] = [];
  const updates: ConfigUpdate[] = [];
  const vscode: VscodeLike = {
    window: {
      async showQuickPick(items, options) {
        picks.push({ title: options.title, items });
        return choose(items, options.title) as (typeof items)[number] | undefined;
      },
      async showWarningMessage(message) {
        warnings.push(message);
        return undefined;
      },
      withProgress: (_options, task) => task(),
    },
    workspace: {
      getConfiguration: (section) => ({
        async update(key, value, target) {
          updates.push({ section, key, value, target });
        },
      }),
    },
    ProgressLocation: { Notification: 15 },
    ConfigurationTarget: { Global: 1 },
  };
  return { vscode, picks, warnings, updates };
}
