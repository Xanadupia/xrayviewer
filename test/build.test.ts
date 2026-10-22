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

  test("is X-RayView by Ali Qaryan, with its own id", async () => {
    assert.equal(manifest.name, "xrayviewer");
    assert.equal(manifest.displayName, "X-RayViewer");
    assert.equal(manifest.publisher, "aliqaryan");
    assert.equal(manifest.author, "Ali Qaryan");
    assert.equal(manifest.version, "0.4.2");
    const page = await readFile(path.join(dir, "media", "ui", "app.js"), "utf8");
    assert.match(page, /function modelSummary\(agents\)/);
    assert.match(page, /Update review/);
    assert.match(page, /Choose model/);
    assert.match(page, /X-RayView/);
    assert.match(page, /choose-model/);
    assert.ok(bundle.includes('type==="chooseHarness"'));
    assert.match(page, /id="host-run-wrap">\$\{runMainHTML\(label\)\}[\s\S]*?data-act="run-menu"[\s\S]*?id="run-menu" role="menu"[^>]*hidden>\$\{chooseModelHTML\(\)\}\$\{activityItemHTML\(\)\}<\/div><\/div>/, "Choose model and Agent activity sit in the run button's menu");
    assert.match(page, /role="menuitem" class="menu-item" id="choose-model" data-act="choose-model"/);
    assert.match(page, /"run-menu": \(\) => runMenu\(!runMenuOpen\(\)\)/);
    assert.match(page, /if \(runMenuOpen\(\) && !e\.target\.closest\("#host-run-wrap"\)\) runMenu\(false\);/);
    assert.equal(page.includes("${chooseModelHTML()}</header>"), false, "no separate Choose model button");
    assert.match(page, /m\.type === "host-model"/);
    assert.match(page, /<ol class="brief-list">\$\{items\}<\/ol>\$\{adoptAllHTML\(\)\}/, "the briefing offers to add every open finding");
    assert.match(page, /\$\{icon\("plus"\)\}Add to my review<\/button>\$\{adoptAllCardHTML\(\)\}/, "each finding card also offers to add them all");
    assert.match(page, /function refreshChrome\(\) \{\n {2}if \(S\.view !== "pr"\) return;\n {2}syncAdoptAll\(\);/, "the cards' counts follow every decision");
    assert.match(page, /function findingDrafts\(findings, page\)/);
    assert.match(page, /"adopt-all": \(\) => adoptAll\(\),\n {2}"adopt-all-undo": \(\) => undoAdoptAll\(\),/);
    assert.match(page, /\{ act: "adopt-all-undo", label: "Undo" \}/);
    assert.match(page, /function activityHTML\(progress, plan, view\)/);
    assert.match(page, /"agent-activity": \(\) => openActivity\(\),\n {2}"activity-detail": \(el\) => showActivity\(el\.dataset\.id\),\n {2}"activity-back": \(\) => showActivity\(""\),/);
    assert.match(page, /avatar: agentAv\("xs"\), now: Date\.now\(\), open: activityOpen, detail: activityDetail/);
    assert.match(page, /data-act="agent-activity" title="See what each agent is doing"><span class="spin"/, "the running button opens the activity");
    assert.match(page, /id="post-all"/, "a checkbox beside Run posts every finding when that run finishes");
    assert.match(page, /Post all findings when finished/);
    assert.match(page, /if \(postAllOn\(\) && agentsRunning && !m\.automatic\) armPostAll\(\);/, "a manual run arms posting, including one started from the model picker");
    assert.match(page, /if \(on && agentsRunning && live\) armPostAll\(\);/, "checking the box during a run posts that run");
    assert.match(page, /m\.state === "done" && typeof HOST\.reload === "function"\) HOST\.reload\(\);/, "a finished armed run reloads so the new findings are on the page");
    assert.match(page, /S\.pushDecision = "comment";\n\s+openFinish\(\);\n\s+S\.pushConfirm = true;/, "the finished run posts the findings as comments");
    assert.match(page, /if \(open\.length\) adoptAll\(true\);/);
    assert.match(page, /if \(t\.id === "post-all"\) setPostAll\(!!t\.checked\);/);
    assert.match(page, /watchActivity\(\);\nmaybePostAll\(\);/);
    assert.match(page, /function onHostRun\(m\) \{\n {2}const was = agentsRunning;\n {2}agentsRunning = !!m\.running;\n {2}if \(m\.state\) runState = m\.state;\n {2}if \(m\.progress\) agentProgress = m\.progress;\n {2}applyRunButton\(\);\n {2}refreshActivity\(\);/);
    assert.ok(bundle.includes('progress:r?.progress??null'), "the host posts each agent's steps with the run state");
    assert.ok(bundle.includes('state:s||"idle",automatic:!!r?.automatic'), "the page can tell a finished manual run from one that was stopped");
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
    assert.ok(bundle.includes('xrayviewer.filter'));
    assert.equal(bundle.includes('xrayviewer.filterAuthor'), false);
    assert.equal(bundle.includes('xrayviewer.filterStatus'), false);
    assert.equal(manifest.contributes.configuration.properties["xrayviewer.sidebar.status"].items.enum.includes("merged"), true);
    assert.ok(bundle.includes('groupBy==="author"'));
    assert.equal(bundle.includes("circle-small-filled"), false);
    await readFile(path.join(dir, "media", "risk", "open-low.svg"));
    assert.equal(manifest.contributes.configuration.properties["xrayviewer.sidebar.groupBy"].enum.includes("author"), true);
    assert.match(page, /M8\.5 8\.5l7 7/);
    assert.equal(page.includes("M1.5 8h27"), false);
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
    assert.ok(manifest.files.includes("docs"));
    const guide = await readFile(path.join(dir, "readme.md"), "utf8");
    assert.match(guide, /docs\/review-path\.png/);
    assert.match(guide, /docs\/review-page\.png/);
    await readFile(path.join(dir, "docs", "review-path.png"));
    await readFile(path.join(dir, "docs", "review-page.png"));
    await assert.rejects(readFile(path.join(dir, "docs", "index.html")), "the website stays out of the package");
  });

  test("offers Cursor as a harness with its settings, and restricts the ones that choose a program", () => {
    const properties = manifest.contributes.configuration.properties;
    const keys = Object.keys(properties);

    assert.deepEqual(properties["xrayviewer.harness"].enum, ["claude", "codex", "pi", "cursor"]);
    assert.equal(properties["xrayviewer.harness"].enumDescriptions.length, 4);
    assert.equal(properties["xrayviewer.cursor.path"].default, "cursor-agent");
    assert.equal(properties["xrayviewer.cursor.path"].scope, "machine");
    assert.equal(properties["xrayviewer.cursor.extraArgs"].scope, "machine");
    assert.equal(properties["xrayviewer.cursor.model"].default, "");
    assert.equal(keys.indexOf("xrayviewer.cursor.path"), keys.indexOf("xrayviewer.pi.extraArgs") + 1);
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
    assert.match(styles, /-apple-system/);
    assert.match(styles, /backdrop-filter: saturate\(1\.8\) blur\(28px\)/);
  });

  test("says where X-RayView's review stands on each sidebar row and its hover card", () => {
    const source = bundle.slice(bundle.indexOf("function xrvAgentState("), bundle.indexOf("function bf("));
    const jn = (agent: any, summary: any) => (!agent ? { state: "none" } : { state: summary?.headRefOid && summary.headRefOid !== agent.commit ? "behind" : "current", commit: agent.commit, ranAt: agent.ranAt });
    const fa = (n: any) => ({ text: n.run.state === "queued" ? "agents queued" : "agents in 30s" });
    const ht = () => "3 hours ago";
    const state = new Function("jn", "fa", "ht", `${source}; return xrvAgentState;`)(jn, fa, ht);
    const agent = { commit: "a9dca66f00", ranAt: "2026-10-21T09:00:00Z", findings: [{}, {}, {}] };
    const row = (run: Record<string, unknown>, extra: Record<string, unknown> = {}) => state({ run, summary: { headRefOid: "a9dca66f00" }, ...extra });

    assert.deepEqual(row({ state: "idle" }), { short: "not reviewed", long: "Not reviewed yet.", color: "#9AA0A6" });
    assert.deepEqual(row({ state: "done" }, { agent }), { short: "\u2713 reviewed, 3 findings", long: "Reviewed a9dca66 3 hours ago: 3 findings.", color: "#3FB950" });
    assert.equal(row({ state: "done" }, { agent, summary: { headRefOid: "b000000" } }).short, "reviewed, new commits");
    assert.equal(row({ state: "running", progress: { agents: { a: { state: "done" }, b: { state: "running" }, c: { state: "skipped" } } } }).short, "reviewing 1/2");
    assert.equal(row({ state: "queued" }).short, "review queued");
    assert.equal(row({ state: "elsewhere" }).short, "reviewing in another window");
    assert.deepEqual(row({ state: "failed" }, { agent }), { short: "review failed", long: "The last review failed. The one before found 3 findings.", color: "#F85149" });
    assert.equal(row({ state: "held", hold: "large" }).long, "Not reviewed yet. Large, so the agents wait for you to press Run.");
    assert.ok(bundle.includes("return[state,xrvAgentState(n,t).short,"), "every row's description carries the state");
    assert.ok(bundle.includes('let xs=xrvAgentState(s);r.appendMarkdown("<b>X-RayView</b> \u00B7 "),paint(xs.color,xs.long)'), "the hover card says it in full");
  });

  test("shows X-RayView's review state beside the risk pill on the review page", async () => {
    const page = await readFile(path.join(dir, "media", "ui", "app.js"), "utf8");
    const source = page.slice(page.indexOf("function xrayState("), page.indexOf("function xrayPillHTML("));
    const stateOf = (env: Record<string, unknown>) =>
      new Function(...Object.keys(env), `${source}; return xrayState();`)(...Object.values(env));
    const env = { agentProgress: null, agentsRunning: false, AG: null, AGENT_RUN_AT: null, FINDINGS: [], agentsBehind: () => false, ago: () => "3 hours ago", plural: (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}` };
    const ran = { ...env, AG: { commit: "a9dca66f00" }, AGENT_RUN_AT: "2026-10-21T09:00:00Z", FINDINGS: [{}, {}] };

    assert.deepEqual([stateOf(env).kind, stateOf(env).label], ["none", "Not reviewed by X-RayView"]);
    assert.deepEqual([stateOf(ran).kind, stateOf(ran).label, stateOf(ran).sub], ["current", "X-RayView reviewed", "2 findings"]);
    assert.equal(stateOf(ran).title, "X-RayView reviewed a9dca66 3 hours ago: 2 findings.");
    assert.equal(stateOf({ ...ran, agentsBehind: () => true }).kind, "behind");
    assert.deepEqual(stateOf({ ...ran, agentsRunning: true, agentProgress: { agents: { a: { state: "done" }, b: { state: "running" } } } }).sub, "1/2");
    assert.equal(stateOf({ ...env, agentProgress: { agents: { a: { state: "failed" } } } }).kind, "failed");
    assert.match(page, /riskPillHTML\(currentRisk\(\)\)\}\$\{xrayPillHTML\(\)\}<span class="mono dim">/);
    assert.match(page, /btn\.outerHTML = runMainHTML\(runButtonLabel\); applyXrayPill\(\); \};/, "the pill follows the run as it starts, progresses and ends");
  });

  test("ships a Cursor harness module the bundle can load", () => {
    const harness = createRequire(import.meta.url)(path.join(dir, "dist", "cursor-harness.cjs"));

    assert.equal(typeof harness.createCursorHarness, "function");
    assert.ok(bundle.includes('require("./cursor-harness.cjs")'));
    assert.ok(bundle.includes("xrvClaude"));
    assert.ok(bundle.includes("xrvCodex"));
  });
});
