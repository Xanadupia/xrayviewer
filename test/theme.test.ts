import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { chooseTheme, saveTheme, themeChoice, themeTag, type ThemeVscode } from "../src/theme.ts";

interface Fake {
  vscode: ThemeVscode;
  saved: Array<{ key: string; value: unknown; target: number }>;
  shown: Array<{ items: readonly { label: string; description?: string; value: string }[]; title: string }>;
}

function editor(kind: number, setting?: unknown, pick?: (items: readonly { value: string }[]) => { value: string } | undefined): Fake {
  const saved: Fake["saved"] = [];
  const shown: Fake["shown"] = [];
  let value = setting;
  const vscode = {
    window: {
      activeColorTheme: { kind },
      showQuickPick: async (items: readonly any[], options: { title: string }) => {
        shown.push({ items, title: options.title });
        return pick ? pick(items) : undefined;
      },
    },
    workspace: {
      getConfiguration: (section: string) => ({
        get: (key: string) => (section === "xrayviewer" && key === "theme" ? value : undefined),
        update: async (key: string, next: unknown, target: number) => {
          saved.push({ key, value: next, target });
          value = next;
        },
      }),
    },
    ConfigurationTarget: { Global: 1 },
  } as unknown as ThemeVscode;
  return { vscode, saved, shown };
}

describe("review page theme setting", () => {
  test("is System until the reader picks Light or Dark", () => {
    assert.equal(themeChoice(editor(2).vscode), "system");
    assert.equal(themeChoice(editor(2, "sepia").vscode), "system");
    assert.equal(themeChoice(editor(2, "light").vscode), "light");
  });

  test("System opens the page in the editor's theme, high contrast included", () => {
    assert.equal(themeTag(editor(1).vscode), '<html lang="en" data-theme="light" data-theme-choice="system">');
    assert.equal(themeTag(editor(2).vscode), '<html lang="en" data-theme="dark" data-theme-choice="system">');
    assert.equal(themeTag(editor(3).vscode), '<html lang="en" data-theme="dark" data-theme-choice="system" data-contrast="more">');
    assert.equal(themeTag(editor(4).vscode), '<html lang="en" data-theme="light" data-theme-choice="system" data-contrast="more">');
  });

  test("a picked theme wins over the editor's, and high contrast still applies", () => {
    assert.match(themeTag(editor(2, "light").vscode), /data-theme="light" data-theme-choice="light">$/);
    assert.match(themeTag(editor(4, "dark").vscode), /data-theme="dark" data-theme-choice="dark" data-contrast="more">$/);
  });

  test("the page saves a new choice for every window, and ignores repeats and unknown values", async () => {
    const fake = editor(2, "system");
    await saveTheme(fake.vscode, "dark");
    await saveTheme(fake.vscode, "dark");
    await saveTheme(fake.vscode, "<script>");
    assert.deepEqual(fake.saved, [{ key: "theme", value: "dark", target: 1 }]);
  });

  test("Choose Theme marks the current theme and saves the pick", async () => {
    const fake = editor(2, "light", (items) => items.find((item) => item.value === "dark"));
    await chooseTheme(fake.vscode);
    assert.equal(fake.shown[0].title, "X-RayViewer Theme");
    assert.deepEqual(fake.shown[0].items.map((item) => [item.value, item.description ?? ""]), [["system", ""], ["light", "Current"], ["dark", ""]]);
    assert.deepEqual(fake.saved, [{ key: "theme", value: "dark", target: 1 }]);
  });

  test("closing Choose Theme changes nothing", async () => {
    const fake = editor(2, "light");
    await chooseTheme(fake.vscode);
    assert.deepEqual(fake.saved, []);
  });
});
