import { activityHTML } from "../scripts/activity-ui.mjs";

/** What the review page passes as a plan row. Names and models come from it when the run itself has none. */
export interface ActivityPlan {
  id: string;
  name?: string;
  harness?: string;
  model?: string;
}

export interface ActivityProgress {
  agents?: Record<string, { state?: string; name?: string; harness?: string; by?: string }>;
  activity?: Record<string, { steps: unknown[]; dropped: number }>;
}

interface ActivityView {
  postMessage(message: unknown): void;
}

const SPRITES = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="i-check" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></symbol>
  <symbol id="i-x" viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></symbol>
  <symbol id="i-x-circle" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></symbol>
  <symbol id="i-chev" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></symbol>
  <symbol id="i-left" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></symbol>
  <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></symbol>
  <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></symbol>
  <symbol id="i-alert" viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></symbol>
  <symbol id="i-bot" viewBox="0 0 24 24"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></symbol>
</svg>`;

const EMPTY = `<p class="act-empty">Open a pull request to see what each agent read, ran and said. This follows the pull request you are reviewing.</p>`;

function esc(value: string): string {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function icon(name: string, cls = ""): string {
  return `<svg class="i${cls ? ` ${cls}` : ""}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

const avatar = `<span class="agent-av xs" aria-hidden="true">${icon("bot")}</span>`;

function attr(value: string): string {
  return value.replace(/[&"<>]/g, (char) => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" })[char] ?? char);
}

/** The sidebar document. The review page's stylesheet draws the same checks tree. */
export function activityPanelHTML(cspSource: string, nonce: string, cssHref: string): string {
  const id = nonce.replace(/[^a-zA-Z0-9]/g, "");
  const csp = attr(cspSource);
  const href = attr(cssHref);
  return `<!DOCTYPE html>
<html lang="en" class="in-vscode">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${csp}; font-src ${csp}; style-src ${csp} 'nonce-${id}'; script-src 'nonce-${id}';">
<link rel="stylesheet" href="${href}">
<style nonce="${id}">
  html, body { height: 100%; margin: 0; background: var(--vscode-sideBar-background, var(--ground)); color: var(--ink); }
  body { box-sizing: border-box; padding: 8px 8px 12px; font-family: var(--ui); }
  #activity { min-height: 100%; }
</style>
</head>
<body>
${SPRITES}
<div id="activity">${EMPTY}</div>
<script nonce="${id}">
  const vscode = acquireVsCodeApi();
  const root = document.getElementById("activity");
  const clock = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return s + "s";
    const m = Math.floor(s / 60);
    if (m < 60) return m + "m " + String(s % 60).padStart(2, "0") + "s";
    return Math.floor(m / 60) + "h " + String(m % 60).padStart(2, "0") + "m";
  };
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || message.type !== "activity" || !root) return;
    const atEnd = root.scrollHeight - root.scrollTop - root.clientHeight < 24;
    const top = root.scrollTop;
    root.innerHTML = message.html;
    root.scrollTop = atEnd ? root.scrollHeight : top;
  });
  root.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-act]") : null;
    if (!target) return;
    const act = target.getAttribute("data-act");
    if (act === "activity-detail" || act === "activity-back") vscode.postMessage({ type: "detail", id: act === "activity-back" ? "" : target.getAttribute("data-id") || "" });
  });
  root.addEventListener("toggle", (event) => {
    const el = event.target;
    if (!(el instanceof HTMLDetailsElement) || !el.dataset.key) return;
    vscode.postMessage({ type: "toggle", key: el.dataset.key, open: el.open });
  }, true);
  setInterval(() => {
    const now = Date.now();
    for (const el of document.querySelectorAll("[data-since]")) el.textContent = clock(now - Number(el.dataset.since));
  }, 1000);
</script>
</body>
</html>`;
}

/** The checks tree for one pull request, including an agent's opened log. */
export function activityBody(progress: ActivityProgress | null, plan: ActivityPlan[] | null, detail = "", open = new Map<string, boolean>()): string {
  const agents = progress?.agents;
  if (!agents || !Object.keys(agents).length) return EMPTY;
  return activityHTML(progress, plan, { esc, icon, avatar, now: Date.now(), open, detail });
}

let webview: ActivityView | null = null;
let progress: ActivityProgress | null = null;
let plan: ActivityPlan[] | null = null;
let detail = "";
let progressKey = "";
let planAt = 0;
const open = new Map<string, boolean>();

function keyOf(next: ActivityProgress | null): string {
  const agents = next?.agents ?? {};
  return Object.keys(agents).sort().join("\0");
}

function post(): void {
  webview?.postMessage({ type: "activity", html: activityBody(progress, plan, detail, open) });
}

export function bindActivity(view: ActivityView): void {
  webview = view;
  post();
}

export function onActivityMessage(message: { type?: unknown; id?: unknown; key?: unknown; open?: unknown }): void {
  if (!message || typeof message !== "object") return;
  if (message.type === "detail") {
    detail = typeof message.id === "string" ? message.id : "";
    post();
    return;
  }
  if (message.type === "toggle" && typeof message.key === "string") open.set(message.key, message.open === true);
}

/** Shows this pull request's agent tree. `loadPlan` is read at most every 30 seconds. */
export async function publishActivity(next: ActivityProgress | null, loadPlan?: () => Promise<ActivityPlan[] | null>): Promise<void> {
  const key = keyOf(next);
  if (key !== progressKey) {
    progressKey = key;
    detail = "";
    open.clear();
  }
  progress = next;
  if (loadPlan && Date.now() - planAt > 30000) {
    planAt = Date.now();
    plan = await loadPlan().catch(() => plan);
  }
  post();
}
