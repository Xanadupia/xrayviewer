/**
 * The review page's chrome: one flush top bar that carries what the strip above it used to (saved state, Refresh,
 * GitHub), a header that ends at the tabs, a hairline in the bar that fills as hunks are reviewed, and agent findings
 * grouped by severity. Copied into the page as written. It uses the page's `$`, `esc`, `icon`, `inline`, `S`, `LIVE`,
 * `PENDING`, `FIND`, `SEV`, `files`, `counts`, `stages`, `flowSummary`, `findingState`, `liveSync` and `liveSyncError`.
 */

const SAVED_TIP = "Comments stay on this machine until you post them.";

function syncHTML() {
  if (liveSync === "error") return `<span class="sync sync-error" id="sync" role="alert" title="${esc(liveSyncError)}">${icon("alert")}<span>Couldn't save</span></span>`;
  const saving = liveSync === "saving";
  return `<span class="sync sync-${liveSync}" id="sync" title="${SAVED_TIP}">${saving ? '<span class="spin" aria-hidden="true"></span>' : icon("check")}<span>${saving ? "Saving…" : "Saved locally"}</span></span>`;
}

function ribbonHTML() {
  if (LIVE.github) return "";
  return `<div class="ribbon ribbon-warn" id="ribbon" role="status">${icon("alert")}<span class="ribbon-text"><b>GitHub isn't connected.</b> Run <code>gh auth login</code> in a terminal, then refresh.</span><button type="button" class="link" data-act="live-refresh">Refresh</button></div>`;
}

/** The bar's path-to-merge label without the stage name twice: "Review required", not "Review: Review required". */
function miniLabel() {
  const p = LIVE.pr || {};
  const cur = p.state === "MERGED" || p.state === "CLOSED" ? null : stages().find((s) => s.st !== "done");
  if (!cur) return flowSummary();
  return String(cur.caption).toLowerCase().startsWith(cur.name.toLowerCase()) ? cur.caption : `${cur.name}: ${cur.caption}`;
}

let barDone = -1;

function reviewedShare() {
  const c = counts();
  return PENDING || !c.all ? 0 : c.reviewed / c.all;
}

/** Drawn at the share last shown, then moved to the current one, so the bar redrawing doesn't skip the fill. */
function progressLineHTML() {
  const from = barDone < 0 ? reviewedShare() : barDone;
  return `<span class="bar-progress${from >= 1 ? " is-done" : ""}" id="bar-progress" style="--done:${from}" aria-hidden="true"></span>`;
}

function paintProgress() {
  const el = $("#bar-progress");
  if (!el) return;
  const share = reviewedShare();
  barDone = share;
  requestAnimationFrame(() => {
    el.style.setProperty("--done", String(share));
    el.classList.toggle("is-done", share >= 1);
  });
}

const LOW_SHOWN = 4;

function briefItemHTML(x) {
  const st = findingState(x);
  const mark = st === "open"
    ? `<span class="bi-mark is-open">${icon("arrow")}</span>`
    : st === "accepted"
      ? `<span class="bi-mark is-in" title="In your review">${icon("check-circle")}<span class="sr-only">In your review</span></span>`
      : `<span class="bi-mark is-out" title="Dismissed">${icon("x-circle")}<span class="sr-only">Dismissed</span></span>`;
  return `<li><button type="button" class="brief-item is-${st} sev-row-${x.severity}" data-act="go-finding" data-id="${x.id}">
      <span class="bi-title">${inline(x.title)}</span><span class="bi-where mono" title="${esc(files[x.f].path)}:${x.k.slice(1)}">${esc(files[x.f].base)}:${x.k.slice(1)}</span>${mark}</button></li>`;
}

/** High first. Low findings past the first few fold behind a button when there are others to read first. */
function briefItemsHTML() {
  const groups = Object.keys(SEV).map((sev) => [sev, FIND.filter((x) => x.severity === sev)]).filter(([, xs]) => xs.length);
  return groups.map(([sev, xs]) => {
    const open = xs.filter((x) => findingState(x) === "open").length;
    const fold = groups.length > 1 && sev === "low" && xs.length > LOW_SHOWN + 2 && !S.lowOpen;
    const shown = fold ? xs.slice(0, LOW_SHOWN) : xs;
    const more = fold ? `<button type="button" class="bi-more" data-act="brief-low">Show ${xs.length - LOW_SHOWN} more low findings</button>` : "";
    const tally = open === xs.length ? String(xs.length) : open ? `${open} of ${xs.length} open` : `${xs.length}, all decided`;
    return `<section class="bi-group bi-${sev}" aria-label="${SEV[sev]} findings"><h3 class="bi-head"><span class="bi-sev"><span class="bi-dot" aria-hidden="true"></span>${SEV[sev]}</span><span class="bi-count">${tally}</span></h3>
      <ol class="bi-list">${shown.map(briefItemHTML).join("")}</ol>${more}</section>`;
  }).join("");
}

