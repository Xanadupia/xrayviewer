export const VERSION = "0.4.8";

const CURSOR_SETTINGS = {
  "xrayviewer.cursor.path": {
    type: "string",
    default: "cursor-agent",
    markdownDescription:
      "Used only when Cursor Agent has no version installed in `~/.local/share/cursor-agent/versions`. Otherwise a run uses the newest version on this machine. `cursor-agent` on your `PATH`, or the full path.",
    scope: "machine",
  },
  "xrayviewer.cursor.model": {
    type: "string",
    default: "",
    markdownDescription:
      "Model for the agents that run on Cursor: any model id on your Cursor account, such as `composer-2.5` or `claude-opus-5-thinking-high`. Empty uses the Cursor Agent CLI's default. **X-RayViewer: Choose Agent Harnesses…** lists your account's models. A model set for one agent in `~/.xrayviewer/agents.yml` wins over this.",
  },
  "xrayviewer.cursor.extraArgs": {
    type: "array",
    items: { type: "string" },
    default: [],
    markdownDescription: "Extra arguments passed to every `cursor-agent` run, one item per argument.",
    scope: "machine",
  },
};

const REPOSITORY = "https://github.com/Xanadupia/xrayviewer";
const GUIDE = "https://xanadupia.github.io/xrayviewer";
const DROPPED_FIELDS = ["scripts", "devDependencies", "dependencies", "private"];

function insertAfter(properties, afterKey, additions) {
  if (!(afterKey in properties)) throw new Error(`package.json has no ${afterKey} setting.`);
  return Object.fromEntries(
    Object.entries(properties).flatMap((entry) => (entry[0] === afterKey ? [entry, ...Object.entries(additions)] : [entry])),
  );
}

/** Turns vendor/base/package.json into the published manifest. */
export function transformManifest(original) {
  const manifest = structuredClone(original);
  for (const field of DROPPED_FIELDS) delete manifest[field];

  manifest.name = "xrayviewer";
  manifest.displayName = "X-RayViewer";
  manifest.publisher = "aliqaryan";
  manifest.author = "Ali Qaryan";
  manifest.version = VERSION;
  manifest.description =
    "Review GitHub pull requests in VS Code or Cursor. Agents run on your computer, and you post the review.";
  manifest.keywords = [...new Set([...manifest.keywords.filter((word) => word !== "pi"), "cursor", "cursor agent", "vscode"])];
  manifest.files = ["dist", "media", "docs", "LICENSE.txt", "readme.md", "changelog.md"];
  manifest.galleryBanner = { color: "#0F7668", theme: "dark" };
  manifest.pricing = "Free";
  manifest.qna = `${REPOSITORY}/issues`;
  manifest.extensionKind = ["workspace"];
  manifest.repository = { type: "git", url: `${REPOSITORY}.git` };
  manifest.bugs = { url: `${REPOSITORY}/issues` };
  manifest.homepage = GUIDE;
  manifest.preview = true;
  manifest.badges = [
    {
      url: "https://img.shields.io/badge/license-MIT-0F7668",
      href: `${REPOSITORY}/blob/main/LICENSE`,
      description: "MIT license",
    },
  ];

  const untrusted = manifest.capabilities.untrustedWorkspaces;
  untrusted.description =
    "In Restricted Mode, X-RayViewer ignores workspace values for the settings that choose which programs run (the Claude Code, Codex and Cursor Agent paths and arguments) and where clones are.";
  untrusted.restrictedConfigurations = [
    ...untrusted.restrictedConfigurations.filter((key) => !key.startsWith("xrayviewer.pi.")),
    "xrayviewer.cursor.path",
    "xrayviewer.cursor.extraArgs",
  ];

  const welcome = manifest.contributes.viewsWelcome.find((item) => item.view === "xrayviewer.pullRequests");
  if (!welcome) throw new Error("package.json has no pull request welcome.");
  welcome.contents =
    "Pull requests that need your review, and the ones you opened, show up here.\n[Refresh](command:xrayviewer.refresh)\n[Open a pull request](command:xrayviewer.openPullRequest)\nIf the list is empty, run `gh auth login` in a terminal, then Refresh.";

  manifest.contributes.commands.push({
    command: "xrayviewer.filter",
    title: "Filter…",
    category: "X-RayViewer",
    icon: "$(filter)",
  });
  manifest.contributes.menus["view/title"].push({
    command: "xrayviewer.filter",
    when: "view == xrayviewer.pullRequests",
    group: "navigation@31",
  });

  const configuration = manifest.contributes.configuration;
  const pathFallback = (program, command) =>
    `Used only when ${program} has no version installed in its usual place. Otherwise a run uses the newest version on this machine. \`${command}\` on your \`PATH\`, or the full path.`;
  for (const key of ["xrayviewer.pi.path", "xrayviewer.pi.model", "xrayviewer.pi.thinking", "xrayviewer.pi.extraArgs"]) {
    delete configuration.properties[key];
  }
  configuration.properties["xrayviewer.claude.path"].markdownDescription = pathFallback("Claude Code", "claude");
  configuration.properties["xrayviewer.codex.path"].markdownDescription = pathFallback("Codex", "codex");
  const harness = configuration.properties["xrayviewer.harness"];
  const kept = harness.enum.flatMap((id, index) => (id === "pi" ? [] : [[id, harness.enumDescriptions[index]]]));
  harness.enum = [...kept.map(([id]) => id), "cursor"];
  harness.enumDescriptions = [...kept.map(([, description]) => description), "Cursor Agent CLI (`cursor-agent`), with any model on your Cursor account"];
  configuration.properties = insertAfter(configuration.properties, "xrayviewer.codex.extraArgs", CURSOR_SETTINGS);
  const groupBy = configuration.properties["xrayviewer.sidebar.groupBy"];
  groupBy.enum = ["relationship", "repository", "author", "review"];
  groupBy.enumDescriptions = [
    "Requested from you, assigned, code owner, your teams, yours, watched, opened here",
    "One group per repository",
    "One group per author",
    "Reviewing, not reviewed, or reviewed by X-RayViewer",
  ];
  configuration.properties = insertAfter(configuration.properties, "xrayviewer.sidebar.groupBy", {
    "xrayviewer.sidebar.mine": {
      type: "boolean",
      default: false,
      markdownDescription: "Show only pull requests you opened. **X-RayViewer: Filter…** sets it.",
    },
    "xrayviewer.sidebar.author": {
      type: "array",
      items: { type: "string" },
      default: [],
      markdownDescription:
        "GitHub logins to show. Empty shows every author. **X-RayViewer: Filter…** sets it.",
    },
    "xrayviewer.sidebar.status": {
      type: "array",
      items: { type: "string", enum: ["open", "draft", "merged", "closed"] },
      default: [],
      markdownDescription:
        "Statuses to show. Empty shows open, draft, merged, and closed. **X-RayViewer: Filter…** sets it.",
    },
  });
  return manifest;
}
