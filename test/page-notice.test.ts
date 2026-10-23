import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  answerNotice,
  bindNotice,
  cancelNotices,
  clearNotice,
  holdNotice,
  offerNotice,
  type PageNoticeMessage,
} from "../src/page-notice.ts";

function bind() {
  const sent: PageNoticeMessage[] = [];
  bindNotice((message) => {
    sent.push(message);
    return true;
  });
  return sent;
}

describe("review page notices", () => {
  test("uses the editor message when no review page is open", () => {
    bindNotice(null);
    assert.equal(offerNotice("Install Codex?", ["Install"]), null);
    assert.equal(holdNotice("Installing Codex…"), null);
  });

  test("waits for the button on the page", async () => {
    const sent = bind();
    const choice = offerNotice("Install Codex? X-RayViewer will download it.", ["Install"]);
    assert.ok(choice);
    assert.equal(sent[0].text, "Install Codex? X-RayViewer will download it.");
    assert.deepEqual(sent[0].buttons, ["Install"]);
    assert.equal(sent[0].hold, true);
    answerNotice({ id: sent[0].id, value: "Install" });
    assert.equal(await choice, "Install");
  });

  test("an information line does not wait for a click", async () => {
    const sent = bind();
    assert.equal(await offerNotice("Saved.", []), undefined);
    assert.deepEqual(sent[0].buttons, []);
    assert.equal(sent[0].hold, false);
  });

  test("dismissing the banner declines the choice", async () => {
    const sent = bind();
    const choice = offerNotice("Reset agent settings?", ["Reset"]);
    answerNotice({ id: sent[0].id, value: "" });
    assert.equal(await choice, undefined);
  });

  test("a finished line is not cleared by the progress line it replaced", () => {
    const sent = bind();
    const gen = holdNotice("Installing Codex…");
    assert.equal(typeof gen, "number");
    offerNotice("Codex is now 0.163.0.", []);
    clearNotice(gen as number);
    assert.equal(sent.at(-1)?.text, "Codex is now 0.163.0.");
  });

  test("replacing the page declines a choice that was still waiting", async () => {
    bind();
    const choice = offerNotice("Post the review?", ["Post"]);
    cancelNotices();
    assert.equal(await choice, undefined);
  });

  test("says what kind of line it is, so the page can draw its mark", () => {
    const sent = bind();
    offerNotice("Saved.", []);
    offerNotice("Codex did not install.", [], "error");
    holdNotice("Installing Codex…");
    assert.deepEqual(sent.map((m) => m.tone), ["info", "error", "progress"]);
  });

  test("does not show on a page that has not loaded the banner", () => {
    bindNotice(() => false);
    assert.equal(offerNotice("Copied the finding.", []), null);
    assert.equal(holdNotice("Asking Codex for its models…"), null);
  });
});