function hasShownText(el) {
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (n.data.trim() && !n.parentElement.closest(".sr-only, [aria-hidden='true']") && n.parentElement.checkVisibility()) return true;
  }
  return false;
}

/** An icon-only control shows its accessible name on hover. Set on the way in, so it covers every control the page draws. */
function tipOnHover(e) {
  const el = e.target instanceof Element ? e.target.closest("button, a[href], summary, [role='button']") : null;
  const label = el && el.getAttribute("aria-label");
  if (!label || (el.title && !("tip" in el.dataset)) || hasShownText(el)) return;
  el.title = label;
  el.dataset.tip = "";
}

export function chromeSource() {
  return `const SAVED_TIP = ${JSON.stringify(SAVED_TIP)};\nconst LOW_SHOWN = ${LOW_SHOWN};\nlet barDone = -1;\n${[syncHTML, ribbonHTML, miniLabel, reviewedShare, progressLineHTML, paintProgress, briefItemHTML, briefItemsHTML, hasShownText, tipOnHover].map(String).join("\n")}\n`;
}

export const CHROME_NAMES = ["SAVED_TIP", "miniLabel", "barDone", "reviewedShare", "progressLineHTML", "paintProgress", "LOW_SHOWN", "briefItemHTML", "briefItemsHTML", "lowOpen", "hasShownText", "tipOnHover"];

