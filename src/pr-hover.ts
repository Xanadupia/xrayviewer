/** Where X-RayViewer's own review of a pull request stands, as the sidebar row and its hover card show it. */
export type ReviewTone = "active" | "paused" | "posted" | "unposted" | "stale" | "failed" | "none";

export type PrState = "open" | "draft" | "merged" | "closed";

export type RiskLevel = "low" | "medium" | "high";

export interface PrHover {
  title: string;
  /** `owner/name#number`. */
  ref: string;
  author?: string;
  /** The pull request this one builds on. */
  stackedOn?: number;
  /** Missing until GitHub's details arrive. */
  state?: PrState;
  /** How long ago it merged or closed, like "3 days ago". */
  stateWhen?: string;
  /** GitHub reviews, like "2 approvals" or "No approvals yet". */
  approvals?: string;
  /** The base branch it conflicts with. */
  conflictsWith?: string;
  checks?: { total: number; failed: number; running: number };
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  /** Lines about the viewer's own GitHub review. */
  yours?: readonly string[];
  risk?: { level: RiskLevel; score: number; factors: readonly string[] };
  review: { tone: ReviewTone; short: string; detail: string };
  /** Tokens and cost of the last finished run. */
  usage?: string;
  note?: string;
  error?: string;
}

const MUTED = "var(--vscode-list-deemphasizedForeground)";
const GREEN = "var(--vscode-charts-green)";
const RED = "var(--vscode-charts-red)";
const YELLOW = "var(--vscode-charts-yellow)";
const BLUE = "var(--vscode-charts-blue)";
const PURPLE = "var(--vscode-charts-purple)";

