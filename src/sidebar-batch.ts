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
}

/** Checks a pull request. A sixth check is refused so Open selected stays within five tabs. */
export function setChecked(key: string, on: boolean): { ok: boolean; reason: string } {
  const id = key.toLowerCase();
  if (!on) {
    checked.delete(id);
    return { ok: true, reason: "" };
  }
  if (checked.has(id) || checked.size < OPEN_LIMIT) {
    checked.add(id);
    return { ok: true, reason: "" };
  }
  return { ok: false, reason: "Five is the most you can select." };
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
 * `nonce` is the webview's style nonce. Command links run the existing selection commands.
 */
export function selectionBarHTML(nonce: string): string {
  const id = nonce.replace(/[^a-zA-Z0-9]/g, "");
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
</style>
</head>
<body>
  <a href="command:xrayviewer.openSelected">Open selected PRs</a>
  <a href="command:xrayviewer.runSelected">Review all selected and post</a>
</body>
</html>`;
}
