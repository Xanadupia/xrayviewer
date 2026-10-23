export type ThemeChoice = "system" | "light" | "dark";

export const THEME_CHOICES: readonly ThemeChoice[] = ["system", "light", "dark"];

/** VS Code's ColorThemeKind: Light 1, Dark 2, HighContrast 3, HighContrastLight 4. */
type ColorThemeKind = 1 | 2 | 3 | 4;

interface ThemeItem {
  label: string;
  description?: string;
  detail: string;
  value: ThemeChoice;
}

/** The slice of the `vscode` API the theme uses. */
export interface ThemeVscode {
  window: {
    activeColorTheme: { kind: number };
    showQuickPick(items: readonly ThemeItem[], options: { title: string; placeHolder?: string }): PromiseLike<ThemeItem | undefined>;
  };
  workspace: {
    getConfiguration(section: string): {
      get(key: string): unknown;
      update(key: string, value: unknown, target: number): PromiseLike<void>;
    };
  };
  ConfigurationTarget: { Global: number };
}

const isChoice = (value: unknown): value is ThemeChoice => THEME_CHOICES.includes(value as ThemeChoice);

export function themeChoice(vscode: ThemeVscode): ThemeChoice {
  const value = vscode.workspace.getConfiguration("xrayviewer").get("theme");
  return isChoice(value) ? value : "system";
}

/** The page's opening tag, so it draws in the right theme before its script runs. */
export function themeTag(vscode: ThemeVscode): string {
  const choice = themeChoice(vscode);
  const kind = vscode.window.activeColorTheme.kind as ColorThemeKind;
  const editor = kind === 1 || kind === 4 ? "light" : "dark";
  const theme = choice === "system" ? editor : choice;
  const contrast = kind === 3 || kind === 4 ? ' data-contrast="more"' : "";
  return `<html lang="en" data-theme="${theme}" data-theme-choice="${choice}"${contrast}>`;
}

export async function saveTheme(vscode: ThemeVscode, value: unknown): Promise<void> {
  if (!isChoice(value) || value === themeChoice(vscode)) return;
  await vscode.workspace.getConfiguration("xrayviewer").update("theme", value, vscode.ConfigurationTarget.Global);
}

export async function chooseTheme(vscode: ThemeVscode): Promise<void> {
  const current = themeChoice(vscode);
  const options: ThemeItem[] = [
    { label: "$(color-mode) System", detail: "Matches the editor's theme, including high contrast", value: "system" },
    { label: "$(lightbulb) Light", detail: "Light review pages, whatever the editor uses", value: "light" },
    { label: "$(lightbulb-empty) Dark", detail: "Dark review pages, whatever the editor uses", value: "dark" },
  ];
  const items = options.map((item) => (item.value === current ? { ...item, description: "Current" } : item));
  const picked = await vscode.window.showQuickPick(items, { title: "X-RayViewer Theme", placeHolder: "How review pages look" });
  if (picked) await saveTheme(vscode, picked.value);
}
