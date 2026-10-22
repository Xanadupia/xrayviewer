/**
 * What each agent is doing while it runs, read from its CLI's JSON event stream: what it says, the commands it runs,
 * the files it reads and the searches it makes. The review page shows these steps under each agent.
 */

export type StepKind = "message" | "thinking" | "command" | "read" | "search" | "tool";
export type StepState = "running" | "done" | "failed";

export interface Step {
  id: string;
  kind: StepKind;
  /** The message, the command, the file, the pattern, or what the tool did. */
  title: string;
  /** A command's output or a tool's error, shortened. */
  detail?: string;
  state: StepState;
  startedAt: number;
  ms?: number;
  /** Inside Claude Code's forked /code-review run. */
  sub?: boolean;
}

export interface AgentActivity {
  steps: Step[];
  /** Earlier steps left out to keep the page light. */
  dropped: number;
}

export type Feed = (chunk: string) => void;

const MAX_STEPS = 200;
const MAX_TITLE = 400;
const MAX_MESSAGE = 3000;
const MAX_DETAIL = 800;

type Event = Record<string, any>;

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function tail(text: string, max: number): string {
  return text.length > max ? `…${text.slice(text.length - max + 1)}` : text;
}

class AgentLog {
  readonly steps: Step[] = [];
  dropped = 0;
  private seq = 0;
  private readonly byKey = new Map<string, Step>();
  private readonly roots: string[];
  private readonly changed: () => void;
  private readonly now: () => number;

  constructor(roots: string[], changed: () => void, now: () => number) {
    this.roots = roots;
    this.changed = changed;
    this.now = now;
  }

  /** Repository and run-folder paths read as relative paths. */
  short(text: string): string {
    return this.roots.reduce((out, root) => out.split(`${root}/`).join(""), text);
  }

  /** " in <folder>" for a search, left out when the folder is the checkout or the run folder itself. */
  where(folder: unknown): string {
    if (typeof folder !== "string" || !folder || this.roots.includes(folder.replace(/\/+$/, ""))) return "";
    return ` in ${this.short(folder)}`;
  }

  add(kind: StepKind, title: string, options: { key?: string; state?: StepState; detail?: string; sub?: boolean } = {}): Step | null {
    const text = this.short(title).trim();
    if (!text) return null;
    const step: Step = {
      id: `s${++this.seq}`,
      kind,
      title: clip(text, kind === "message" || kind === "thinking" ? MAX_MESSAGE : MAX_TITLE),
      state: options.state ?? "running",
      startedAt: this.now(),
      ...(options.detail ? { detail: tail(this.short(options.detail).trim(), MAX_DETAIL) } : {}),
      ...(options.sub ? { sub: true } : {}),
    };
    if (step.state !== "running") step.ms = 0;
    this.steps.push(step);
    if (options.key) this.byKey.set(options.key, step);
    if (this.steps.length > MAX_STEPS) {
      this.dropped += this.steps.length - MAX_STEPS;
      this.steps.splice(0, this.steps.length - MAX_STEPS);
    }
    this.changed();
    return step;
  }

  /** Adds to the last step when it's the same kind of text still coming in, else starts a step. */
  append(kind: "message" | "thinking", text: string, sub = false): void {
    const last = this.steps[this.steps.length - 1];
    if (last && last.kind === kind && last.state === "running" && !!last.sub === sub) {
      last.title = clip(last.title + this.short(text), MAX_MESSAGE);
      this.changed();
    } else if (text.trim()) {
      this.add(kind, text, { sub });
    }
  }

  settle(kind: "message" | "thinking"): void {
    const last = this.steps[this.steps.length - 1];
    if (last && last.kind === kind && last.state === "running") this.end(last, "done");
  }

  finish(key: string, state: StepState, detail?: string): void {
    const step = this.byKey.get(key);
    if (!step) return;
    this.byKey.delete(key);
    if (detail?.trim()) step.detail = (step.kind === "command" ? tail : clip)(this.short(detail).trim(), MAX_DETAIL);
    this.end(step, state);
  }

  end(step: Step, state: StepState): void {
    step.state = state;
    step.ms = Math.max(0, this.now() - step.startedAt);
    this.changed();
  }

  /** Messages and thoughts end when the next step starts; anything still open ends with the run. */
  settleAll(): void {
    for (const step of this.steps) if (step.state === "running") this.end(step, "done");
    this.byKey.clear();
  }

  settleText(): void {
    this.settle("message");
    this.settle("thinking");
  }
}

function parseEvent(line: string): Event | null {
  if (!line.trim()) return null;
  try {
    const value: unknown = JSON.parse(line);
    return value && typeof value === "object" ? (value as Event) : null;
  } catch {
    return null;
  }
}

