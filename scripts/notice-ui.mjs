/**
 * The review page's one banner: a mark for what the line is (done, info, a question, a warning, an error, or work
 * going on), the line, buttons under it when a choice is needed, and Dismiss at the top right.
 * A line with a button stays until that button or Dismiss. A line that only informs hides after a few seconds.
 * Copied into the page as written. It uses the page's `esc`, `icon`, `S`, `NOTICE`, `HOST`, `LIVE_KEY`, and `plural`.
 */

const TONE_ICONS = {
  success: `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="currentColor"/><path d="M6 10.4l2.7 2.6L14.2 7.4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  info: `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="currentColor"/><path d="M10 9.2v5" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="10" cy="6.1" r="1.25" fill="#fff"/></svg>`,
  ask: `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="currentColor"/><path d="M7.6 7.7a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2.9-1.2 1.7v.3" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="14.6" r="1.15" fill="#fff"/></svg>`,
  warning: `<svg viewBox="0 0 20 20"><path d="M8.7 2.8a1.5 1.5 0 0 1 2.6 0l7.4 12.8a1.5 1.5 0 0 1-1.3 2.3H2.6a1.5 1.5 0 0 1-1.3-2.3z" fill="currentColor"/><path d="M10 7.4v4.3" stroke="#1c1c1e" stroke-width="2" stroke-linecap="round"/><circle cx="10" cy="14.5" r="1.15" fill="#1c1c1e"/></svg>`,
  error: `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="currentColor"/><path d="M7 7l6 6M13 7l-6 6" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>`,
  progress: "",
};

/** The page's own lines don't say what they are, so their wording does. */
function toneOf(msg) {
  const text = String(msg || "");
  if (/^Couldn't|^Could not|failed|didn't load/i.test(text)) return "error";
  if (/…$/.test(text)) return "progress";
  if (/^(GitHub only takes|None of the boxes|Write something first|The agents stopped)|Sign in with|no finding landed/.test(text)) return "warning";
  if (/^(Added|Saved|Exported|Copied|Posted|Approved|Draft (saved|deleted)|Chapters|All \d+ hunks|Everything is reviewed|That's the whole flow, and|The agents didn't flag)/.test(text)) return "success";
  return "info";
}

function toneHTML(tone) {
  const kind = Object.prototype.hasOwnProperty.call(TONE_ICONS, tone) ? tone : "info";
  return `<span class="notice-tone t-${kind}" aria-hidden="true">${TONE_ICONS[kind]}</span>`;
}

function bannerHost() {
  return document.getElementById("notice") || document.getElementById("toasts");
}

function bannerHTML(text, actions, flags) {
  const list = actions || [];
  const btns = list.map((action) => {
    const tab = action.tab ? ` data-tab="${esc(action.tab)}"` : "";
    const pick = action.id ? ` data-nid="${esc(action.id)}" data-value="${esc(action.label)}"` : "";
    return `<button type="button" class="notice-btn" data-act="${esc(action.act)}"${tab}${pick}>${esc(action.label)}</button>`;
  }).join("");
  const pin = flags && flags.pin ? ` data-pin="1"` : "";
  const ask = flags && flags.ask ? ` data-ask="${esc(flags.ask)}"` : "";
  const row = btns ? `<div class="notice-actions">${btns}</div>` : "";
  const tone = (flags && flags.tone) || "info";
  return `<div class="notice n-${tone}"${pin}${ask}>${toneHTML(tone)}<div class="notice-body"><span>${text}</span>${row}</div><button type="button" class="icon-btn sm notice-x" data-act="notice-close" aria-label="Dismiss">${icon("x")}</button></div>`;
}

function paintBanner(html, persist) {
  bannerNow = html;
  if (persist) bannerStay = html;
  const host = bannerHost();
  if (!host) return;
  const toasts = document.getElementById("toasts");
  if (toasts && host !== toasts) toasts.replaceChildren();
  clearTimeout(bannerTimer);
  host.innerHTML = html;
  if (persist || !html) return;
  const shown = html;
  bannerTimer = setTimeout(() => {
    const box = bannerHost()?.querySelector(".notice");
    if (!box || box.dataset.pin === "1" || bannerNow !== shown) return;
    box.classList.add("out");
    bannerTimer = setTimeout(() => {
      if (bannerNow !== shown) return;
      bannerNow = bannerStay;
      const next = bannerHost();
      if (next) next.innerHTML = bannerStay;
    }, 250);
  }, 5000);
}

function dropBanner(clearStay) {
  clearTimeout(bannerTimer);
  if (clearStay || !bannerPin) bannerStay = "";
  else bannerStay = bannerPin;
  bannerNow = bannerStay;
  const host = bannerHost();
  if (host) host.innerHTML = bannerStay;
}

function releaseBanner(el) {
  const box = el.closest(".notice");
  if (!box || el.dataset.act === "notice-close" || el.dataset.act === "notice-pick") return;
  if (box.dataset.pin === "1" && el.dataset.act === "live-refresh") return;
  dropBanner(false);
}

function toast(msg, action, tone) {
  paintBanner(bannerHTML(esc(msg), action ? [action] : [], { tone: tone || toneOf(msg) }), !!action);
}

/** Posting reloads the page, so the line saying it worked waits here for the page that comes back. */
function notePosted(event, comments, url) {
  try { localStorage.setItem("xrv:posted", JSON.stringify({ key: LIVE_KEY, event, comments, url: url || "", at: Date.now() })); } catch { /* the post still worked */ }
}

function showPostedNotice() {
  let note = null;
  try {
    note = JSON.parse(localStorage.getItem("xrv:posted") || "null");
    localStorage.removeItem("xrv:posted");
  } catch { return; }
  if (!note || String(note.key || "").toLowerCase() !== LIVE_KEY.toLowerCase() || !(Date.now() - note.at < 120000)) return;
  const head = note.event === "APPROVE" ? "Approved and posted to GitHub" : note.event === "REQUEST_CHANGES" ? "Posted to GitHub, requesting changes" : "Posted your review to GitHub";
  const count = note.comments ? ` with ${plural(note.comments, "comment")}` : "";
  const link = /^https:\/\//.test(note.url) ? ` <a class="link" href="${esc(note.url)}" target="_blank" rel="noopener">Open on GitHub</a>` : "";
  paintBanner(bannerHTML(`${esc(head + count + ".")}${link}`, [], { tone: "success" }), false);
}

function showPinnedNotice() {
  const n = S.notice;
  if (!n || S.noticeHidden || !NOTICE[n.kind]) {
    bannerPin = "";
    if (bannerStay && bannerHost()?.querySelector(".notice")?.dataset.pin === "1") dropBanner(true);
    return;
  }
  bannerPin = bannerHTML(esc(NOTICE[n.kind][1]), [{ act: "live-refresh", label: "Refresh" }], { pin: true, tone: n.kind === "closed" ? "warning" : "info" });
  paintBanner(bannerPin, true);
}

function showHostNotice(m) {
  if (!m || !m.text) {
    dropBanner(false);
    return;
  }
  const buttons = Array.isArray(m.buttons) ? m.buttons.filter((label) => label) : [];
  const actions = buttons.map((label) => ({ act: "notice-pick", label, id: m.id || "" }));
  const given = typeof m.tone === "string" && m.tone ? m.tone : "info";
  const tone = given === "info" && buttons.length ? "ask" : given;
  paintBanner(bannerHTML(esc(m.text), actions, { ask: m.id || "", tone }), buttons.length > 0 || !!m.hold);
}

export function noticeSource() {
  return `const TONE_ICONS = ${JSON.stringify(TONE_ICONS)};\nlet bannerTimer = 0;\nlet bannerPin = "";\nlet bannerNow = "";\nlet bannerStay = "";\n${[bannerHost, toneOf, toneHTML, bannerHTML, paintBanner, dropBanner, releaseBanner, toast, notePosted, showPostedNotice, showPinnedNotice, showHostNotice].map(String).join("\n")}\n`;
}

export const toastFind = "function toast(msg, action) {\n  const host = $(\"#toasts\");\n  if (!host) return;\n  const el = document.createElement(\"div\");\n  el.className = \"toast\";\n  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type=\"button\" class=\"toast-btn\" data-act=\"${action.act}\"${action.tab ? ` data-tab=\"${action.tab}\"` : \"\"}>${esc(action.label)}</button>` : \"\"}`;\n  host.append(el);\n  while (host.children.length > 3) host.firstElementChild.remove();\n  setTimeout(() => { el.classList.add(\"out\"); setTimeout(() => el.remove(), 300); }, action ? 5200 : 2800);\n}\n";
export const noticeFind = "function noticeHTML() {\n  const n = S.notice;\n  if (!n || S.noticeHidden || !NOTICE[n.kind]) return \"\";\n  const [ic, text] = NOTICE[n.kind];\n  return `<div class=\"notice n-${n.kind}\">${icon(ic)}<span>${text}</span>\n    <button type=\"button\" class=\"notice-btn\" data-act=\"live-refresh\">Refresh</button>\n    <button type=\"button\" class=\"icon-btn sm\" data-act=\"notice-close\" aria-label=\"Dismiss\">${icon(\"x\")}</button></div>`;\n}\n\nfunction showChange(m) {\n  if (!m.change || !NOTICE[m.change.kind] || String(m.key || \"\").toLowerCase() !== LIVE_KEY.toLowerCase()) return;\n  S.notice = m.change;\n  S.noticeHidden = false;\n  const el = $(\"#notice\");\n  if (el) el.innerHTML = noticeHTML();\n  // An open confirm to post now says the pull request is merged or closed.\n  if (S.pushConfirm) refreshPushFoot();\n}";
export const noticeReplace = "function noticeHTML() {\n  return bannerNow;\n}\n\nfunction showChange(m) {\n  if (!m.change || !NOTICE[m.change.kind] || String(m.key || \"\").toLowerCase() !== LIVE_KEY.toLowerCase()) return;\n  S.notice = m.change;\n  S.noticeHidden = false;\n  showPinnedNotice();\n  if (S.pushConfirm) refreshPushFoot();\n}";
