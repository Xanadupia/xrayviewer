import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { prHoverMarkdown, type PrHover, type ReviewTone } from "../src/pr-hover.ts";

const base: PrHover = {
  title: "Require auth before AI usage",
  ref: "acme/app#42",
  author: "octocat",
  state: "open",
  approvals: "No approvals yet",
  checks: { total: 0, failed: 0, running: 0 },
  additions: 1437,
  deletions: 125,
  changedFiles: 13,
  review: { tone: "none", short: "Not reviewed", detail: "" },
};

const card = (extra: Partial<PrHover> = {}) => prHoverMarkdown({ ...base, ...extra });
const visible = (markdown: string) =>
  markdown
    .replace(/<[^>]+>/g, " ")
    .replace(/(?<!\\)\*\*/g, "")
    .replace(/\\(.)/g, "$1")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
const tableRow = (markdown: string, label: string) => markdown.split("\n").find((line) => line.startsWith("| <span") && visible(line.split(" | ")[0].slice(2)) === label) ?? "";

describe("pull request hover card", () => {
  test("leads with the title and who opened it, then one labeled row per fact", () => {
    const md = card();
    const [title, byline, rule] = md.split("\n\n");
    assert.equal(visible(title), "Require auth before AI usage");
    assert.ok(title.startsWith("**"), "the title is the one bold line");
    assert.equal(visible(byline), "acme/app#42 · by octocat");
    assert.equal(rule, "---");
    assert.deepEqual(
      md.split("\n").filter((line) => line.startsWith("| <span")).map((line) => visible(line.split(" | ")[0].slice(2))),
      ["Status", "X-RayViewer", "Size"],
    );
    assert.match(visible(tableRow(md, "Status")), /Open · no approvals yet/);
    assert.match(visible(tableRow(md, "Size")), /\+1,437 −125 in 13 files/);
  });

  test("names the pull request a stacked one builds on", () => {
    assert.equal(visible(card({ stackedOn: 28 }).split("\n\n")[1]), "acme/app#42 · by octocat · stacked on #28");
  });

  test("says only what it knows before GitHub's details arrive", () => {
    const md = card({ state: undefined, approvals: undefined, title: "acme/app#42", author: undefined });
    assert.equal(tableRow(md, "Status"), "");
    assert.equal(tableRow(md, "Size"), "");
    assert.match(visible(tableRow(md, "X-RayViewer")), /Not reviewed/);
  });

  test("shows text exactly as written, never as markup or icons", () => {
    const md = card({ title: "<img src=x> **bold** $(alert) a|b", author: "dev_1" });
    const title = md.split("\n\n")[0];
    assert.equal(title.includes("<img"), false);
    assert.ok(title.includes("&lt;img src=x&gt;"));
    assert.ok(title.includes("\\$\\(alert\\)"), "a $(name) in a title stays text");
    assert.ok(title.includes("a\\|b"), "a pipe can't split the table");
    assert.ok(title.includes("\\*\\*bold\\*\\*"), "markdown in a title stays text");
  });

  test("colors follow the theme and only mark what needs attention", () => {
    const low = card({ risk: { level: "low", score: 12, factors: ["Small change"] } });
    const medium = card({ risk: { level: "medium", score: 50, factors: [] } });
    const high = card({ risk: { level: "high", score: 80, factors: [] } });
    assert.equal(/#[0-9a-f]{3,6}\b/i.test(low + medium + high), false, "no fixed colors, so light, dark and high contrast themes all read");
    assert.equal(tableRow(low, "Risk").includes("charts-"), false, "low risk is the normal case and stays plain");
    assert.ok(tableRow(medium, "Risk").includes("charts-yellow"));
    assert.ok(tableRow(high, "Risk").includes("charts-red"));
    assert.match(visible(tableRow(low, "Risk")), /Low · 12\/100.*Small change/);
  });

  test("puts each fact's detail under it and keeps the label on the first line", () => {
    const md = card({
      review: { tone: "posted", short: "Reviewed & posted, 3 findings", detail: "a9dca66 · 3 hours ago · posted 2 hours ago" },
      usage: "12.3k in, 3.1k out · $0.42",
      risk: { level: "medium", score: 50, factors: ["3 findings", "562 changed lines", "Public API", "Fourth"] },
    });
    const review = tableRow(md, "X-RayViewer");
    assert.match(visible(review), /Reviewed & posted, 3 findings.*a9dca66 · 3 hours ago · posted 2 hours ago · 12\.3k in, 3\.1k out · \$0\.42/);
    const [label, value] = review.split(" | ");
    assert.equal(label.split("<br>").length, value.split("<br>").length, "the label carries as many lines as its value");
    assert.equal(visible(tableRow(md, "Risk")).includes("Fourth"), false, "at most three reasons");
  });

  test("Status stacks conflicts and checks under the state, worst check first", () => {
    const status = (extra: Partial<PrHover>) => visible(tableRow(card(extra), "Status"));
    assert.match(status({ conflictsWith: "main", checks: { total: 5, failed: 2, running: 1 } }), /Conflicts with main.*2 checks failing/);
    assert.equal(status({ checks: { total: 5, failed: 2, running: 1 } }).includes("running"), false);
    assert.match(status({ checks: { total: 5, failed: 0, running: 1 } }), /1 check running/);
    assert.match(status({ checks: { total: 5, failed: 0, running: 0 } }), /All 5 checks passed/);
    assert.match(status({ checks: { total: 1, failed: 0, running: 0 } }), /Check passed/);
    assert.match(status({ state: "draft" }), /Draft · no approvals yet/);
  });

  test("a merged or closed pull request says when, without approvals or checks", () => {
    const merged = visible(tableRow(card({ state: "merged", stateWhen: "3 days ago", checks: { total: 2, failed: 1, running: 0 }, conflictsWith: "main" }), "Status"));
    assert.match(merged, /Merged 3 days ago/);
    assert.equal(/approvals|checks|Conflicts/.test(merged), false);
    assert.match(visible(tableRow(card({ state: "closed", stateWhen: "a day ago" }), "Status")), /Closed a day ago/);
  });

  test("names the viewer's own review plainly", () => {
    assert.match(visible(tableRow(card({ yours: ["You haven't reviewed it yet."] }), "Your review")), /Not yet/);
    assert.match(visible(tableRow(card({ yours: ["Your review: approved 2 days ago at abc1234"] }), "Your review")), /Approved 2 days ago at abc1234/);
    assert.equal(tableRow(card({ yours: [] }), "Your review"), "");
  });

  test("every review state has its own icon", () => {
    const tones: ReviewTone[] = ["active", "paused", "posted", "unposted", "stale", "failed", "none"];
    const icons = tones.map((tone) => tableRow(card({ review: { tone, short: "x", detail: "" } }), "X-RayViewer").match(/\$\(([a-z~-]+)\)/)?.[1]);
    assert.equal(new Set(icons).size, tones.length);
    assert.ok(icons.every(Boolean));
  });

  test("ends with the run's note and a shortened error", () => {
    const md = card({ note: "Paused by you", error: "x".repeat(400) });
    const footer = md.split("\n\n").at(-1) ?? "";
    assert.equal(md.split("\n\n").at(-2), "---");
    assert.match(visible(footer), /^Paused by you/);
    assert.equal(visible(footer).match(/x+/)?.[0].length, 300);
    assert.equal(card().split("\n\n").filter((part) => part === "---").length, 1, "no footer rule without a note or error");
  });
});