function looksLikeJsonAnswer(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => (typeof part?.text === "string" ? part.text : "")).join("\n");
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Claude Code's `--output-format stream-json --verbose`, including a forked slash command's events. */
function claudeParser(log: AgentLog) {
  const kinds = new Map<string, StepKind>();
  let forked = false;
  return (event: Event) => {
    const sub = !!event.parent_tool_use_id;
    forked ||= sub;
    if (event.type === "assistant") {
      for (const part of event.message?.content ?? []) {
        if (part?.type === "text" && typeof part.text === "string") {
          log.settle("thinking");
          if (looksLikeJsonAnswer(part.text)) log.add("tool", "Wrote its answer", { state: "done", sub });
          else log.add("message", part.text, { state: "done", sub });
        } else if (part?.type === "thinking" && typeof part.thinking === "string" && part.thinking.trim()) {
          log.add("thinking", part.thinking, { state: "done", sub });
        } else if (part?.type === "tool_use") {
          const step = claudeTool(log, part.name, part.input ?? {});
          if (!step) continue;
          kinds.set(part.id, step.kind);
          log.add(step.kind, step.title, { key: step.done ? undefined : part.id, sub, state: step.done ? "done" : "running" });
        }
      }
    } else if (event.type === "user" && Array.isArray(event.message?.content)) {
      for (const part of event.message.content) {
        if (part?.type !== "tool_result" || typeof part.tool_use_id !== "string") continue;
        const kind = kinds.get(part.tool_use_id);
        const failed = part.is_error === true;
        log.finish(part.tool_use_id, failed ? "failed" : "done", failed || kind === "command" || kind === "tool" ? resultText(part.content) : undefined);
      }
    } else if (event.type === "result") {
      if (forked && typeof event.result === "string" && !looksLikeJsonAnswer(event.result)) log.add("message", event.result, { state: "done" });
      log.settleAll();
    }
  };
}

function claudeTool(log: AgentLog, name: string, input: Record<string, any>): { kind: StepKind; title: string; done?: boolean } | null {
  switch (name) {
    case "Bash":
      return { kind: "command", title: String(input.command ?? "") };
    case "Read":
      return { kind: "read", title: String(input.file_path ?? input.path ?? "") };
    case "Grep":
    case "Glob":
      return { kind: "search", title: `${input.pattern ?? ""}${log.where(input.path)}` };
    case "StructuredOutput":
      return { kind: "tool", title: "Wrote its answer", done: true };
    case "Skill":
      return { kind: "tool", title: `Ran /${input.skill ?? input.name ?? "a skill"}` };
    case "ReportFindings":
      return { kind: "tool", title: `Reported ${plural(Array.isArray(input.findings) ? input.findings.length : 0, "finding")}`, done: true };
    case "ToolSearch":
      return null;
    default:
      return { kind: "tool", title: name };
  }
}

