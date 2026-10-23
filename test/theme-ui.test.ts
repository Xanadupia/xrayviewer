import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { themeSource } from "../scripts/theme-ui.mjs";

interface PageOptions {
  body?: string[];
  stamped?: string;
  saved?: string;
  systemDark?: boolean;
}

function classes(initial: string[] = []) {
  const set = new Set(initial);
  return { add: (c: string) => void set.add(c), remove: (c: string) => void set.delete(c), contains: (c: string) => set.has(c) };
}

interface ThemePage {
  applyTheme(): void;
  startTheme(): void;
  setTheme(id: string, fromHost: boolean): void;
  themeButtonHTML(): string;
}

function page(options: PageOptions = {}) {
  const root = { dataset: {} as Record<string, string>, classList: classes() };
  if (options.stamped) root.dataset.themeChoice = options.stamped;
  const store = new Map<string, string>(options.saved ? [["xrayviewer:theme", options.saved]] : []);
  const sent: string[] = [];
  const timers: Array<() => void> = [];
  const env = {
    document: { documentElement: root, body: { classList: classes(options.body) } },
    matchMedia: (q: string) => ({ matches: q.includes("dark") ? !!options.systemDark : false }),
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    getComputedStyle: () => ({ color: "" }),
    setTimeout: (fn: () => void) => void timers.push(fn),
    $: () => null,
    icon: (name: string) => `<i data-icon="${name}"></i>`,
    HOST: { setTheme: (id: string) => void sent.push(id) },
  };
  const fns: ThemePage = new Function(...Object.keys(env), `${themeSource()}; return { applyTheme, startTheme, setTheme, themeButtonHTML };`)(...Object.values(env));
  return { ...fns, root, store, sent, timers };
}

describe("review page theme menu", () => {
  test("System follows the editor's theme kind", () => {
    const light = page({ body: ["vscode-light"], stamped: "system" });
    light.startTheme();
    assert.equal(light.root.dataset.theme, "light");
    assert.equal(light.root.dataset.contrast, undefined);

    const hcLight = page({ body: ["vscode-high-contrast", "vscode-high-contrast-light"], stamped: "system" });
    hcLight.startTheme();
    assert.deepEqual([hcLight.root.dataset.theme, hcLight.root.dataset.contrast], ["light", "more"]);

    const hcDark = page({ body: ["vscode-high-contrast"], stamped: "system" });
    hcDark.startTheme();
    assert.deepEqual([hcDark.root.dataset.theme, hcDark.root.dataset.contrast], ["dark", "more"]);
  });

  test("outside the editor, System follows the system's scheme", () => {
    const p = page({ systemDark: true });
    p.startTheme();
    assert.deepEqual([p.root.dataset.themeChoice, p.root.dataset.theme], ["system", "dark"]);
  });

  test("the setting the extension stamped wins over what this browser saved", () => {
    const p = page({ body: ["vscode-dark"], stamped: "light", saved: "dark" });
    p.startTheme();
    assert.deepEqual([p.root.dataset.themeChoice, p.root.dataset.theme], ["light", "light"]);

    const loose = page({ saved: "dark" });
    loose.startTheme();
    assert.equal(loose.root.dataset.theme, "dark");
    const junk = page({ saved: "sepia" });
    junk.startTheme();
    assert.equal(junk.root.dataset.themeChoice, "system");
  });

  test("picking a theme repaints without transitions and saves it for every tab", () => {
    const p = page({ body: ["vscode-dark"], stamped: "system" });
    p.startTheme();
    p.setTheme("light", false);
    assert.deepEqual([p.root.dataset.themeChoice, p.root.dataset.theme], ["light", "light"]);
    assert.ok(p.root.classList.contains("theme-switching"));
    p.timers.forEach((fn) => fn());
    assert.equal(p.root.classList.contains("theme-switching"), false);
    assert.deepEqual(p.sent, ["light"]);
    assert.equal(p.store.get("xrayviewer:theme"), "light");
  });

  test("a change from the extension, a repeat or an unknown theme sends nothing back", () => {
    const p = page({ body: ["vscode-dark"], stamped: "system" });
    p.startTheme();
    p.setTheme("dark", true);
    p.setTheme("dark", false);
    p.setTheme("sepia", false);
    assert.equal(p.root.dataset.themeChoice, "dark");
    assert.deepEqual(p.sent, []);
  });

  test("the menu names the current theme and checks it", () => {
    const p = page({ stamped: "dark" });
    const html = p.themeButtonHTML();
    assert.match(html, /aria-label="Theme: Dark"/);
    assert.match(html, /aria-haspopup="menu"/);
    assert.match(html, /data-theme="dark" aria-checked="true"/);
    assert.match(html, /data-theme="system" aria-checked="false"/);
    assert.equal((html.match(/role="menuitemradio"/g) || []).length, 3);
  });
});
