export interface RunningRecord {
  key: { owner: string; name: string; number: number };
  summary?: { title?: string } | null;
  run: {
    state: string;
    startedAt?: number;
    progress?: { agents?: Record<string, { state?: string } | null | undefined> } | null;
  };
}

/** A row in Running Reviews. `key` is what `xrayviewer.open` takes. */
export interface RunningRow {
  id: string;
  key: string;
  label: string;
  description: string;
  tooltip: string;
  icon: string;
}

type RunningState = "running" | "elsewhere" | "queued" | "waiting";

const ORDER: readonly RunningState[] = ["running", "elsewhere", "queued", "waiting"];
const isRunning = (state: string): state is RunningState => ORDER.some((each) => each === state);

function elapsed(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
}

function progressOf(run: RunningRecord["run"]): { text: string; icon: string } {
  const agents = Object.values(run.progress?.agents ?? {}).filter((agent) => agent && agent.state !== "skipped");
  const done = agents.filter((agent) => agent?.state === "done" || agent?.state === "failed").length;
  const live = agents.some((agent) => agent?.state === "running");
  const waiting = agents.some((agent) => agent?.state === "queued");
  if (agents.length && !live && waiting) return { text: "Waiting for a free agent", icon: "clock" };
  return { text: agents.length ? `${done} of ${agents.length} agent${agents.length === 1 ? "" : "s"} done` : "Starting", icon: "sync~spin" };
}

function statusOf(state: RunningState, run: RunningRecord["run"]): { text: string; icon: string } {
  switch (state) {
    case "running":
      return progressOf(run);
    case "elsewhere":
      return { text: "In another window", icon: "window" };
    case "queued":
      return { text: "Queued", icon: "clock" };
    case "waiting":
      return { text: "Starting soon", icon: "clock" };
    default: {
      const never: never = state;
      return never;
    }
  }
}

/** The pull requests the agents are reviewing now or about to, the longest running first. */
export function runningRows(records: readonly RunningRecord[], now = Date.now()): RunningRow[] {
  return records
    .flatMap((record) => {
      const state = record.run.state;
      return isRunning(state) ? [{ record, state }] : [];
    })
    .sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state) || (a.record.run.startedAt ?? now) - (b.record.run.startedAt ?? now))
    .map(({ record, state }) => {
      const { owner, name, number } = record.key;
      const key = `${owner}/${name}#${number}`;
      const title = record.summary?.title || key;
      const status = statusOf(state, record.run);
      const since = state !== "waiting" && record.run.startedAt ? elapsed(now - record.run.startedAt) : "";
      return {
        id: key.toLowerCase(),
        key,
        label: title,
        description: [`#${number}`, name, status.text, since].filter(Boolean).join(" · "),
        tooltip: `${key}\n${title}\n${status.text}${since ? ` for ${since}` : ""}. Click to open its review.`,
        icon: status.icon,
      };
    });
}

interface TreeItemLike {
  id?: string;
  description?: string;
  tooltip?: string;
  iconPath?: unknown;
  contextValue?: string;
  command?: { command: string; title: string; arguments?: unknown[] };
}

/** The slice of the `vscode` API Running Reviews uses. */
export interface RunningVscode {
  window: { createTreeView(id: string, options: { treeDataProvider: object }): { description?: string; dispose(): unknown } };
  EventEmitter: new () => { event: unknown; fire(): void; dispose(): unknown };
  TreeItem: new (label: string, collapsibleState: number) => TreeItemLike;
  TreeItemCollapsibleState: { None: number };
  ThemeIcon: new (id: string) => unknown;
}

export interface RunningViewDeps {
  vscode: RunningVscode;
  records(): readonly RunningRecord[];
  onChange(listener: () => void): void;
  subscriptions: { push(...items: Array<{ dispose(): unknown }>): unknown };
  now?: () => number;
}

const TICK_MS = 30_000;

/**
 * Draws Running Reviews and keeps it current. It redraws when a run changes, and every 30 seconds while one is
 * running so the elapsed time moves.
 */
export function bindRunningView(deps: RunningViewDeps): void {
  const { vscode } = deps;
  const now = deps.now ?? Date.now;
  const changed = new vscode.EventEmitter();
  let rows: RunningRow[] = [];
  let drawn = "";
  let timer: ReturnType<typeof setInterval> | undefined;
  const view = vscode.window.createTreeView("xrayviewer.running", {
    treeDataProvider: {
      onDidChangeTreeData: changed.event,
      getChildren: () => rows,
      getTreeItem(row: RunningRow) {
        const item = new vscode.TreeItem(row.label, vscode.TreeItemCollapsibleState.None);
        item.id = row.id;
        item.description = row.description;
        item.tooltip = row.tooltip;
        item.iconPath = new vscode.ThemeIcon(row.icon);
        item.contextValue = "running";
        item.command = { command: "xrayviewer.open", title: "Open Review", arguments: [row.key] };
        return item;
      },
    },
  });
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
  };
  const refresh = () => {
    rows = runningRows(deps.records(), now());
    if (rows.length && !timer) timer = setInterval(refresh, TICK_MS);
    if (!rows.length) stop();
    const next = JSON.stringify(rows);
    if (next === drawn) return;
    drawn = next;
    view.description = rows.length ? String(rows.length) : "";
    changed.fire();
  };
  deps.onChange(refresh);
  refresh();
  deps.subscriptions.push(view, changed, { dispose: stop });
}
