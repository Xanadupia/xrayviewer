import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { commentLevel, findingDrafts, readTag, tagBadge, withTag } from "../scripts/comment-tags.mjs";

describe("adding every open finding at once", () => {
  const page = { newId: (() => { let n = 0; return () => `d${++n}`; })(), lineText: (f: number, k: string) => `line ${f}:${k}`, at: "2026-10-20T20:40:00Z", run: "run-1" };

  test("makes one draft per finding on its line, with its suggested comment, label and level", () => {
    const { drafts, decisions } = findingDrafts(
      [
        { id: "a", f: 0, k: "n12", title: "Retry dropped", label: "blocking", severity: "high", comment: "  This drops the retry.  ", verbatim: "**Retry dropped**" },
        { id: "b", f: 2, k: "n3", title: "Typo", label: "nit", severity: "low", verbatim: "**Typo**\n\nSpelled wrong." },
      ],
      page,
    );

    assert.deepEqual(drafts, [
      { id: "d1", f: 0, k: "n12", lineText: "line 0:n12", label: "blocking", level: "high", body: "This drops the retry.", fromFinding: "a", verbatim: false },
      { id: "d2", f: 2, k: "n3", lineText: "line 2:n3", label: "nit", level: "low", body: "**Typo**\n\nSpelled wrong.", fromFinding: "b", verbatim: false },
    ]);
    assert.deepEqual(decisions, {
      a: { state: "accepted", draft: "d1", at: page.at, run: "run-1", title: "Retry dropped" },
      b: { state: "accepted", draft: "d2", at: page.at, run: "run-1", title: "Typo" },
    });
  });

  test("gives a finding without a severity the level its label fits", () => {
    const { drafts } = findingDrafts([{ id: "c", f: 1, k: "o4", title: "Why?", label: "question", verbatim: "Why?" }], page);

    assert.equal(drafts[0].level, "medium");
  });
});

describe("comment levels on GitHub", () => {
  test("posts each level as a Greptile-style priority tag in front of the comment: High as P1, Medium as P2, Low as P3", () => {
    assert.equal(
      withTag("high", "This drops the retry."),
      '<img alt="P1" src="https://img.shields.io/badge/P1-FF9C7F?style=flat-square" align="top"> This drops the retry.',
    );
    assert.match(withTag("medium", "Use the shared helper."), /^<img alt="P2" src="https:\/\/img\.shields\.io\/badge\/P2-DAFF00\?style=flat-square"/);
    assert.match(withTag("low", "Typo."), /^<img alt="P3" src="https:\/\/img\.shields\.io\/badge\/P3-D0D7DE\?style=flat-square"/);
    assert.equal(tagBadge("blocking"), "");
  });

  test("every comment gets a level: the one picked, else the finding's severity, else one that fits its kind", () => {
    assert.equal(commentLevel({ level: "low", label: "blocking" }, { severity: "high" }), "low");
    assert.equal(commentLevel({ level: "", label: "nit" }, { severity: "high" }), "high");
    assert.equal(commentLevel({ label: "blocking" }, null), "high");
    assert.deepEqual(["suggestion", "question", ""].map((label) => commentLevel({ label }, null)), ["medium", "medium", "medium"]);
    assert.deepEqual(["nit", "praise"].map((label) => commentLevel({ label }, undefined)), ["low", "low"]);
  });

  test("puts the tag on its own line when the comment opens with a block, so a suggested change still renders", () => {
    const body = "```suggestion\nreturn retry(fn);\n```";

    assert.equal(withTag("low", body), `${tagBadge("low")}\n\n${body}`);
    assert.equal(withTag("low", "- one\n- two"), `${tagBadge("low")}\n\n- one\n- two`);
  });

  test("does not add a second level to a comment that already opens with one", () => {
    const tagged = withTag("high", "Breaks the job.");

    assert.equal(withTag("medium", tagged), tagged);
    assert.equal(withTag("low", "nit: spacing"), `${tagBadge("low")} nit: spacing`);
  });

  test("reads the level back from X-RayViewer's tag, Greptile's P0 to P2, or an earlier High, Medium or Low tag, and the kind from a written prefix", () => {
    const posted = withTag("medium", "suggestion: Use the shared helper.");
    const tag = readTag(posted);

    assert.deepEqual(tag && { level: tag.level, label: tag.label, rest: posted.slice(tag.length) }, { level: "medium", label: "suggestion", rest: "Use the shared helper." });
    assert.deepEqual(["high", "medium", "low"].map((level) => readTag(withTag(level, "Text."))?.level), ["high", "medium", "low"]);
    const greptile = (p: string) => readTag(`<a href="https://app.greptile.com"><img alt="${p}" src="https://example.com/${p}.svg" align="top"></a> **Null check**`)?.level;
    assert.deepEqual(["P0", "P1", "P2"].map(greptile), ["high", "high", "medium"]);
    const earlier = (alt: string) => readTag(`<img alt="${alt}" src="https://img.shields.io/badge/${alt}-D0D7DE?style=flat-square" align="top"> Typo.`)?.level;
    assert.deepEqual(["High", "Medium", "Low"].map(earlier), ["high", "medium", "low"]);
    const written = "nit (non-blocking): spacing";
    const prefix = readTag(written);
    assert.deepEqual(prefix && { level: prefix.level, label: prefix.label, rest: written.slice(prefix.length) }, { level: "", label: "nit", rest: "spacing" });
    assert.equal(readTag("Plain text"), null);
  });
});
