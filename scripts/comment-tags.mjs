/**
 * How a comment's level is written on GitHub: a small colored priority tag in front of the text, the way Greptile marks
 * priority. High posts as P1 and Medium as P2, in Greptile's colors for those, and Low as P3.
 * Each function is copied into the review page as written, so it keeps its data inside and calls only the others here.
 * @param {string} level
 */
export function tagBadge(level) {
  const badges = { high: ["P1", "FF9C7F"], medium: ["P2", "DAFF00"], low: ["P3", "D0D7DE"] };
  const badge = badges[level];
  return badge ? `<img alt="${badge[0]}" src="https://img.shields.io/badge/${badge[0]}-${badge[1]}?style=flat-square" align="top">` : "";
}

/**
 * The level a comment posts at: the one picked for it, else its agent finding's severity, else one that fits its kind.
 * @param {{ level?: string, label?: string }} comment
 * @param {{ severity?: string } | null | undefined} finding
 */
export function commentLevel(comment, finding) {
  if (comment.level) return comment.level;
  if (finding && finding.severity) return finding.severity;
  if (comment.label === "blocking") return "high";
  return comment.label === "nit" || comment.label === "praise" ? "low" : "medium";
}

/**
 * What adding every open agent finding at once makes: one draft per finding, on its line, with the finding's suggested
 * comment (or its text word for word when it has none), its label and its level, and the decision that marks it added.
 * The same draft and decision as adding the finding alone from its comment box.
 * @param {Array<{ id: string, f: number, k: string, title: string, label?: string, severity?: string, comment?: string, verbatim: string }>} findings
 * @param {{ newId: () => string, lineText: (f: number, k: string) => string | null | undefined, at: string, run: string | null }} page
 */
export function findingDrafts(findings, page) {
  const drafts = [];
  /** @type {Record<string, { state: string, draft: string, at: string, run: string | null, title: string }>} */
  const decisions = {};
  for (const x of findings) {
    const id = page.newId();
    const label = x.label || "";
    drafts.push({
      id,
      f: x.f,
      k: x.k,
      lineText: page.lineText(x.f, x.k),
      label,
      level: commentLevel({ label }, x),
      body: (x.comment || x.verbatim).trim(),
      fromFinding: x.id,
      verbatim: false,
    });
    decisions[x.id] = { state: "accepted", draft: id, at: page.at, run: page.run, title: x.title };
  }
  return { drafts, decisions };
}

/**
 * The tags a comment opens with: a priority from P0 to P3 (X-RayViewer's or Greptile's) or an earlier High, Medium or
 * Low tag, then a written `nit:` style prefix. Returns the level and kind they name, and how many characters they
 * take, or null.
 * @param {string} body
 */
export function readTag(body) {
  const levels = { high: "high", medium: "medium", low: "low", p0: "high", p1: "high", p2: "medium", p3: "low" };
  const badge = /^\s*(?:<a\b[^>]*>\s*)?<img\b[^>]*\balt="(High|Medium|Low|P[0-3])"[^>]*>\s*(?:<\/a>)?\s*/i.exec(body);
  const start = badge ? badge[0].length : 0;
  const prefix = /^\s*\**(nit|question|blocking|suggestion|praise)\**\s*(?:\([^)]*\))?\s*:\s*/i.exec(body.slice(start));
  if (!badge && !prefix) return null;
  return {
    level: badge ? levels[badge[1].toLowerCase()] : "",
    label: prefix ? prefix[1].toLowerCase() : "",
    length: start + (prefix ? prefix[0].length : 0),
  };
}

/**
 * A comment body as posted: its level tag first. The tag gets a line of its own when the text opens with a block,
 * such as a suggested change, so the block still renders. A body that already opens with a level stays as written.
 * @param {string} level
 * @param {string} body
 */
export function withTag(level, body) {
  const badge = tagBadge(level);
  if (!badge || readTag(body)?.level) return body;
  return /^\s*(```|~~~|[-*+]\s|\d+[.)]\s|#|>|\|)/.test(body) ? `${badge}\n\n${body}` : `${badge} ${body}`;
}
