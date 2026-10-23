import { readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { claudeEffort } from "./claude-models.ts";
import type { AgentRequest, AgentResult, BundleInternals, Tokens } from "./cursor-harness.ts";
import { addTokens, withEarlierUsage } from "./reply-fix.ts";
import type { PlannedAgent } from "./run-confirm.ts";

/** The agent that runs Claude Code's /code-review once in place of the reviewer agents on Claude Code. */
export const CODE_REVIEW_ID = "claude-code-review";
export const CODE_REVIEW_NAME = "Code review agent";

/** /code-review's ReportFindings tool takes at most 32 findings. */
const MAX_FINDINGS = 32;
const LEVELS = ["low", "medium", "high", "xhigh", "max"];
const GIT_READS = ["diff", "log", "show", "blame", "merge-base", "rev-parse", "ls-files"];

export interface ReviewAgent {
  name: string;
  focus: string;
  enabled: boolean;
  maxFindings: number;
  minConfidence: string;
  skip: string[];
  runsWhen: string[];
  harness: string;
  model: string;
  instructions: string;
  /** `agents`: the replaced agents whose instructions the run that shapes the report also checks. */
  codeReview?: { args: string; agents?: string[] };
}

export interface ReviewSettings {
  agents: Record<string, ReviewAgent>;
  [key: string]: unknown;
}

export interface Selection {
  run: string[];
  /** `by`: the agent that reviews in a skipped agent's place. */
  skipped: Array<{ id: string; why: string; by?: string }>;
}

export interface ClaudeConfig {
  id: "claude";
  command: string;
  model: string;
  extraArgs: string[];
}

export type CodeReviewRequest = AgentRequest & { codeReview: { args: string } };

const shortName = (name: string) => name.replace(/\s+agent$/i, "").trim() || name;

function listNames(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
}

/** The skill's level follows the Claude Code effort setting; anything else leaves the skill's own default. */
export function codeReviewLevel(extraArgs: readonly string[]): string {
  const effort = claudeEffort(extraArgs);
  return LEVELS.includes(effort) ? effort : "";
}

export const CODE_REVIEW_INSTRUCTIONS = `Claude Code's /code-review has already reviewed this pull request. Its report is at the end of this prompt. It reviewed in place of the agents whose instructions follow.

Return every finding it reported, in the shape below, with \`agent\` set to "${CODE_REVIEW_ID}". Leave one out only when no line this pull request changes shows it. For each finding, read the code at its file and line so that \`match\`, \`steps\` and \`fix\` point at the right lines, and rate its severity from the failure it describes.

Then check the pull request against each agent's instructions below. Add a finding for a problem they describe that the report missed, with \`agent\` set to that agent's id, only when you confirm it by reading the code. Keep to each agent's limit, confidence and skipped files. Leave out anything the report already has.

Put what the report says was checked and found fine, and what you checked for the agents, in \`checked\`. When the report has no findings and you confirm none, return none.`;

const CONFIDENCE_RULES: Record<string, string> = {
  high: 'Only "High confidence" findings.',
  "worth-asking": 'No "Minor" findings.',
};

/** One replaced agent's instructions, with its headings a level down so they sit under the agent's own heading. */
function agentBrief(id: string, agent: ReviewAgent): string {
  const rules = [
    agent.focus && `Focus: ${agent.focus}.`,
    `At most ${agent.maxFindings} ${agent.maxFindings === 1 ? "finding" : "findings"}.`,
    CONFIDENCE_RULES[agent.minConfidence] ?? "",
    agent.skip.length ? `Skip files matching ${agent.skip.map((glob) => `\`${glob}\``).join(", ")}.` : "",
  ].filter(Boolean);
  const instructions = agent.instructions.trim().replace(/^(#{1,5}) /gm, "#$1 ");
  return [`## ${agent.name} (\`agent\`: "${id}")`, rules.join(" "), instructions].filter(Boolean).join("\n\n");
}

/**
 * Replaces the selected reviewer agents that run on Claude Code with one agent that runs /code-review over `range`.
 * The run that shapes the report also checks each replaced agent's instructions, so it may return the report's
 * findings plus up to each agent's own limit. The guide keeps its own prompt. Without a range, or when agents.yml
 * already uses the agent's id, nothing changes.
 */