/** Text that renders as written inside markdown, HTML, a table cell and theme icon syntax. */
function plain(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\\`*_{}[\]()#+\-!~|$.]/g, "\\$&")
    .replace(/\s*\n\s*/g, " ");
}

function tint(color: string, markdown: string): string {
  return `<span style="color:${color};">${markdown}</span>`;
}

function icon(name: string, color?: string): string {
  return color ? tint(color, `$(${name})`) : `$(${name})`;
}

function muted(text: string): string {
  return tint(MUTED, plain(text));
}

const count = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string) => `${count(n)} ${one}${n === 1 ? "" : "s"}`;

function stateIcon(state: PrState): string {
  switch (state) {
    case "open":
      return icon("git-pull-request", GREEN);
    case "draft":
      return icon("git-pull-request-draft", MUTED);
    case "merged":
      return icon("git-merge", PURPLE);
    case "closed":
      return icon("git-pull-request-closed", RED);
    default: {
      const never: never = state;
      return never;
    }
  }
}

function stateWord(state: PrState, when: string | undefined): string {
  switch (state) {
    case "open":
      return "Open";
    case "draft":
      return "Draft";
    case "merged":
      return when ? `Merged ${when}` : "Merged";
    case "closed":
      return when ? `Closed ${when}` : "Closed";
    default: {
      const never: never = state;
      return never;
    }
  }
}

function reviewIcon(tone: ReviewTone): string {
  switch (tone) {
    case "active":
      return icon("loading~spin", BLUE);
    case "paused":
      return icon("debug-pause", YELLOW);
    case "posted":
      return icon("pass-filled", GREEN);
    case "unposted":
      return icon("pass", YELLOW);
    case "stale":
      return icon("history", YELLOW);
    case "failed":
      return icon("error", RED);
    case "none":
      return icon("circle-large-outline", MUTED);
    default: {
      const never: never = tone;
      return never;
    }
  }
}

function riskColor(level: RiskLevel): string | undefined {
  switch (level) {
    case "high":
      return RED;
    case "medium":
      return YELLOW;
    case "low":
      return undefined;
    default: {
      const never: never = level;
      return never;
    }
  }
}

const RISK_WORD: Record<RiskLevel, string> = { low: "Low", medium: "Medium", high: "High" };

function statusCell(h: PrHover & { state: PrState }): string {
  const open = h.state === "open" || h.state === "draft";
  const approvals = open && h.approvals ? ` · ${plain(h.approvals.replace(/^No approvals/, "no approvals"))}` : "";
  const first = `${stateIcon(h.state)} ${plain(stateWord(h.state, h.stateWhen))}${approvals}`;
  const notes: string[] = [];
  if (open && h.conflictsWith) notes.push(`${icon("warning", YELLOW)} ${plain(`Conflicts with ${h.conflictsWith}`)}`);
  const checks = h.checks;
  if (open && checks?.failed) notes.push(`${icon("error", RED)} ${plain(`${plural(checks.failed, "check")} failing`)}`);
  else if (open && checks?.running) notes.push(`${icon("clock", YELLOW)} ${plain(`${plural(checks.running, "check")} running`)}`);
  else if (open && checks?.total) notes.push(`${icon("check", GREEN)} ${checks.total === 1 ? "Check passed" : plain(`All ${count(checks.total)} checks passed`)}`);
  return [first, ...notes].join("<br>");
}

function reviewCell(h: PrHover): string {
  const detail = [h.review.detail, h.usage].filter(Boolean).join(" · ");
  return `${reviewIcon(h.review.tone)} ${plain(h.review.short)}${detail ? `<br>${muted(detail)}` : ""}`;
}

function riskCell(risk: NonNullable<PrHover["risk"]>): string {
  const color = riskColor(risk.level);
  const word = plain(`${RISK_WORD[risk.level]} · ${risk.score}/100`);
  const factors = risk.factors.slice(0, 3).join(" · ");
  return `${color ? tint(color, word) : word}${factors ? `<br>${muted(factors)}` : ""}`;
}

function sizeCell(h: PrHover): string {
  const files = h.changedFiles ?? 0;
  return `${tint(GREEN, plain(`+${count(h.additions ?? 0)}`))} ${tint(RED, plain(`−${count(h.deletions ?? 0)}`))} ${muted(`in ${plural(files, "file")}`)}`;
}

function yoursCell(lines: readonly string[]): string {
  return lines
    .map((line) => (line === "You haven't reviewed it yet." ? "Not yet" : line.replace(/^Your review: /, "")))
    .map((line) => plain(line.charAt(0).toUpperCase() + line.slice(1)))
    .join("<br>");
}

/** Hover table cells can't be top-aligned, so the label carries as many lines as its value to sit on the first. */
function labelCell(label: string, cell: string): string {
  return muted(label) + "<br>&nbsp;".repeat(cell.split("<br>").length - 1);
}

/** The sidebar row's hover card: title, then one labeled line per fact, each with its detail muted beneath. */
export function prHoverMarkdown(h: PrHover): string {
  const rows: [string, string][] = [];
  if (h.state) rows.push(["Status", statusCell({ ...h, state: h.state })]);
  rows.push(["X-RayViewer", reviewCell(h)]);
  if (h.risk) rows.push(["Risk", riskCell(h.risk)]);
  if (h.state) rows.push(["Size", sizeCell(h)]);
  if (h.yours?.length) rows.push(["Your review", yoursCell(h.yours)]);
  const byline = [h.ref, h.author ? `by ${h.author}` : "", h.stackedOn ? `stacked on #${h.stackedOn}` : ""].filter(Boolean).join(" · ");
  const parts = [
    `**${plain(h.title)}**`,
    muted(byline),
    "---",
    ["| | |", "|:--|:--|", ...rows.map(([label, cell]) => `| ${labelCell(label, cell)} | ${cell} |`)].join("\n"),
  ];
  const footer = [h.note ? muted(h.note) : "", h.error ? `${icon("error", RED)} ${plain(h.error.slice(0, 300))}` : ""].filter(Boolean);
  if (footer.length) parts.push("---", footer.join("<br>"));
  return parts.join("\n\n");
}