/** `zsh -lc "…"` and `bash -lc '…'` read as the command inside. */
export function unwrapShell(command: string): string {
  const wrapped = /^\S*\/?(?:ba|z)?sh\s+-l?c\s+(["'])([\s\S]*)\1\s*$/.exec(command.trim());
  if (!wrapped) return command;
  return wrapped[1] === '"' ? wrapped[2].replace(/\\(["\\$`])/g, "$1") : wrapped[2];
}

/** Codex's `exec --json` items. */
function codexParser(log: AgentLog) {
  return (event: Event) => {
    const item = event.item;
    if (event.type === "item.started" || event.type === "item.updated" || event.type === "item.completed") {
      if (!item?.id) return;
      const done = event.type === "item.completed";
      switch (item.type) {
        case "agent_message":
          if (done && typeof item.text === "string") {
            if (looksLikeJsonAnswer(item.text)) log.add("tool", "Wrote its answer", { state: "done" });
            else log.add("message", item.text, { state: "done" });
          }
          return;
        case "reasoning":
          if (done && typeof item.text === "string") log.add("thinking", item.text, { state: "done" });
          return;
        case "command_execution":
          if (event.type === "item.started") log.add("command", unwrapShell(String(item.command ?? "")), { key: item.id });
          else if (done) log.finish(item.id, item.exit_code === 0 ? "done" : "failed", String(item.aggregated_output ?? ""));
          return;
        case "web_search":
          if (done) log.add("search", String(item.query ?? "the web"), { state: "done" });
          return;
        case "mcp_tool_call":
          if (done) log.add("tool", `${item.server ?? ""}${item.server ? "." : ""}${item.tool ?? "tool"}`, { state: item.status === "failed" ? "failed" : "done" });
          return;
        case "error":
          log.add("tool", String(item.message ?? "Error"), { state: "failed" });
          return;
        default:
          return;
      }
    }
    if (event.type === "turn.failed" || event.type === "error") {
      log.add("tool", String(event.error?.message ?? event.message ?? "The run failed"), { state: "failed" });
    }
    if (event.type === "turn.completed" || event.type === "turn.failed") log.settleAll();
  };
}

function cursorTool(log: AgentLog, call: Record<string, any>): { kind: StepKind; title: string; result: any } | null {
  const [name, body] = Object.entries(call).find(([key]) => key.endsWith("ToolCall")) ?? [];
  if (!name || !body) return null;
  const args = body.args ?? {};
  const kind: StepKind =
    name === "shellToolCall" ? "command" : name === "readToolCall" || name === "lsToolCall" ? "read" : name === "grepToolCall" || name === "globToolCall" ? "search" : "tool";
  const title =
    kind === "command"
      ? String(args.command ?? "")
      : kind === "read"
        ? String(args.path ?? args.targetDirectory ?? "")
        : name === "grepToolCall"
          ? `${args.pattern ?? ""}${log.where(args.path)}`
          : name === "globToolCall"
            ? `${args.globPattern ?? ""}${log.where(args.targetDirectory)}`
            : name.replace(/ToolCall$/, "");
  return { kind, title, result: body.result };
}

/** Cursor Agent's `--output-format stream-json`. */
function cursorParser(log: AgentLog) {
  return (event: Event) => {
    if (event.type === "thinking") {
      if (event.subtype === "delta" && typeof event.text === "string") log.append("thinking", event.text);
      else if (event.subtype === "completed") log.settle("thinking");
    } else if (event.type === "assistant") {
      log.settle("thinking");
      const text = resultText(event.message?.content);
      if (looksLikeJsonAnswer(text)) {
        log.settle("message");
        log.add("tool", "Wrote its answer", { state: "done" });
      } else {
        log.append("message", text);
      }
    } else if (event.type === "tool_call" && typeof event.call_id === "string") {
      log.settleText();
      const tool = cursorTool(log, event.tool_call ?? {});
      if (!tool) return;
      if (event.subtype === "started") log.add(tool.kind, tool.title, { key: event.call_id });
      else if (event.subtype === "completed") {
        const error = tool.result?.error ?? tool.result?.failure;
        const output = tool.kind === "command" ? tool.result?.success?.stdout ?? tool.result?.success?.output : undefined;
        log.finish(event.call_id, error ? "failed" : "done", error ? JSON.stringify(error) : typeof output === "string" ? output : undefined);
      }
    } else if (event.type === "result") {
      log.settleAll();
    }
  };
}

function parserFor(harness: string, log: AgentLog): (event: Event) => void {
  switch (harness) {
    case "claude":
      return claudeParser(log);
    case "codex":
      return codexParser(log);
    case "cursor":
      return cursorParser(log);
    default:
      return () => {};
  }
}

export interface AgentHandle {
  /** A stdout listener for one run of `harness`'s CLI. One agent can run its CLI more than once. */
  stream(harness: string): Feed;
}

/**
 * One log per review run. `onChange` runs at most once per `throttleMs`, so a busy agent doesn't redraw the page on
 * every event.
 */
export function createActivityLog(roots: string[], onChange: () => void, throttleMs = 750, now: () => number = Date.now) {
  const agents = new Map<string, AgentLog>();
  const sorted = [...new Set(roots.filter(Boolean))].sort((a, b) => b.length - a.length);
  let timer: ReturnType<typeof setTimeout> | null = null;
  const changed = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      onChange();
    }, throttleMs);
    timer.unref?.();
  };
  const logFor = (id: string) => {
    let log = agents.get(id);
    if (!log) agents.set(id, (log = new AgentLog(sorted, changed, now)));
    return log;
  };
  return {
    agent(id: string): AgentHandle {
      return {
        stream(harness: string): Feed {
          const log = logFor(id);
          const parse = parserFor(harness, log);
          let buffer = "";
          return (chunk: string) => {
            buffer += chunk;
            for (let end = buffer.indexOf("\n"); end !== -1; end = buffer.indexOf("\n")) {
              const event = parseEvent(buffer.slice(0, end));
              buffer = buffer.slice(end + 1);
              if (event) parse(event);
            }
          };
        },
      };
    },
    snapshot(): Record<string, AgentActivity> {
      return Object.fromEntries([...agents].map(([id, log]) => [id, { steps: log.steps.map((step) => ({ ...step })), dropped: log.dropped }]));
    },
  };
}
