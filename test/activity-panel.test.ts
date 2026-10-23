import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { activityBody, activityPanelHTML, bindActivity, onActivityMessage, publishActivity } from "../src/activity-panel.ts";

describe("agent activity in the sidebar", () => {
  test("draws the same checks tree, and an agent's log when it is opened", () => {
    const progress = {
      agents: {
        guide: { state: "done", harness: "claude", ms: 1200 },
        security: { state: "done", harness: "claude", by: "code-review" },
        "code-review": { state: "done", harness: "claude", ms: 4000 },
      },
      activity: {
        guide: { dropped: 0, steps: [{ id: "1", kind: "read", title: "src/app.ts", state: "done", ms: 20 }] },
        "code-review": { dropped: 0, steps: [{ id: "2", kind: "message", title: "Looks sound.", state: "done" }] },
      },
    };
    const plan = [
      { id: "guide", name: "Guide", harness: "claude", model: "Opus" },
      { id: "code-review", name: "Code review", harness: "claude", model: "Opus" },
    ];
    const list = activityBody(progress, plan);
    assert.match(list, /Guide/);
    assert.match(list, /Code review/);
    assert.match(list, /checks-group/);
    assert.match(list, /Successful/);
    const detail = activityBody(progress, plan, "guide", new Map());
    assert.match(detail, /All agents/);
    assert.match(detail, /src\/app\.ts/);
    assert.match(activityBody(null, null), /Open a pull request/);
  });

  test("the panel document uses the review stylesheet and only its own script", () => {
    const html = activityPanelHTML("https://webview.example", "ab'c", "https://webview.example/styles.css");
    assert.match(html, /href="https:\/\/webview\.example\/styles\.css"/);
    assert.match(html, /id="i-chev"/);
    assert.match(html, /data-act/);
    assert.equal(html.includes("ab'c"), false);
  });

  test("opening an agent asks the panel to draw that agent's log", async () => {
    const messages: Array<{ type: string; html: string }> = [];
    bindActivity({ postMessage: (message) => messages.push(message as { type: string; html: string }) });
    await publishActivity({
      agents: { guide: { state: "running", harness: "cursor" } },
      activity: { guide: { dropped: 0, steps: [] } },
    });
    onActivityMessage({ type: "detail", id: "guide" });
    assert.equal(messages.at(-1)?.type, "activity");
    assert.match(messages.at(-1)?.html ?? "", /All agents/);
    assert.match(messages.at(-1)?.html ?? "", /Guide/);
  });
});
