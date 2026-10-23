/**
 * Moving through the review one item at a time. "Next agent finding" follows the findings list and keeps its place
 * when the finding it's on gets decided. The hunk keys (j, k, n, r, c) and the Next button start from the focused hunk
 * only while it's on screen, so after a click or a scroll takes the reader elsewhere they pick up from what's in view.
 * Copied into the page as written. It uses the page's `S`, `FIND`, `SEV`, `toast`, `goFinding`, `findingState`, `hunkEl`
 * and `stickyOffset`.
 */

/** The findings list's order: high, then medium, then low, each in the agents' order. */
function findingOrder() {
  return Object.keys(SEV).flatMap((sev) => FIND.filter((x) => x.severity === sev));
}

function nextFinding() {
  const order = findingOrder();
  if (!order.length) { toast("The agents didn't flag anything."); return; }
  const from = order.findIndex((x) => x.id === S.lastFinding);
  const ahead = [...order.slice(from + 1), ...order.slice(0, from + 1)];
  goFinding((ahead.find((x) => findingState(x) === "open") || ahead[0]).id);
}

function liveFocus() {
  const el = S.focus ? hunkEl(S.focus) : null;
  const r = el && el.getBoundingClientRect();
  if (r && r.bottom > stickyOffset(true) && r.top < window.innerHeight) return S.focus;
  if (el) el.classList.remove("is-focus");
  S.focus = null;
  return null;
}

export function navSource() {
  return `${[findingOrder, nextFinding, liveFocus].map(String).join("\n")}\n`;
}

export const NAV_NAMES = ["findingOrder", "liveFocus"];

export const NAV_PATCHES = [
  {
    id: "nav-next-finding",
    find:
      "function nextFinding() {\n" +
      "  const list = openFindings().length ? openFindings() : FIND;\n" +
      '  if (!list.length) { toast("The agents didn\'t flag anything."); return; }\n' +
      "  const i = list.findIndex((x) => x.id === S.lastFinding);\n" +
      "  goFinding(list[(i + 1) % list.length].id);\n" +
      "}\n",
    replace: navSource(),
  },
  {
    id: "nav-move",
    find: "  let i = els.findIndex((el) => el.dataset.h === S.focus);",
    replace: "  const focus = liveFocus();\n  let i = els.findIndex((el) => el.dataset.h === focus);",
  },
  {
    id: "nav-next-unreviewed",
    find: "  let from = S.focus ? ORDER.indexOf(S.focus) : -1;",
    replace: "  const focus = liveFocus();\n  let from = focus ? ORDER.indexOf(focus) : -1;",
  },
  {
    id: "nav-mark",
    find: "  if (!S.focus) { move(1); return; }",
    replace: "  if (!liveFocus()) { move(1); return; }",
  },
  {
    id: "nav-comment",
    find: "  if (!S.focus) move(1);\n  if (!S.focus) return;",
    replace: "  if (!liveFocus()) move(1);\n  if (!S.focus) return;",
  },
  // A smooth scroll still under way leaves the newly focused hunk off screen, and the next key would start over from
  // what's in view. Moving the focus is also the page's most repeated action, so it doesn't animate.
  {
    id: "nav-instant-el",
    find:
      "function scrollToEl(el, withFile) {\n" +
      "  if (!el) return;\n" +
      "  scrollToY(() => el.getBoundingClientRect().top + window.scrollY - stickyOffset(withFile), el);",
    replace:
      "function scrollToEl(el, withFile, instant) {\n" +
      "  if (!el) return;\n" +
      "  scrollToY(() => el.getBoundingClientRect().top + window.scrollY - stickyOffset(withFile), el, instant);",
  },
  {
    id: "nav-instant-y",
    find:
      "function scrollToY(y, el) {\n" +
      '  if (!document.documentElement.classList.contains("many-files")) {\n' +
      '    window.scrollTo({ top: Math.max(0, y()), behavior: reduced.matches ? "auto" : "smooth" });',
    replace:
      "function scrollToY(y, el, instant) {\n" +
      '  if (!document.documentElement.classList.contains("many-files")) {\n' +
      '    window.scrollTo({ top: Math.max(0, y()), behavior: instant || reduced.matches ? "auto" : "smooth" });',
  },
  {
    id: "nav-instant-focus",
    find: '  el.classList.add("is-focus");\n  if (scroll) scrollToEl(el, true);',
    replace: '  el.classList.add("is-focus");\n  if (scroll) scrollToEl(el, true, true);',
  },
];
