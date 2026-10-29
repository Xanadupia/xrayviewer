import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { before, describe, test } from "node:test";
import { buildExtension } from "../scripts/build.mjs";
import { applyPatches, countOccurrences, PATCHES, UI_PATCHES } from "../scripts/patches.mjs";

const vendorBundle = () => readFile(new URL("../vendor/base/dist/extension.cjs", import.meta.url), "utf8");

describe("patches", () => {
  test("every anchor appears exactly once in the base bundle", async () => {
    const source = await vendorBundle();
    const page = await readFile(new URL("../vendor/base/media/ui/app.js", import.meta.url), "utf8");

    for (const patch of PATCHES) assert.equal(countOccurrences(source, patch.find), 1, patch.id);
    for (const patch of UI_PATCHES) assert.equal(countOccurrences(page, patch.find), 1, patch.id);
  });

  test("refuse a bundle where an anchor is missing or repeated", async () => {
    const source = await vendorBundle();
    const [first] = PATCHES;

    assert.throws(() => applyPatches(source.replace(first.find, "")), /expected its anchor once, found it 0 times/);
    assert.throws(() => applyPatches(source + first.find), /expected its anchor once, found it 2 times/);
    assert.throws(() => applyPatches(`var xrvCursor;${source}`), /already uses the name xrvCursor/);
  });
});

