export interface RunningRecord {
  key: { owner: string; name: string; number: number };
  summary?: { title?: string } | null;
  run: {
    state: string;
    startedAt?: number;
    progress?: { agents?: Record<string, { state?: string } | null | undefined> } | null;
  };
}

/** A review page that is open. It leaves this list when its tab closes. */
export interface OpenReview {
  key: string;
  title?: string;
  name: string;
  number: number;
}

/** A run kept after it finishes, until Ongoing Reviews is refreshed or X-RayViewer reloads. */
export interface HeldReview {
  key: string;
  title: string;
  name: string;
  number: number;
}

/** A row in Ongoing Reviews. `key` is what `xrayviewer.open` takes. */
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

function keyOf(record: RunningRecord): string {
  const { owner, name, number } = record.key;
  return `${owner}/${name}#${number}`;
}

function finishedOf(state: string): { text: string; icon: string } {
  switch (state) {
    case "failed":
      return { text: "Failed", icon: "error" };
    case "cancelled":
      return { text: "Cancelled", icon: "circle-slash" };
    case "held":
      return { text: "Paused", icon: "debug-pause" };
    default:
      return { text: "Finished", icon: "pass" };
  }
}

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

interface Listed {
  id: string;
  key: string;
  title: string;
  name: string;
  number: number;
  rank: number;
  startedAt: number;
  status: { text: string; icon: string };
  since: string;
}

/** Runs in progress, runs kept until a refresh, and review pages that are open. The longest running comes first. */
export function ongoingRows(records: readonly RunningRecord[], open: readonly OpenReview[], held: ReadonlyMap<string, HeldReview>, now = Date.now()): RunningRow[] {
  const byId = new Map(records.map((record) => [keyOf(record).toLowerCase(), record]));
  const openById = new Map(open.map((tab) => [tab.key.toLowerCase(), tab]));
  const ids = new Set<string>([...held.keys(), ...openById.keys()]);
  for (const [id, record] of byId) if (isRunning(record.run.state)) ids.add(id);

  const listed: Listed[] = [];
  for (const id of ids) {
    const record = byId.get(id);
    const tab = openById.get(id);
    const kept = held.get(id);
    const live = record && isRunning(record.run.state) ? record.run.state : undefined;
    if (live && record) {
      const status = statusOf(live, record.run);
      const since = live !== "waiting" && record.run.startedAt ? elapsed(now - record.run.startedAt) : "";
      listed.push({
        id,
        key: keyOf(record),
        title: record.summary?.title || keyOf(record),
        name: record.key.name,
        number: record.key.number,
        rank: ORDER.indexOf(live),
        startedAt: record.run.startedAt ?? now,
        status,
        since,
      });
      continue;
    }
    if (kept) {
      const status = finishedOf(record?.run.state ?? "");
      listed.push({
        id,
        key: kept.key,
        title: record?.summary?.title || kept.title,
        name: record?.key.name || kept.name,
        number: record?.key.number || kept.number,
        rank: ORDER.length,
        startedAt: record?.run.startedAt ?? 0,
        status,
        since: "",
      });
      continue;
    }
    if (tab) {
      listed.push({
        id,
        key: tab.key,
        title: tab.title || tab.key,
        name: tab.name,
        number: tab.number,
        rank: ORDER.length + 1,
        startedAt: 0,
        status: { text: "Open", icon: "open-preview" },
        since: "",
      });
    }
  }

  return listed
    .sort((a, b) => a.rank - b.rank || a.startedAt - b.startedAt || a.id.localeCompare(b.id))
    .map((row) => ({
      id: row.id,
      key: row.key,
      label: row.title,
      description: [`#${row.number}`, row.name, row.status.text, row.since].filter(Boolean).join(" · "),
      tooltip: `${row.key}\n${row.title}\n${row.status.text}${row.since ? ` for ${row.since}` : ""}. Click to open its review.`,
      icon: row.status.icon,
    }));
}

/** The pull requests the agents are reviewing now or about to, the longest running first. */
export function runningRows(records: readonly RunningRecord[], now = Date.now()): RunningRow[] {
  return ongoingRows(records, [], new Map(), now);
}

interface TreeItemLike {
  id?: string;
  description?: string;
  tooltip?: string;
  iconPath?: unknown;
  contextValue?: string;
  command?: { command: string; title: string; arguments?: unknown[] };
}

/** The slice of the `vscode` API Ongoing Reviews uses. */
export interface RunningVscode {
  window: { createTreeView(id: string, options: { treeDataProvider: object }): { description?: string; dispose(): unknown } };
  commands: { registerCommand(id: string, handler: () => void): { dispose(): unknown } };
  EventEmitter: new () => { event: unknown; fire(): void; dispose(): unknown };
  TreeItem: new (label: string, collapsibleState: number) => TreeItemLike;
  TreeItemCollapsibleState: { None: number };
  ThemeIcon: new (id: string) => unknown;
}

export interface RunningViewDeps {
  vscode: RunningVscode;
  records(): readonly RunningRecord[];
  onChange(listener: () => void): void;
  /** Review pages that are open. A page leaves the list when its tab closes, unless its run is still kept. */
  openReviews?: () => readonly OpenReview[];
  onOpenChange?: (listener: () => void) => void;
  subscriptions: { push(...items: Array<{ dispose(): unknown }>): unknown };
  now?: () => number;
}

const TICK_MS = 30_000;

/**
 * Draws Ongoing Reviews and keeps it current. A run stays after it finishes until Refresh or a reload. An open review
 * page stays until its tab closes. The list redraws when a run or a tab changes, and every 30 seconds while one is
 * running so the elapsed time moves.
 */
export function bindRunningView(deps: RunningViewDeps): void {
  const { vscode } = deps;
  const now = deps.now ?? Date.now;
  const changed = new vscode.EventEmitter();
  const held = new Map<string, HeldReview>();
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
  const remember = () => {
    for (const record of deps.records()) {
      if (!isRunning(record.run.state)) continue;
      const key = keyOf(record);
      held.set(key.toLowerCase(), { key, title: record.summary?.title || key, name: record.key.name, number: record.key.number });
    }
  };
  const refresh = () => {
    remember();
    rows = ongoingRows(deps.records(), deps.openReviews?.() ?? [], held, now());
    const live = deps.records().some((record) => isRunning(record.run.state));
    if (live && !timer) timer = setInterval(refresh, TICK_MS);
    if (!live) stop();
    const next = JSON.stringify(rows);
    if (next === drawn) return;
    drawn = next;
    view.description = rows.length ? String(rows.length) : "";
    changed.fire();
  };
  const releaseFinished = () => {
    for (const id of [...held.keys()]) {
      const record = deps.records().find((item) => keyOf(item).toLowerCase() === id);
      if (!record || !isRunning(record.run.state)) held.delete(id);
    }
    refresh();
  };
  const command = vscode.commands.registerCommand("xrayviewer.refreshOngoing", releaseFinished);
  deps.onChange(refresh);
  deps.onOpenChange?.(refresh);
  refresh();
  deps.subscriptions.push(view, changed, command, { dispose: stop });
}