export function planCodeReview(
  selection: Selection,
  settings: ReviewSettings,
  harnessOf: (id: string) => string,
  guideId: string,
  claude: { extraArgs?: readonly string[] } | undefined,
  range: string | null,
): Selection & { settings: ReviewSettings } {
  const replaced = selection.run.filter((id) => id !== guideId && harnessOf(id) === "claude");
  if (!replaced.length || !range || settings.agents[CODE_REVIEW_ID]) return { ...selection, settings };
  const agents = replaced.map((id) => settings.agents[id]);
  const limits = agents.reduce((sum, agent) => sum + agent.maxFindings, 0);
  const reported = Math.min(MAX_FINDINGS, limits);
  const level = codeReviewLevel(claude?.extraArgs ?? []);
  const agent: ReviewAgent = {
    name: CODE_REVIEW_NAME,
    focus: `Claude Code's /code-review, run once for the ${listNames(agents.map((a) => shortName(a.name)))} ${agents.length > 1 ? "agents" : "agent"}`,
    enabled: true,
    maxFindings: reported + limits,
    minConfidence: "minor",
    skip: [],
    runsWhen: [],
    harness: "claude",
    model: agents[0].model,
    instructions: [CODE_REVIEW_INSTRUCTIONS, ...replaced.map((id) => agentBrief(id, settings.agents[id]))].join("\n\n"),
    codeReview: { args: [level, range, "--max-findings", String(reported)].filter(Boolean).join(" "), agents: replaced },
  };
  return {
    run: [...selection.run.filter((id) => !replaced.includes(id)), CODE_REVIEW_ID],
    skipped: [
      ...selection.skipped,
      ...replaced.map((id) => ({ id, why: "Claude Code's /code-review reviews in its place, with this agent's instructions", by: CODE_REVIEW_ID })),
    ],
    settings: { ...settings, agents: { ...settings.agents, [CODE_REVIEW_ID]: agent } },
  };
}

/** The same replacement for the review page's model line, which lists what runs next. */
export function plannedWithCodeReview(planned: PlannedAgent[], guideId: string): PlannedAgent[] {
  const replaced = planned.filter((agent) => agent.id !== guideId && agent.harness === "claude");
  if (!replaced.length || planned.some((agent) => agent.id === CODE_REVIEW_ID)) return planned;
  const first = replaced[0];
  return [
    ...planned.filter((agent) => !replaced.includes(agent)),
    { ...first, id: CODE_REVIEW_ID, name: CODE_REVIEW_NAME, short: shortName(CODE_REVIEW_NAME) },
  ];
}

interface ObjectSchema {
  type: "object";
  properties: Record<string, any>;
  required: string[];
  [key: string]: unknown;
}

const briefedAgents = (settings: ReviewSettings, id: string) => settings.agents[id]?.codeReview?.agents ?? [];

/** The bundle's reviewer schema, with an `agent` on each finding when the agent checks replaced agents' instructions. */
export function findingSchema(id: string, settings: ReviewSettings, schema: ObjectSchema): ObjectSchema {
  const briefed = briefedAgents(settings, id);
  if (!briefed.length) return schema;
  const finding: ObjectSchema = schema.properties.findings.items;
  const tagged: ObjectSchema = {
    ...finding,
    properties: { agent: { type: "string", enum: [id, ...briefed] }, ...finding.properties },
    required: ["agent", ...finding.required],
  };
  return { ...schema, properties: { ...schema.properties, findings: { ...schema.properties.findings, items: tagged } } };
}

export interface ReviewOutput {
  findings?: Array<{ agent?: string; path: string; title: string; [key: string]: unknown }>;
  checked?: unknown[];
}

/**
 * Splits the shaped report by each finding's `agent`, so a finding added for a replaced agent's instructions shows
 * under that agent and keeps to its limit, confidence and skipped files. `convert` is the bundle's own conversion.
 */
export function codeReviewResults<R>(
  id: string,
  output: ReviewOutput,
  settings: ReviewSettings,
  convert: (id: string, output: ReviewOutput) => R,
  skips: (id: string, path: string) => boolean,
  problems: { dropped: string[] },
): Array<[string, R]> {
  const briefed = briefedAgents(settings, id);
  if (!briefed.length) return [[id, convert(id, output)]];
  const findings = output.findings ?? [];
  const added = (agent: string) =>
    findings.filter((finding) => {
      if (finding.agent !== agent) return false;
      if (!skips(agent, finding.path)) return true;
      problems.dropped.push(`${agent}: "${finding.title}" is in a file on its skip list (${finding.path})`);
      return false;
    });
  return [
    [id, convert(id, { ...output, findings: findings.filter((finding) => !briefed.includes(finding.agent ?? "")) })],
    ...briefed.map((agent): [string, R] => [agent, convert(agent, { findings: added(agent), checked: [] })]),
  ];
}

