import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { modelSummary } from "../scripts/model-line.mjs";

const agent = (id: string, short: string, harness: string, model: string) => ({ id, short, harness, model });

describe("model summary", () => {
  test("names one harness and model for every agent", () => {
    const ran = [
      agent("guide", "Guide", "cursor", "gpt-5.6-sol-high"),
      agent("security", "Security", "cursor", "gpt-5.6-sol-high"),
    ];
    const summary = modelSummary(ran);

    assert.equal(summary.line, "Model: Cursor · gpt-5.6-sol-high");
    assert.equal(summary.caption, " · gpt-5.6-sol-high");
    assert.equal(summary.detail(ran[0]), " · Cursor · gpt-5.6-sol-high");
  });

  test("lists each combination with the agents that used it", () => {
    const summary = modelSummary([
      agent("guide", "Guide", "cursor", "gpt-5.6-sol-high"),
      agent("architecture", "Architecture", "cursor", "gpt-5.6-sol-high"),
      agent("security", "Security", "claude", "sonnet"),
    ]);

    assert.equal(
      summary.line,
      "Models: Cursor · gpt-5.6-sol-high (Guide, Architecture); Claude · sonnet (Security)",
    );
    assert.equal(summary.caption, " · mixed models");
    assert.equal(summary.detail(agent("security", "Security", "claude", "sonnet")), " · Claude · sonnet");
  });

  test("includes the reasoning level recorded for the run", () => {
    const summary = modelSummary([
      { id: "guide", short: "Guide", harness: "codex", model: "gpt-6.1-sol", thinking: "medium" },
      { id: "security", short: "Security", harness: "codex", model: "gpt-6.1-sol", thinking: "medium" },
    ]);

    assert.equal(summary.line, "Model: Codex · gpt-6.1-sol · medium");
    assert.equal(summary.caption, " · gpt-6.1-sol · medium");
    assert.equal(summary.detail({ harness: "codex", model: "gpt-6.1-sol", thinking: "medium" }), " · Codex · gpt-6.1-sol · medium");
  });

  test("says when an agent left the model to the CLI", () => {
    const summary = modelSummary([agent("guide", "Guide", "pi", "")]);

    assert.equal(summary.line, "Model: Pi · CLI default");
    assert.equal(summary.caption, " · CLI default");
  });

  test("stays quiet when the run recorded no harness or model", () => {
    const summary = modelSummary([agent("guide", "Guide", "", "")]);

    assert.equal(summary.line, "");
    assert.equal(summary.caption, "");
    assert.equal(summary.detail(agent("guide", "Guide", "", "")), "");
  });
});
