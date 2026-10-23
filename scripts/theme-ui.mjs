/**
 * The review page's theme: System, Light or Dark, picked from a menu in the top bar.
 * The choice lives on <html data-theme-choice>, which the extension stamps from the xrayviewer.theme setting before
 * the page draws and which outlives the page starting again in place. data-theme is always the theme in use, so the
 * stylesheet needs no media query: System resolves to the editor's theme, or the system's in a plain browser.
 * Copied into the page as written. It uses the page's `$`, `icon` and `HOST`.
 */

const THEMES = [
  { id: "system", name: "System", note: "Matches the editor", icon: "monitor" },
  { id: "light", name: "Light", note: "", icon: "sun" },
  { id: "dark", name: "Dark", note: "", icon: "moon" },
];

function themeNow() {
  const id = document.documentElement.dataset.themeChoice;
  return THEMES.some((t) => t.id === id) ? id : "system";
}

/** VS Code marks the webview's body with the editor's theme kind; high-contrast light carries both classes. */
function hostTheme() {
  const c = document.body.classList;
  if (c.contains("vscode-high-contrast-light")) return { theme: "light", contrast: true };
  if (c.contains("vscode-high-contrast")) return { theme: "dark", contrast: true };
  if (c.contains("vscode-light")) return { theme: "light", contrast: false };
  if (c.contains("vscode-dark")) return { theme: "dark", contrast: false };
  return null;
}

function applyTheme() {
  const root = document.documentElement;
  const choice = themeNow();
  const host = hostTheme();
  const system = host ? host.theme : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  const theme = choice === "system" ? system : choice;
  const more = host ? host.contrast : matchMedia("(prefers-contrast: more)").matches;
  if (root.dataset.theme !== theme) root.dataset.theme = theme;
  if (more) root.dataset.contrast = "more";
  else delete root.dataset.contrast;
}

function startTheme() {
  const root = document.documentElement;
  if (!root.dataset.themeChoice) {
    let saved = "";
    try { saved = localStorage.getItem("xrayviewer:theme") || ""; } catch { /* optional */ }
    root.dataset.themeChoice = THEMES.some((t) => t.id === saved) ? saved : "system";
  }
  applyTheme();
}

/** A theme change repaints every color at once: transitions would stagger it, so they're off for that frame. */
function setTheme(id, fromHost) {
  if (!THEMES.some((t) => t.id === id) || id === themeNow()) return;
  const root = document.documentElement;
  root.classList.add("theme-switching");
  root.dataset.themeChoice = id;
  applyTheme();
  void getComputedStyle(root).color;
  setTimeout(() => root.classList.remove("theme-switching"), 0);
  try { localStorage.setItem("xrayviewer:theme", id); } catch { /* optional */ }
  if (!fromHost && HOST && typeof HOST.setTheme === "function") HOST.setTheme(id);
  const el = $("#theme-pick");
  if (el) el.outerHTML = themeButtonHTML();
}

function themeButtonHTML() {
  const now = THEMES.find((t) => t.id === themeNow());
  const label = `Theme: ${now.name}`;
  const items = THEMES.map((t) => `<button type="button" role="menuitemradio" class="menu-item theme-item" data-act="theme-pick" data-theme="${t.id}" aria-checked="${t.id === now.id}">${icon(t.icon)}<span class="ti-text"><b>${t.name}</b>${t.note ? `<span>${t.note}</span>` : ""}</span><span class="ti-check" aria-hidden="true">${icon("check")}</span></button>`).join("");
  return `<div class="theme-pick" id="theme-pick"><button type="button" class="icon-btn" id="theme-btn" data-act="theme" aria-haspopup="menu" aria-expanded="false" aria-controls="theme-menu" aria-label="${label}" title="${label}">${icon(now.icon)}</button><div class="menu theme-menu" id="theme-menu" role="menu" aria-label="Theme" hidden>${items}</div></div>`;
}

function themeMenuOpen() {
  const menu = $("#theme-menu");
  return !!(menu && !menu.hidden);
}

function themeMenu(open, refocus) {
  const menu = $("#theme-menu"), btn = $("#theme-btn");
  if (!menu || !btn) return;
  menu.hidden = !open;
  btn.setAttribute("aria-expanded", String(open));
  if (open) {
    const on = menu.querySelector('[aria-checked="true"]') || menu.querySelector(".theme-item");
    if (on) on.focus();
  } else if (refocus) btn.focus();
}

function pickTheme(id) {
  themeMenu(false);
  setTheme(id, false);
  const btn = $("#theme-btn");
  if (btn) btn.focus();
}

export function themeSource() {
  return `const THEMES = ${JSON.stringify(THEMES)};\n${[themeNow, hostTheme, applyTheme, startTheme, setTheme, themeButtonHTML, themeMenuOpen, themeMenu, pickTheme].map(String).join("\n")}\n`;
}

export const THEME_NAMES = ["THEMES", "applyTheme", "startTheme", "setTheme", "themeButtonHTML", "themeMenuOpen", "themeMenu", "pickTheme"];