/** Where a worktree's objects live: `.git` there is a file naming the clone's per-worktree folder. */
export function gitCommonDir(checkout: string): string | null {
  let gitDir: string;
  try {
    const pointer = /^gitdir:\s*(.+)$/m.exec(readFileSync(path.join(checkout, ".git"), "utf8"));
    if (!pointer) return null;
    gitDir = path.resolve(checkout, pointer[1].trim());
  } catch {
    return null;
  }
  try {
    return path.resolve(gitDir, readFileSync(path.join(gitDir, "commondir"), "utf8").trim());
  } catch {
    return gitDir;
  }
}

export function withRealPaths(dirs: string[]): string[] {
  const real = dirs.map((dir) => {
    try {
      return realpathSync(dir);
    } catch {
      return dir;
    }
  });
  return [...new Set([...dirs, ...real])];
}

/**
 * Claude Code settings for the /code-review run. Bash is on so the skill can read the diff with git, inside a sandbox
 * that writes nowhere and reads nothing in the home folder except the checkout, the run folder and the clone's git
 * objects. Git then can't read ~/.gitconfig, so it runs without a global config.
 */
export function codeReviewSettings(cwd: string, readDirs: string[], home: string = homedir()) {
  const common = gitCommonDir(cwd);
  const visible = withRealPaths([cwd, ...readDirs, ...(common ? [common] : [])].map((dir) => path.resolve(dir)));
  return {
    disableAllHooks: true,
    env: { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
    sandbox: {
      enabled: true,
      autoAllowBashIfSandboxed: false,
      allowUnsandboxedCommands: false,
      filesystem: { denyWrite: [home, ...visible], denyRead: [home], allowRead: visible },
    },
  };
}

/**
 * The /code-review run, with no JSON schema: given one, the skill's forked review can answer through the schema's tool
 * and hand back an empty report. The command comes right after `-p` because the tool flags take every value after them.
 * `--setting-sources user` keeps the pull request's own .claude commands and skills from loading.
 */
export function codeReviewArgs(config: ClaudeConfig, request: CodeReviewRequest, home: string = homedir()): string[] {
  const readDirs = request.readDirs ?? [];
  const model = request.model || config.model;
  return [
    "-p",
    `/code-review ${request.codeReview.args}`,
    "--output-format",
    "stream-json",
    "--verbose",
    "--no-session-persistence",
    "--permission-mode",
    "dontAsk",
    "--strict-mcp-config",
    "--mcp-config",
    '{"mcpServers":{}}',
    "--setting-sources",
    "user",
    "--settings",
    JSON.stringify(codeReviewSettings(request.cwd, readDirs, home)),
    "--tools",
    "Read",
    "Grep",
    "Glob",
    "Bash",
    "--allowedTools",
    ...[request.cwd, ...readDirs].map((dir) => `Read(/${path.resolve(dir)}/**)`),
    ...GIT_READS.map((command) => `Bash(git ${command}:*)`),
    ...readDirs.flatMap((dir) => ["--add-dir", dir]),
    ...(model ? ["--model", model] : []),
    ...config.extraArgs,
  ];
}

export interface CodeReviewReport {
  report: string;
  result: { text: string; subtype: string; isError: boolean } | null;
  costUsd: number | null;
  tokens: Tokens | null;
  model: string | null;
}

function parseEvent(line: string): Record<string, any> | null {
  if (!line.trim()) return null;
  try {
    const value: unknown = JSON.parse(line);
    return value && typeof value === "object" ? (value as Record<string, any>) : null;
  } catch {
    return null;
  }
}

/** A slash command's forked run leaves the result's `usage` at zero; `modelUsage` has each model's real counts. */
function toTokens(modelUsage: Record<string, Record<string, unknown>> | undefined): Tokens | null {
  const models = Object.values(modelUsage ?? {});
  if (!models.length) return null;
  const n = (value: unknown) => (typeof value === "number" ? value : 0);
  return models.reduce<Tokens>(
    (sum, u) => ({
      input: sum.input + n(u.inputTokens) + n(u.cacheCreationInputTokens) + n(u.cacheReadInputTokens),
      cachedInput: sum.cachedInput + n(u.cacheReadInputTokens),
      output: sum.output + n(u.outputTokens),
    }),
    { input: 0, cachedInput: 0, output: 0 },
  );
}

/**
 * Reads the /code-review stream. The report is the run's final text, plus what the skill passed to its ReportFindings
 * tool, whose findings don't always come back as text.
 */
export function readCodeReview(stdout: string): CodeReviewReport {
  const summary: CodeReviewReport = { report: "", result: null, costUsd: null, tokens: null, model: null };
  let reported: unknown = null;
  for (const line of stdout.split("\n")) {
    const event = parseEvent(line);
    if (event?.type === "assistant") {
      for (const part of event.message?.content ?? []) {
        if (part?.type === "tool_use" && part.name === "ReportFindings") reported = part.input;
      }
    } else if (event?.type === "result") {
      summary.result = { text: typeof event.result === "string" ? event.result : "", subtype: String(event.subtype ?? ""), isError: event.is_error === true };
      summary.costUsd = typeof event.total_cost_usd === "number" ? event.total_cost_usd : null;
      summary.tokens = toTokens(event.modelUsage);
      summary.model = Object.keys(event.modelUsage ?? {})[0] ?? null;
    }
  }
  const text = summary.result?.text.trim() ?? "";
  summary.report = [text, reported ? `Findings it reported, as JSON:\n\n${JSON.stringify(reported, null, 1)}` : ""].filter(Boolean).join("\n\n");
  return summary;
}

/**
 * The `result` event of Claude Code's `stream-json` output, which carries what `--output-format json` prints. Output
 * without one is parsed as a whole, so it throws the same way a bad `json` reply did.
 */
export function claudeResult(stdout: string): unknown {
  const lines = stdout.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const event = parseEvent(lines[i]);
    if (event?.type === "result") return event;
  }
  return JSON.parse(stdout);
}

