import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { noticeSource } from "../scripts/notice-ui.mjs";

interface Banner {
  toneOf(msg: string): string;
  toast(msg: string, action?: { act: string; label: string }, tone?: string): void;
  notePosted(event: string, comments: number, url?: string): void;
  showPostedNotice(): void;
  showHostNotice(m: { text: string; buttons?: string[]; id?: string; tone?: string; hold?: boolean }): void;
  html(): string;
}

function page(liveKey = "acme/app#7", store = new Map<string, string>()): Banner {
  const host = { innerHTML: "", querySelector: () => null };
  const env = {
    esc: (s: unknown) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`),
    icon: (name: string) => `<i data-icon="${name}"></i>`,
    plural: (n: number, one: string) => `${n} ${n === 1 ? one : one + "s"}`,
    document: { getElementById: (id: string) => (id === "notice" ? host : null) },
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
  const make = new Function(
    ...Object.keys(env),
    "LIVE_KEY",
    "S",
    "NOTICE",
    `${noticeSource()}; return { toneOf, toast, notePosted, showPostedNotice, showHostNotice };`,
  );
  const fns = make(...Object.values(env), liveKey, {}, {});
  return { ...fns, html: () => host.innerHTML };
}

describe("review page banner marks", () => {
  test("reads what the page's own lines are from their wording", () => {
    const { toneOf } = page();
    assert.equal(toneOf("Couldn't refresh: offline"), "error");
    assert.equal(toneOf("The agents failed, so the review was not posted."), "error");
    assert.equal(toneOf("Refreshing from GitHub…"), "progress");
    assert.equal(toneOf("Write something first."), "warning");
    assert.equal(toneOf("The agents stopped, so the review was not posted."), "warning");
    assert.equal(toneOf("Claude Code's /code-review didn't finish. The other agents' findings are ready to review."), "info");
    assert.equal(toneOf("Added 3 findings to your review. They post when you finish."), "success");
    assert.equal(toneOf("Copied the finding"), "success");
    assert.equal(toneOf("Theme: Dark"), "info");
  });

  test("shows a mark for the kind of line instead of the X-RayViewer logo", () => {
    const banner = page();
    banner.toast("Draft saved.");
    assert.match(banner.html(), /<div class="notice n-success"><span class="notice-tone t-success" aria-hidden="true"><svg/);
    assert.equal(banner.html().includes("M8.5 8.5l7 7"), false, "no logo");
  });

  test("a host line with buttons reads as a question, and keeps a warning or error as it is", () => {
    const banner = page();
    banner.showHostNotice({ text: "Run the agents anyway?", buttons: ["Run anyway"], id: "a" });
    assert.match(banner.html(), /notice-tone t-ask/);
    banner.showHostNotice({ text: "Reset agent settings?", buttons: ["Reset"], id: "b", tone: "warning" });
    assert.match(banner.html(), /notice-tone t-warning/);
    banner.showHostNotice({ text: "Installing Codex…", tone: "progress", hold: true });
    assert.match(banner.html(), /notice-tone t-progress/);
  });

  test("says the review was posted on the page that comes back after posting", () => {
    const banner = page();
    banner.notePosted("COMMENT", 4, "https://github.com/acme/app/pull/7#pullrequestreview-1");
    banner.showPostedNotice();
    assert.match(banner.html(), /t-success/);
    assert.match(banner.html(), /Posted your review to GitHub with 4 comments\. <a class="link" href="https:\/\/github\.com\/acme\/app\/pull\/7#pullrequestreview-1"/);
    banner.toast("Theme: Dark");
    banner.showPostedNotice();
    assert.equal(banner.html().includes("Posted your review"), false, "it shows once");
  });

  test("another pull request's post is not announced here", () => {
    const store = new Map<string, string>();
    page("acme/app#8", store).notePosted("APPROVE", 0);
    const here = page("acme/app#7", store);
    here.showPostedNotice();
    assert.equal(here.html(), "");
  });
});