export const THEME_PATCHES = [
  {
    id: "theme-state",
    find:
      '// In VS Code, "System" follows the editor\'s theme: VS Code marks the webview\'s body vscode-light, vscode-dark or a\n' +
      "// high-contrast variant. A theme the reader picks here wins.\n" +
      "let themeFollowsHost = false;\n" +
      'const themeNow = () => (themeFollowsHost ? "system" : document.documentElement.dataset.theme || "system");\n' +
      "function hostTheme() {\n" +
      "  const c = document.body.classList;\n" +
      '  if (c.contains("vscode-light") || c.contains("vscode-high-contrast-light")) return "light";\n' +
      '  if (c.contains("vscode-dark") || c.contains("vscode-high-contrast")) return "dark";\n' +
      "  return null;\n" +
      "}\n" +
      "function applyHostTheme() {\n" +
      "  if (!themeFollowsHost) return;\n" +
      "  const t = hostTheme();\n" +
      "  if (t) document.documentElement.dataset.theme = t;\n" +
      "  else delete document.documentElement.dataset.theme;\n" +
      "}\n" +
      'const THEME_ICON = { system: "monitor", light: "sun", dark: "moon" };\n',
    replace: themeSource(),
  },
  {
    id: "theme-button",
    find: '      <button type="button" class="icon-btn" data-act="theme" aria-label="Theme: ${themeNow()}" title="Theme: ${themeNow()}">${icon(THEME_ICON[themeNow()])}</button>\n',
    replace: "      ${themeButtonHTML()}\n",
  },
  {
    id: "theme-no-cycle",
    find:
      "function cycleTheme() {\n" +
      '  const order = ["system", "light", "dark"];\n' +
      "  const next = order[(order.indexOf(themeNow()) + 1) % order.length];\n" +
      '  themeFollowsHost = next === "system";\n' +
      "  if (next !== \"system\") document.documentElement.dataset.theme = next;\n" +
      "  else applyHostTheme();\n" +
      '  try { localStorage.setItem("xrayviewer:theme", next); } catch { /* optional */ }\n' +
      '  replaceHTML("#bar", topbarHTML());\n' +
      "  onScroll();\n" +
      "  toast(`Theme: ${cap(next)}`);\n" +
      "}\n",
    replace: "",
  },
  {
    id: "theme-actions",
    find: "  theme: () => cycleTheme(),",
    replace: '  theme: () => themeMenu(!themeMenuOpen()),\n  "theme-pick": (el) => pickTheme(el.dataset.theme),',
  },
  {
    id: "theme-start",
    find:
      "try {\n" +
      '  const theme = localStorage.getItem("xrayviewer:theme");\n' +
      '  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;\n' +
      "  else themeFollowsHost = true;\n" +
      "} catch { /* optional */ }\n" +
      "applyHostTheme();\n",
    replace:
      "startTheme();\n" +
      'mq("(prefers-color-scheme: dark)").addEventListener("change", applyTheme, { signal });\n' +
      'mq("(prefers-contrast: more)").addEventListener("change", applyTheme, { signal });\n',
  },
  {
    id: "theme-watch",
    find: "const themeWatch = new MutationObserver(applyHostTheme);",
    replace:
      "const themeWatch = new MutationObserver(applyTheme);\n" +
      "// Not { signal }: a listener added with the signal it listens to is removed before the abort event fires.\n" +
      'signal.addEventListener("abort", () => themeWatch.disconnect(), { once: true });',
  },
  {
    id: "theme-watch-stop",
    find: "  hostTheme.disconnect();\n}, { signal });",
    replace: "}, { signal });",
  },
  {
    id: "theme-host-message",
    find: '  if (m.type === "host-data") { takeData(m); return; }',
    replace: '  if (m.type === "host-theme") { setTheme(m.theme, true); return; }\n  if (m.type === "host-data") { takeData(m); return; }',
  },
  {
    id: "theme-menu-close",
    find: "  if (Date.now() - lastSwipe < 350) return;",
    replace:
      '  if (themeMenuOpen() && !e.target.closest("#theme-pick")) themeMenu(false);\n' +
      "  if (Date.now() - lastSwipe < 350) return;",
  },
  {
    id: "theme-menu-keys",
    find: '  if (mod && e.key === "Enter") {',
    replace:
      '  if (themeMenuOpen() && t.closest("#theme-pick")) {\n' +
      '    if (e.key === "Escape") { e.preventDefault(); themeMenu(false, true); return; }\n' +
      '    if (e.key === "Tab") { themeMenu(false); return; }\n' +
      '    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {\n' +
      "      e.preventDefault();\n" +
      '      const items = [...document.querySelectorAll("#theme-menu .theme-item")], at = items.indexOf(document.activeElement);\n' +
      '      const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : at < 0 ? 0 : (at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;\n' +
      "      if (items[next]) items[next].focus();\n" +
      "      return;\n" +
      "    }\n" +
      "    return;\n" +
      "  }\n" +
      '  if (mod && e.key === "Enter") {',
  },
];