export function withReport(prompt: string, report: string): string {
  return `${prompt}\n\n## What Claude Code's /code-review reported\n\n${report}\n`;
}

/**
 * Runs /code-review, then hands its report to the bundle's own Claude Code runner, which turns it into X-RayViewer's
 * findings with its usual read-only tools and JSON schema. Cost, tokens and time cover both runs.
 */
export async function runCodeReview(
  internals: BundleInternals,
  config: ClaudeConfig,
  request: CodeReviewRequest,
  runClaude: (config: ClaudeConfig, request: AgentRequest) => Promise<AgentResult>,
): Promise<AgentResult> {
  const { HarnessError } = internals;
  const started = Date.now();
  const run = await internals.run(config.command, codeReviewArgs(config, request), {
    cwd: request.cwd,
    env: internals.baseEnv(),
    timeoutMs: request.timeoutMs,
    signal: request.signal,
    onStdout: request.activity?.stream("claude"),
    onStderr: (chunk) => request.onLog?.(chunk.trimEnd()),
  });
  if (run.killed) {
    throw request.signal?.aborted
      ? new HarnessError("cancelled", "Stopped.")
      : new HarnessError("timeout", "Claude Code's /code-review took too long and was stopped.");
  }
  const review = readCodeReview(run.stdout);
  if (!review.result) throw internals.classifyFailure(run.stderr || run.stdout || `exit code ${run.code}`, run.code, "Claude Code");
  if (review.result.isError || review.result.subtype !== "success") {
    const text = review.result.text || review.result.subtype || "error";
    throw /login|auth|api key|credit|billing/i.test(text)
      ? new HarnessError("auth", `Claude Code: ${text}`)
      : new HarnessError("failed", `Claude Code's /code-review: ${text.slice(0, 300)}`, internals.tail(run.stderr));
  }
  if (!review.report) throw new HarnessError("badOutput", "Claude Code's /code-review didn't report anything.", internals.tail(run.stdout));
  request.onLog?.(`Claude Code's /code-review reported:\n${review.report}`);

  const remaining = request.timeoutMs === undefined ? undefined : Math.max(1, request.timeoutMs - (Date.now() - started));
  const converted = await runClaude(config, { ...request, prompt: withReport(request.prompt, review.report), timeoutMs: remaining }).catch((error: unknown) => {
    throw withEarlierUsage(error, review);
  });
  return {
    output: converted.output,
    costUsd: review.costUsd === null && converted.costUsd === null ? null : (review.costUsd ?? 0) + (converted.costUsd ?? 0),
    tokens: addTokens(review.tokens, converted.tokens),
    model: converted.model ?? review.model,
    durationMs: Date.now() - started,
  };
}
