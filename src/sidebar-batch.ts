import { randomUUID } from "node:crypto";

/** How many pull requests open together from the sidebar. */
export const OPEN_LIMIT = 5;

export interface SidebarKey {
  owner: string;
  name: string;
  number: number;
}

export interface SidebarRow {
  kind?: string;
  record?: { key?: SidebarKey };
}

export interface OpenChoice {
  chosen: SidebarRow[];
  leftOut: number;
}

export interface BadgeRecord {
  summary?: { state?: string; isDraft?: boolean; reasons?: readonly string[] } | null;
}

/** The count on X-RayViewer's activity bar icon: open pull requests that request your review by name. */
export function sidebarBadge(records: readonly BadgeRecord[], running = 0): { value: number; tooltip: string } | undefined {
  const waiting = records.filter(({ summary }) => summary && (summary.state ?? "OPEN") === "OPEN" && !summary.isDraft && summary.reasons?.includes("review-requested")).length;
  if (!waiting) return undefined;
  const runs = running ? ` · ${running} agent run${running === 1 ? "" : "s"} in progress` : "";
  return { value: waiting, tooltip: `${waiting} pull request${waiting === 1 ? "" : "s"} waiting for your review${runs}` };
}

/** Pull requests from the sidebar selection, at most `limit`, in the order they were selected. */
export function chosenPullRequests(rows: readonly SidebarRow[], limit = OPEN_LIMIT): OpenChoice {
  const prs = rows.filter((row) => row.kind === "pr" && row.record?.key);
  return { chosen: prs.slice(0, limit), leftOut: Math.max(0, prs.length - limit) };
}

const checked = new Set<string>();

export function isChecked(key: string): boolean {
  return checked.has(key.toLowerCase());
}

export function checkedKeys(): string[] {
  return [...checked];
}

export function clearChecked(): void {
  checked.clear();
  drawSelectionBar();
}

/** Checks a pull request. A sixth check is refused so Open selected stays within five tabs. */
export function setChecked(key: string, on: boolean): { ok: boolean; reason: string } {
  const id = key.toLowerCase();
  if (!on) {
    checked.delete(id);
    drawSelectionBar();
    return { ok: true, reason: "" };
  }
  if (checked.has(id) || checked.size < OPEN_LIMIT) {
    checked.add(id);
    drawSelectionBar();
    return { ok: true, reason: "" };
  }
  return { ok: false, reason: "Five is the most you can select." };
}

/** The parts of the sidebar's webview view that the selection bar sets. */
export interface SelectionBarView {
  title?: string;
  description?: string;
  webview: { html: string };
  onDidDispose(listener: () => void): unknown;
}

let bar: SelectionBarView | undefined;

function drawSelectionBar(): void {
  if (!bar) return;
  bar.title = checked.size ? `${checked.size} selected` : "Selection";
  bar.description = checked.size ? "" : `Check up to ${OPEN_LIMIT} pull requests`;
  bar.webview.html = selectionBarHTML(randomUUID(), checked.size);
}

/** Draws the buttons under the list, and draws them again whenever a check changes. */
export function bindSelectionBar(view: SelectionBarView): void {
  bar = view;
  view.onDidDispose(() => {
    if (bar === view) bar = undefined;
  });
  drawSelectionBar();
}

const autoPost = new Set<string>();

export function armAutoPost(key: string): void {
  autoPost.add(key.toLowerCase());
}

export function clearAutoPost(key: string): void {
  autoPost.delete(key.toLowerCase());
}

export function wantsAutoPost(key: string): boolean {
  return autoPost.has(key.toLowerCase());
}

/**
 * The two sidebar actions, drawn like the empty-view buttons: full width, centered, filled with the theme's button color.
 * `nonce` is the webview's style nonce. Command links run the existing selection commands. With nothing checked,
 * the buttons are dimmed and do nothing.
 */
export function selectionBarHTML(nonce: string, count = 0): string {
  const id = nonce.replace(/[^a-zA-Z0-9]/g, "");
  const button = (command: string, label: string) =>
    count ? `<a href="command:xrayviewer.${command}">${label}</a>` : `<a role="link" aria-disabled="true">${label}</a>`;
  const open = count ? `Open ${count} pull request${count === 1 ? "" : "s"}` : "Open selected PRs";
  const review = count ? `Review ${count} and post` : "Review all selected and post";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${id}';">
<style nonce="${id}">
  html, body { height: 100%; margin: 0; background: transparent; }
  body { box-sizing: border-box; display: flex; flex-direction: column; align-items: center; padding: 0 20px 1em; font-family: var(--vscode-font-family); }
  a {
    width: 100%;
    max-width: 300px;
    margin-top: 1em;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    text-decoration: none;
    cursor: pointer;
    border: 1px solid var(--vscode-button-border, transparent);
    border-radius: 4px;
    padding: 5px;
    font-size: 12px;
    font-weight: 500;
    line-height: 16px;
    color: var(--vscode-button-foreground);
    background: var(--vscode-button-background);
  }
  a:hover, a:focus, a:active { color: var(--vscode-button-foreground); }
  a:hover { background: var(--vscode-button-hoverBackground); }
  a:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
  a[aria-disabled="true"], a[aria-disabled="true"]:hover { cursor: default; opacity: 0.5; background: var(--vscode-button-background); }
</style>
</head>
<body>
  ${button("openSelected", open)}
  ${button("runSelected", review)}
</body>
</html>`;
}