describe("the built extension", () => {
  let dir: string;
  let manifest: any;
  let bundle: string;

  before(async () => {
    dir = await buildExtension(path.join(await mkdtemp(path.join(tmpdir(), "xrayviewer-build-")), "extension"));
    manifest = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
    bundle = await readFile(path.join(dir, "dist", "extension.cjs"), "utf8");
  });

  test("is X-RayViewer by Ali Qaryan, with its own id", async () => {
    assert.equal(manifest.name, "xrayviewer");
    assert.equal(manifest.displayName, "X-RayViewer");
    assert.equal(manifest.publisher, "aliqaryan");
    assert.equal(manifest.author, "Ali Qaryan");
    assert.equal(manifest.version, "0.5.4");
    assert.ok(bundle.includes("ensurePanel(e)"), "each pull request opens in its own tab");
    assert.ok(bundle.includes("this.xrvTabs"), "open pull requests keep their tabs");
    const page = await readFile(path.join(dir, "media", "ui", "app.js"), "utf8");
    assert.match(page, /function modelSummary\(agents\)/);
    assert.match(page, /Update review/);
    assert.match(page, /Choose model/);
    assert.match(page, /X-RayViewer/);
    assert.match(page, /choose-model/);
    assert.ok(bundle.includes('type==="chooseHarness"'));
    assert.match(page, /id="host-run-wrap">\$\{runMainHTML\(label\)\}[\s\S]*?data-act="run-menu"[\s\S]*?id="run-menu" role="menu"[^>]*hidden>\$\{chooseModelHTML\(\)\}<\/div><\/div>/, "Choose model sits in the run button's menu");
    assert.equal(page.includes("Agent activity…"), false, "Agent activity lives in the sidebar, not the run menu");
    assert.match(page, /role="menuitem" class="menu-item" id="choose-model" data-act="choose-model"/);
    assert.match(page, /"run-menu": \(\) => runMenu\(!runMenuOpen\(\)\)/);
    assert.match(page, /if \(runMenuOpen\(\) && !e\.target\.closest\("#host-run-wrap"\)\) runMenu\(false\);/);
    assert.equal(page.includes("${chooseModelHTML()}</header>"), false, "no separate Choose model button");
    assert.match(page, /m\.type === "host-model"/);
    assert.match(page, /<div class="brief-list">\$\{items\}<\/div>\$\{adoptAllHTML\(\)\}/, "the briefing offers to add every open finding");
    assert.match(page, /\$\{icon\("plus"\)\}Add to my review<\/button>\$\{adoptAllCardHTML\(\)\}/, "each finding card also offers to add them all");
    assert.match(page, /function refreshChrome\(\) \{\n {2}if \(S\.view !== "pr"\) return;\n {2}syncAdoptAll\(\);/, "the cards' counts follow every decision");
    assert.match(page, /function findingDrafts\(findings, page\)/);
    assert.match(page, /"adopt-all": \(\) => adoptAll\(\),\n {2}"adopt-all-undo": \(\) => undoAdoptAll\(\),/);
    assert.match(page, /\{ act: "adopt-all-undo", label: "Undo" \}/);
    assert.match(page, /function activityHTML\(progress, plan, view\)/);
    assert.match(page, /"agent-activity": \(\) => \{ runMenu\(false\); if \(typeof HOST\.showActivity === "function"\) HOST\.showActivity\(\); else openActivity\(\); \},\n {2}"activity-detail": \(el\) => showActivity\(el\.dataset\.id\),\n {2}"activity-back": \(\) => showActivity\(""\),/);
    assert.match(page, /avatar: agentAv\("xs"\), now: Date\.now\(\), open: activityOpen, detail: activityDetail/);
    assert.match(page, /data-act="agent-activity" title="See what each agent is doing"><span class="spin"/, "the running button opens the activity");
    assert.match(page, /id="post-all"/, "a checkbox beside Run posts every finding when that run finishes");
    assert.match(page, /Post all findings when finished/);
    assert.match(page, /if \(!codeReviewBlocked\(\) && postAllOn\(\) && agentsRunning && !m\.automatic\) armPostAll\(\);/, "a manual run arms posting, including one started from the model picker");
    assert.match(page, /if \(on && agentsRunning && live && !codeReviewBlocked\(\)\) armPostAll\(\);/, "checking the box during a run posts that run");
    assert.match(page, /codeReviewBlocked\(\)\) \{ disarmPostAll\(\); return; \}/, "a failed built-in review leaves the other findings for you to review");
    assert.match(page, /if \(failed\("codex-review"\)\) names\.push\("Codex's review"\)/);
    assert.ok(bundle.includes('case"codex":return e.codeReview?await xrvCursor().codexReview(n,e,Yf):await Yf(n,e);'), "Codex's review uses the built-in command");
    assert.match(page, /m\.state === "done" && typeof HOST\.reload === "function"\) HOST\.reload\(\);/, "a finished armed run reloads so the new findings are on the page");
    assert.match(page, /S\.pushDecision = "comment";\n\s+openFinish\(\);\n\s+S\.pushConfirm = true;/, "the finished run posts the findings as comments");
    assert.match(page, /if \(open\.length\) adoptAll\(true\);/);
    assert.match(page, /if \(t\.id === "post-all"\) setPostAll\(!!t\.checked\);/);
    assert.match(page, /watchActivity\(\);\nmaybePostAll\(\);/);
    assert.match(page, /function onHostRun\(m\) \{\n {2}const was = agentsRunning;\n {2}agentsRunning = !!m\.running;\n {2}if \(m\.state\) runState = m\.state;\n {2}if \(m\.progress\) agentProgress = m\.progress;\n {2}applyRunButton\(\);\n {2}refreshActivity\(\);/);
    assert.ok(bundle.includes("progress:run?.progress??null"), "the host posts each agent's steps with the run state");
    assert.ok(bundle.includes("state:s,automatic:!!run?.automatic"), "the page can tell a finished manual run from one that was stopped");
    assert.ok(bundle.includes("autoPost:auto"), "each open review hears when its own run should post");
    assert.match(page, /if \(m\.autoPost\) armPostAll\(\);/);
    assert.ok(bundle.includes("o.runState=l.state"), "a reloaded review knows the run has finished");
    assert.ok(bundle.includes("activity:xrvA.snapshot()"));
    assert.match(page, /body: withTag\(draftLevel\(d\), d\.body\)/, "every posted comment carries its level");
    assert.match(page, /\$\{levelRowHTML\(c\)\}/, "the composer offers High, Medium and Low");
    assert.match(page, /level: \(el\) => setLevel\(el\.dataset\.v\)/);
    assert.match(page, /label: c\.label, level: draftLevel\(c\), body: text,/);
    assert.match(page, /const m = readTag\(bodies\[0\]\);/);
    assert.equal(page.includes("LABEL_PREFIX") || page.includes("withLabel"), false);
    assert.ok(bundle.includes("o.modelPlan=await"), "the page data carries the model plan");
    assert.ok(bundle.includes('type:"host-model"'), "a model pick updates the open page");
    assert.ok(bundle.includes("...xrvCursor().withModelChoice(N(e),o.harnesses,b),enabled:"), "a run uses its pull request's own models");
    assert.ok(bundle.includes("modelPlan(Yt().harnesses,c.settings.agents,N(e))"), "each review page shows its own pull request's models");
    assert.ok(bundle.includes('executeCommand("xrayviewer.selectHarness",N(t))'), "Choose model on a review page is for that pull request");
    assert.ok(bundle.includes('xrayviewer.filter'));
    assert.equal(bundle.includes('xrayviewer.filterAuthor'), false);
    assert.equal(bundle.includes('xrayviewer.filterStatus'), false);
    assert.equal(manifest.contributes.configuration.properties["xrayviewer.sidebar.status"].items.enum.includes("merged"), true);
    assert.ok(bundle.includes('groupBy==="author"'));
    assert.equal(bundle.includes("circle-small-filled"), false);
    await assert.rejects(readFile(path.join(dir, "media", "risk", "open-low.svg")), "sidebar rows draw a codicon, not a risk image");
    assert.equal(manifest.contributes.configuration.properties["xrayviewer.sidebar.groupBy"].enum.includes("author"), true);
    assert.equal(manifest.contributes.configuration.properties["xrayviewer.sidebar.groupBy"].enum.includes("review"), true);
    assert.match(page, /M8\.5 8\.5l7 7/);
    assert.equal(page.includes("M1.5 8h27"), false);
    assert.match(page, /function toast\(msg, action, tone\) \{\n {2}paintBanner\(bannerHTML\(esc\(msg\), action \? \[action\] : \[\], \{ tone: tone \|\| toneOf\(msg\) \}\), !!action\);/);
    assert.match(page, /function showHostNotice\(m\)/);
    assert.match(page, /<div class="notice-body"><span>\$\{text\}<\/span>\$\{row\}<\/div><button type="button" class="icon-btn sm notice-x" data-act="notice-close"/, "Dismiss comes last, after the line and its buttons");
    assert.match(page, /return `<div class="notice n-\$\{tone\}"\$\{pin\}\$\{ask\}>\$\{toneHTML\(tone\)\}/, "the banner leads with a mark for its kind of line");
    assert.match(page, /notePosted\(p\.body\.event, p\.body\.comments\.length, review && review\.url\);\n {4}try \{ await api\("POST", "\/refresh"\)/, "a post is noted before the page reloads");
    assert.match(page, /maybePostAll\(\);\nshowPostedNotice\(\);/, "the page that comes back says it was posted");
    assert.match(page, /if \(AG\.postedAt\) return \{ kind: "posted", label: "X-RayViewer reviewed & posted"/);
    assert.match(page, /function noticeHTML\(\) \{\n {2}return bannerNow;/);
    assert.equal(page.includes("${icon(ic)}<span>${text}</span>"), false);
    assert.ok(bundle.includes("function xrvInstallNotices"), "editor messages use the review banner when a review is open");
    assert.ok(bundle.includes('type: "notice-answer"'));
    assert.ok(bundle.includes('m.type === "host-notice"'));
    assert.match(page, /modelSummary\(AGENTS\)\.line/);
    assert.ok(bundle.includes(`var ra="${manifest.publisher}.${manifest.name}"`), "the link handler uses the extension's id");
    for (const field of ["scripts", "devDependencies", "dependencies", "private"]) assert.equal(manifest[field], undefined, field);
    assert.equal(manifest.license, "MIT");
    assert.equal(manifest.icon, "media/icon.png");
    assert.equal(manifest.pricing, "Free");
    assert.deepEqual(manifest.extensionKind, ["workspace"]);
    assert.equal(manifest.repository.url, "https://github.com/Xanadupia/xrayviewer.git");
    assert.equal(manifest.bugs.url, "https://github.com/Xanadupia/xrayviewer/issues");
    assert.equal(manifest.homepage, "https://xanadupia.github.io/xrayviewer");
    assert.equal(manifest.preview, true);
    assert.equal(manifest.badges[0].description, "MIT license");
    assert.equal(manifest.qna, "https://github.com/Xanadupia/xrayviewer/issues");
    assert.ok(manifest.engines.vscode);
    assert.ok(manifest.files.includes("LICENSE.txt"));
    assert.ok(manifest.files.includes("readme.md"));
    const guide = await readFile(path.join(dir, "readme.md"), "utf8");
    const pictures = [...guide.matchAll(/!\[[^\]]*\]\((docs\/[^)\s]+)\)/g)].map((match) => match[1]);
    assert.ok(pictures.includes("docs/hero.png"));
    assert.ok(pictures.includes("docs/how-it-works.png"));
    for (const picture of pictures) await readFile(new URL(`../${picture}`, import.meta.url));
    assert.equal(manifest.files.includes("docs"), false);
    await assert.rejects(readFile(path.join(dir, "docs", "hero.png")), "the pictures load from GitHub, so they stay out of the package");
  });

  test("offers Cursor as a harness with its settings, and restricts the ones that choose a program", () => {
    const properties = manifest.contributes.configuration.properties;
    const keys = Object.keys(properties);

    assert.deepEqual(properties["xrayviewer.harness"].enum, ["claude", "codex", "cursor"]);
    assert.equal(properties["xrayviewer.pi.path"], undefined);
    assert.equal(bundle.includes("Pi coding agent"), false);
    assert.equal(bundle.includes("xrayviewer.pi"), false);
    assert.equal(bundle.includes(':a||t.run.state==="waiting"'), false);
    assert.equal(properties["xrayviewer.harness"].enumDescriptions.length, 3);
    assert.equal(properties["xrayviewer.cursor.path"].default, "cursor-agent");
    assert.equal(properties["xrayviewer.cursor.path"].scope, "machine");
    assert.equal(properties["xrayviewer.cursor.extraArgs"].scope, "machine");
    assert.equal(properties["xrayviewer.cursor.model"].default, "");
    assert.equal(keys.indexOf("xrayviewer.cursor.path"), keys.indexOf("xrayviewer.codex.extraArgs") + 1);
    assert.ok(manifest.capabilities.untrustedWorkspaces.restrictedConfigurations.includes("xrayviewer.cursor.path"));
    assert.ok(manifest.capabilities.untrustedWorkspaces.restrictedConfigurations.includes("xrayviewer.cursor.extraArgs"));
  });

  test("ships the MIT license", async () => {
    const license = await readFile(path.join(dir, "LICENSE.txt"), "utf8");

    assert.match(license, /^MIT License/);
    assert.match(license, /Copyright \(c\) 2026 Ali Qaryan/);
  });

  test("styles the review chrome with the Apple system face and glass navigation", async () => {
    const styles = await readFile(path.join(dir, "media", "ui", "styles.css"), "utf8");

    assert.match(styles, /xrayviewer-apple-ui/);
    for (const tone of ["success", "info", "ask", "warning", "error", "progress"]) assert.match(styles, new RegExp(`\\.notice-tone\\.t-${tone}`), tone);
    assert.match(styles, /-apple-system/);
    assert.match(styles, /backdrop-filter: saturate\(1\.8\) blur\(24px\)/);
  });

  test("draws the review page in the reader's theme, before its script runs and in every open tab", async () => {
    const page = await readFile(path.join(dir, "media", "ui", "app.js"), "utf8");
    const styles = await readFile(path.join(dir, "media", "ui", "styles.css"), "utf8");
    const theme = manifest.contributes.configuration.properties["xrayviewer.theme"];

    assert.deepEqual(theme.enum, ["system", "light", "dark"]);
    assert.equal(theme.default, "system");
    assert.equal(Object.keys(manifest.contributes.configuration.properties)[0], "xrayviewer.theme", "the theme leads the settings");
    assert.ok(manifest.contributes.commands.some((c: { command: string; title: string }) => c.command === "xrayviewer.chooseTheme" && c.title === "Choose Theme…"));
    assert.ok(bundle.includes('registerCommand("xrayviewer.chooseTheme",()=>xrvCursor().chooseTheme(C))'));
    assert.ok(bundle.includes(`return pf(this.template.replace('<html lang="en">',()=>xrvCursor().themeTag(ee)),`), "the page opens with its theme on <html>");
    assert.ok(bundle.includes('m.affectsConfiguration("xrayviewer.theme")&&o.notifyTheme()'), "changing the setting repaints every open review");
    assert.ok(bundle.includes('for(let p of this.xrvPanels||[])p.webview.postMessage(m)'), "including the Home tab, which has no pull request");
    assert.ok(bundle.includes('else if(e.type==="setTheme")xrvCursor().saveTheme(ee,e.theme)'), "the page's menu saves the setting");
    assert.match(page, /if \(m\.type === "host-theme"\) \{ setTheme\(m\.theme, true\); return; \}/);
    assert.ok(bundle.includes('setTheme(theme) { vscode.postMessage({ type: "setTheme", key, theme }); },'), "the page can reach the setting");
    assert.match(page, /"theme-pick": \(el\) => pickTheme\(el\.dataset\.theme\)/);
    assert.ok(page.includes('signal.addEventListener("abort", () => themeWatch.disconnect(), { once: true });'), "a restart stops the old observer");
    assert.equal(page.includes("hostTheme.disconnect"), false);
    assert.equal(page.includes("cycleTheme"), false);
    assert.equal(/prefers-color-scheme/.test(styles.slice(styles.indexOf("xrayviewer-apple-ui"))), false, "the chrome reads data-theme, never the system's scheme");
    assert.match(styles, /:root\[data-contrast="more"\]\[data-theme="dark"\]/);
    assert.match(styles, /body\.vscode-reduce-motion \*/);
  });

  test("says where X-RayViewer's review stands on each sidebar row and its hover card", () => {
    const source = bundle.slice(bundle.indexOf("function xrvAgentState("), bundle.indexOf("function bf("));
    const jn = (agent: any, summary: any) => (!agent ? { state: "none" } : { state: summary?.headRefOid && summary.headRefOid !== agent.commit ? "behind" : "current", commit: agent.commit, ranAt: agent.ranAt });
    const fa = (n: any) => ({ text: n.run.state === "queued" ? "agents queued" : "agents in 30s" });
    const ht = () => "3 hours ago";
    const state = new Function("jn", "fa", "ht", `${source}; return xrvAgentState;`)(jn, fa, ht);
    const agent = { commit: "a9dca66f00", ranAt: "2026-10-21T09:00:00Z", findings: [{}, {}, {}] };
    const row = (run: Record<string, unknown>, extra: Record<string, unknown> = {}) => state({ run, summary: { headRefOid: "a9dca66f00" }, ...extra });

    assert.deepEqual(row({ state: "idle" }), { short: "Not reviewed", long: "Not reviewed yet.", color: "#9AA0A6", flag: "never" });
    assert.deepEqual(row({ state: "done" }, { agent }), { short: "Reviewed, not posted, 3 findings", long: "Reviewed a9dca66 3 hours ago: 3 findings. Not posted to GitHub yet.", color: "#E2C08D", flag: "reviewed" });
    const posted = { ...agent, postedAt: "2026-10-21T10:00:00Z" };
    assert.deepEqual(row({ state: "done" }, { agent: posted }), { short: "Reviewed & posted, 3 findings", long: "Reviewed a9dca66 3 hours ago: 3 findings. Posted to GitHub 3 hours ago.", color: "#3FB950", flag: "posted" });
    assert.equal(row({ state: "done" }, { agent, summary: { headRefOid: "b000000" } }).short, "Reviewed, new commits");
    assert.equal(row({ state: "done" }, { agent, summary: { headRefOid: "b000000" } }).flag, "reviewed");
    assert.equal(row({ state: "done" }, { agent: posted, summary: { headRefOid: "b000000" } }).short, "Reviewed & posted, new commits");
    assert.equal(row({ state: "done" }, { agent: posted, summary: { headRefOid: "b000000" } }).flag, "posted");
    assert.ok(bundle.includes("sf=n=>n?{commit:n.commit,ranAt:n.ranAt,postedAt:n.postedAt||null,"), "the sidebar keeps when the review was posted");
    assert.ok(bundle.includes("if(!r&&(c?.results||[]).some(x=>x&&x.ok)){let ag=await this.store.readAgent(e)"), "posting to GitHub marks the agent review as posted");
    assert.ok(bundle.includes('["posted","Reviewed & Posted PRs"]'), "posted reviews have their own group");
    assert.ok(
      bundle.includes('return f==="ongoing"?{badge:"\\u25cf",tooltip:"Reviewing"}:f==="posted"?{badge:"\\u2713",tooltip:"Reviewed and posted by X-RayViewer"}:f==="reviewed"?{badge:"\\u2713",tooltip:"Reviewed by X-RayViewer, not posted yet"}:void 0}'),
      "a dot while reviewing, a check once reviewed, nothing before; no color, because a decoration's color also paints the row's title",
    );
    assert.equal(row({ state: "running", progress: { agents: { a: { state: "done" }, b: { state: "running" }, c: { state: "skipped" } } } }).short, "Reviewing 1/2");
    assert.equal(row({ state: "running" }).flag, "ongoing");
    assert.equal(row({ state: "queued" }).short, "Reviewing, queued");
    assert.equal(row({ state: "running", progress: { agents: { a: { state: "queued" }, b: { state: "queued" } } } }).short, "Paused, waiting for an agent");
    assert.ok(bundle.includes("canSelectMany:!0"), "the sidebar can select several pull requests");
    assert.ok(bundle.includes("r.checkboxState=xrvCursor().isChecked(i)?1:0"), "each pull request has a checkbox");
    assert.ok(bundle.includes("onDidChangeCheckboxState"), "checking a box selects that pull request");
    assert.equal(bundle.includes('"☑"'), false);
    assert.equal(bundle.includes("xrayviewer.toggleCheck"), false, "the row's checkbox is its only select control");
    assert.equal(JSON.stringify(manifest).includes("xrayviewer.toggleCheck"), false);
    assert.equal(bundle.includes("n.xrvGo"), false, "selection commands do not add a property to the frozen extension context");
    assert.ok(bundle.includes("let xrvGo="), "the selection commands share one local function");
    assert.ok(bundle.includes("xrayviewer.openSelected"), "the selection opens in tabs");
    assert.ok(bundle.includes('registerWebviewViewProvider("xrayviewer.selectionButtons"'), "the selection actions are buttons under the list");
    assert.ok(bundle.includes('registerWebviewViewProvider("xrayviewer.agentActivity"'), "agent activity has its own sidebar panel");
    assert.ok(bundle.includes("publishActivity"), "the open pull request's activity is sent to that panel");
    assert.ok(bundle.includes('executeCommand("xrayviewer.agentActivity.focus")'), "the review page opens the sidebar panel");
    assert.ok(bundle.includes('["never","Not Reviewed PRs"]'), "review groups say which pull requests they hold");
    assert.ok(bundle.includes('label:"Requested PRs"'), "relationship groups name the pull requests");
    assert.equal(manifest.contributes.views.xrayviewer.find((view: { id: string; name: string }) => view.id === "xrayviewer.pullRequests").name, "Pull Requests");
    assert.equal(manifest.contributes.views.xrayviewer.find((view: { id: string; name: string }) => view.id === "xrayviewer.agentActivity").name, "Agent Activity");
    assert.deepEqual(
      manifest.contributes.views.xrayviewer.map((view: { id: string; name: string }) => view.name),
      ["Pull Requests", "Selection", "Ongoing Reviews", "Agent Activity"],
      "the selection buttons sit right under the list, then Ongoing Reviews, then Agent Activity",
    );
    assert.ok(manifest.contributes.viewsWelcome.some((item: { view: string }) => item.view === "xrayviewer.running"), "an empty Ongoing Reviews says what shows there");
    assert.ok(
      manifest.contributes.menus["view/title"].some((item: { command: string; when: string }) => item.command === "xrayviewer.refreshOngoing" && item.when === "view == xrayviewer.running"),
      "Ongoing Reviews has a refresh button",
    );
    assert.ok(
      manifest.contributes.menus["view/title"].some((item: { command: string; when: string }) => item.command === "xrayviewer.stopOngoing" && item.when === "view == xrayviewer.running && xrayviewer.ongoingCanStop"),
      "Ongoing Reviews has a stop button while a review is running",
    );
    assert.ok(bundle.includes("xrvFront===i.toLowerCase()"), "the pull request in front is highlighted in the list");
    assert.ok(bundle.includes('typeof m.key==="string"&&!m.record?Re(m.key)'), "Stop on an Ongoing Reviews row stops that review");
    assert.ok(bundle.includes("xrvCursor().bindRunningView({vscode:C,records:()=>r.all(),"), "Running Reviews reads every pull request's run");
    assert.ok(bundle.includes('setContext","xrayviewer.hasPullRequests"'), "the buttons stay hidden until the list has pull requests");
    assert.equal(bundle.includes('badge:"\\u2013"'), false, "a row that was never reviewed has no mark");
    assert.ok(bundle.includes("r=new oe.TreeItem(s?.title??i,"), "the row leads with the title");
    assert.ok(bundle.includes('r.iconPath=new oe.ThemeIcon(xrvIcon,e.risk?.level==="high"?new oe.ThemeColor("charts.red"):e.risk?.level==="medium"?new oe.ThemeColor("charts.yellow"):void 0)'), "one icon: its shape is the state, its color the risk");
    assert.ok(bundle.includes('String(e.id).startsWith("repo:")&&(u.iconPath=new oe.ThemeIcon("repo"))'), "a repository heading has a repo icon");
    assert.ok(bundle.includes("l.badge=xrvCursor().sidebarBadge(r.all(),m)"), "the activity bar icon counts review requests");
    assert.ok(bundle.includes("xrvCursor().bindSelectionBar(view)"), "the buttons follow the checks");
    assert.equal(bundle.includes('action:"gap"'), false);
    assert.equal(bundle.includes('f==="action"'), false);
    assert.equal(bundle.includes("xrayviewer.selectionBar"), false);
    assert.equal(bundle.includes("openQuestion"), false);
    assert.ok(bundle.includes("comparePullRequests"), "every group uses the chosen sort");
    assert.equal(bundle.includes('.sort(cd("updated"))'), false);
    assert.ok(bundle.includes("agentUnavailable"), "a busy agent pauses the pull request instead of failing it");
    assert.equal(row({ state: "elsewhere" }).short, "Reviewing in another window");
    assert.deepEqual(row({ state: "failed" }, { agent }), { short: "Review failed", long: "The last review failed. The one before found 3 findings.", color: "#F85149", flag: "reviewed" });
    assert.equal(row({ state: "held", hold: "large" }).long, "Not reviewed yet. Large, so the agents wait for you to press Run.");
    assert.equal(row({ state: "held", hold: "large" }).flag, "never");
    const rowSource = bundle.slice(bundle.indexOf("function xrvAgentState("), bundle.indexOf("function kf("));
    const isOpen = (s: any) => !s?.state || s.state === "OPEN";
    const conflicts = (s: any) => s?.mergeStateStatus === "DIRTY";
    const grayText = new Function("jn", "fa", "ht", "Ai", "yf", "Fv", `${rowSource}; return bf;`)(jn, fa, ht, isOpen, conflicts, () => "");
    const pr = (run: Record<string, unknown>, summary: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
      grayText({ key: { owner: "acme", name: "app", number: 42 }, run, summary: { state: "OPEN", headRefOid: "a9dca66f00", ...summary }, ...extra }, { inRepoGroup: true });
    assert.equal(pr({ state: "idle" }), "#42", "an open, unreviewed row says neither");
    assert.equal(pr({ state: "idle" }, { isDraft: true, mergeStateStatus: "DIRTY" }), "#42 · draft · conflicts");
    assert.equal(pr({ state: "done" }, {}, { agent }), "#42 · Reviewed, not posted, 3 findings");
    assert.equal(pr({ state: "failed" }), "#42 · Review failed", "a failed first review still says so");
    assert.ok(bundle.includes('let xs=xrvAgentState(s);r.appendMarkdown("<b>X-RayViewer</b> \u00B7 "),paint(xs.color,xs.long)'), "the hover card says it in full");
  });

  test("shows X-RayViewer's review state beside the risk pill on the review page", async () => {
    const page = await readFile(path.join(dir, "media", "ui", "app.js"), "utf8");
    const source = page.slice(page.indexOf("function xrayState("), page.indexOf("function xrayPillHTML("));
    const stateOf = (env: Record<string, unknown>) =>
      new Function(...Object.keys(env), `${source}; return xrayState();`)(...Object.values(env));
    const env = { agentProgress: null, agentsRunning: false, AG: null, AGENT_RUN_AT: null, FINDINGS: [], agentsBehind: () => false, ago: () => "3 hours ago", plural: (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}` };
    const ran = { ...env, AG: { commit: "a9dca66f00" }, AGENT_RUN_AT: "2026-10-21T09:00:00Z", FINDINGS: [{}, {}] };

    assert.deepEqual([stateOf(env).kind, stateOf(env).label], ["none", "Not reviewed by X-RayViewer"]);
    assert.deepEqual([stateOf(ran).kind, stateOf(ran).label, stateOf(ran).sub], ["current", "X-RayViewer reviewed", "2 findings"]);
    assert.equal(stateOf(ran).title, "X-RayViewer reviewed a9dca66 3 hours ago: 2 findings. Not posted to GitHub yet.");
    const posted = { ...ran, AG: { commit: "a9dca66f00", postedAt: "2026-10-21T10:00:00Z" } };
    assert.deepEqual([stateOf(posted).kind, stateOf(posted).label, stateOf(posted).title], ["posted", "X-RayViewer reviewed & posted", "X-RayViewer reviewed a9dca66 3 hours ago: 2 findings. Posted to GitHub 3 hours ago."]);
    assert.equal(stateOf({ ...ran, agentsBehind: () => true }).kind, "behind");
    assert.deepEqual(stateOf({ ...ran, agentsRunning: true, agentProgress: { agents: { a: { state: "done" }, b: { state: "running" } } } }).sub, "1/2");
    assert.equal(stateOf({ ...env, agentProgress: { agents: { a: { state: "failed" } } } }).kind, "failed");
    assert.match(page, /riskPillHTML\(currentRisk\(\)\)\}\$\{xrayPillHTML\(\)\}<\/div>/, "the repository shows once, in the bar");
    assert.match(page, /btn\.outerHTML = runMainHTML\(runButtonLabel\); applyXrayPill\(\); \};/, "the pill follows the run as it starts, progresses and ends");
  });

  test("ships a Cursor harness module the bundle can load", () => {
    const harness = createRequire(import.meta.url)(path.join(dir, "dist", "cursor-harness.cjs"));

    assert.equal(typeof harness.createCursorHarness, "function");
    const cursor = harness.createCursorHarness({});
    const view = { title: "", description: "", webview: { html: "" }, onDidDispose() {} };
    cursor.clearChecked();
    cursor.bindSelectionBar(view);
    assert.deepEqual([view.title, view.description], ["Selection", "Check up to 5 pull requests"]);
    assert.match(view.webview.html, /<a role="link" aria-disabled="true">Open selected PRs<\/a>/);
    cursor.setChecked("acme/app#1", true);
    cursor.setChecked("acme/app#2", true);
    assert.deepEqual([view.title, view.description], ["2 selected", ""]);
    assert.match(view.webview.html, /<a href="command:xrayviewer\.openSelected">Open 2 pull requests<\/a>/);
    assert.match(view.webview.html, /<a href="command:xrayviewer\.runSelected">Review 2 and post<\/a>/);
    assert.match(view.webview.html, /--vscode-button-background/);
    cursor.clearChecked();
    assert.equal(view.title, "Selection");
    assert.ok(bundle.includes('require("./cursor-harness.cjs")'));
    assert.ok(bundle.includes("xrvClaude"));
    assert.ok(bundle.includes("xrvCodex"));
  });
});