export const CHROME_PATCHES = [
  {
    id: "chrome-ribbon",
    find:
      "function syncHTML() {\n" +
      '  const text = liveSync === "error" ? `Couldn\'t save: ${liveSyncError}` : liveSync === "saving" ? "Saving…" : "Saved on this machine";\n' +
      '  return `<span class="sync sync-${liveSync}" id="sync">${esc(text)}</span>`;\n' +
      "}\n" +
      "\n" +
      "function ribbonHTML() {\n" +
      '  return `<div class="ribbon ribbon-live" id="ribbon"><span class="ribbon-tag">Local</span>\n' +
      '      <span class="ribbon-text">${S.view === "inbox" ? "Your pull requests" : S.view === "metrics" ? "Your review metrics" : `${esc(LIVE.repo)} #${LIVE.number}`}${LIVE.github ? "" : ` · <b>GitHub isn\'t connected.</b> Run <code>gh auth login</code>, then refresh.`}<span class="long"> · Drafts stay on this machine until you post them.</span></span>\n' +
      '    ${S.view !== "pr" ? "" : syncHTML()}\n' +
      '    <button type="button" class="link" data-act="live-refresh">Refresh</button>\n' +
      '      ${S.view !== "pr" ? "" : `<a class="link" href="${esc(LIVE.url)}" target="_blank" rel="noopener">GitHub</a>`}</div>`;\n' +
      "}\n",
    replace: chromeSource(),
  },
  {
    id: "chrome-bar-sync",
    find: '    <div class="bar-end">\n',
    replace: '    <div class="bar-end">\n      ${pr ? syncHTML() : ""}\n',
  },
  {
    id: "chrome-bar-label",
    find: '<span class="mini-label">${esc(flowSummary())}</span>',
    replace: '<span class="mini-label">${esc(miniLabel())}</span>',
  },
  {
    id: "chrome-bar-actions",
    find: 'title="Jump to file (F)">${icon("search")}</button>` : ""}\n',
    replace:
      'title="Jump to file (F)">${icon("search")}</button>` : ""}\n' +
      '      <button type="button" class="icon-btn" data-act="live-refresh" aria-label="Refresh from GitHub" title="Refresh from GitHub">${icon("reset")}</button>\n' +
      '      ${pr && LIVE.url ? `<a class="icon-btn" href="${esc(LIVE.url)}" target="_blank" rel="noopener" aria-label="Open on GitHub" title="Open on GitHub">${icon("external")}</a>` : ""}\n',
  },
  {
    id: "chrome-bar-progress",
    find: '      ${avatar("you")}\n    </div>\n  </header>`;',
    replace: '      ${avatar("you")}\n    </div>\n    ${pr ? progressLineHTML() : ""}\n  </header>`;',
  },
  {
    id: "chrome-head-once",
    find: '<span class="mono dim">${esc(PR.repo)} #${PR.number}</span></div>',
    replace: "</div>",
  },
  {
    id: "chrome-head-no-track",
    find: '    ${trackHTML(ss)}\n    <p class="track-sum">${trackSumHTML(cur)}</p>\n',
    replace: "",
  },
  {
    id: "chrome-progress-render",
    find: "  mountDiagrams();\n  refreshTour();\n  onScroll();\n  // The report is read fresh",
    replace: "  mountDiagrams();\n  refreshTour();\n  onScroll();\n  paintProgress();\n  // The report is read fresh",
  },
  {
    id: "chrome-progress-chrome",
    find: '  replaceHTML("#bar", topbarHTML());\n  replaceHTML("#pr-head", prHeadHTML());\n  replaceHTML("#dock", dockHTML());',
    replace: '  replaceHTML("#bar", topbarHTML());\n  replaceHTML("#pr-head", prHeadHTML());\n  replaceHTML("#dock", dockHTML());\n  paintProgress();',
  },
  {
    id: "chrome-progress-flow",
    find: 'function refreshFlow() {\n  if (S.view !== "pr") return;\n  replaceHTML("#bar", topbarHTML());',
    replace: 'function refreshFlow() {\n  if (S.view !== "pr") return;\n  replaceHTML("#bar", topbarHTML());\n  paintProgress();',
  },
  {
    id: "chrome-done-moment",
    find:
      "function celebrateIfDone() {\n" +
      "  const c = counts();\n" +
      '  if (!c.todo) toast(`All ${c.all} hunks reviewed.`, { act: "finish", label: "Finish review" });\n' +
      "}",
    replace:
      "function celebrateIfDone() {\n" +
      "  const c = counts();\n" +
      "  if (c.todo) return;\n" +
      '  toast(`All ${c.all} hunks reviewed.`, { act: "finish", label: "Post review" }, "success");\n' +
      '  const bar = $("#bar");\n' +
      '  if (bar) { bar.classList.remove("just-done"); void bar.offsetWidth; bar.classList.add("just-done"); }\n' +
      "}",
  },
  {
    id: "chrome-findings-grouped",
    find:
      "  const items = FIND.map((x) => {\n" +
      "    const st = findingState(x);\n" +
      '    return `<li><button type="button" class="brief-item is-${st}" data-act="go-finding" data-id="${x.id}">\n' +
      '      <span class="sev sev-${x.severity}">${SEV[x.severity]}</span><span class="bi-title">${inline(x.title)}</span>\n' +
      '      <span class="bi-where mono">${esc(files[x.f].base)}:${x.k.slice(1)}</span>\n' +
      '      <span class="bi-state">${st === "open" ? icon("arrow") : st === "accepted" ? "In your review" : "Dismissed"}</span></button></li>`;\n' +
      '  }).join("");',
    replace: "  const items = briefItemsHTML();",
  },
  {
    id: "chrome-findings-list",
    find: '<ol class="brief-list">${items}</ol>',
    replace: '<div class="brief-list">${items}</div>',
  },
  {
    id: "chrome-findings-more",
    find: '"go-finding": (el) => goFinding(el.dataset.id),',
    replace:
      '"go-finding": (el) => goFinding(el.dataset.id),\n' +
      '  "brief-low": () => { S.lowOpen = true; replaceHTML("#brief", briefHTML()); const next = $$("#brief .bi-low .brief-item")[LOW_SHOWN]; if (next) next.focus(); },',
  },
  {
    id: "chrome-reduce-motion",
    find: 'const reduced = mq("(prefers-reduced-motion: reduce)");',
    replace: 'const reduced = { get matches() { return mq("(prefers-reduced-motion: reduce)").matches || document.body.classList.contains("vscode-reduce-motion"); } };',
  },
  {
    id: "chrome-tips",
    find: 'document.addEventListener("input", (e) => {',
    replace: 'document.addEventListener("pointerover", tipOnHover, { signal });\n\ndocument.addEventListener("input", (e) => {',
  },
];
