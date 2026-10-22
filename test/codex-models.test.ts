import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseCodexCatalog, withReasoningEffort } from "../src/codex-models.ts";

const catalog = JSON.stringify({
  models: [
    { slug: "hidden", visibility: "hide", supported_in_api: true, display_name: "Hidden" },
    {
      slug: "gpt-6.1-sol",
      display_name: "GPT-6.1-Sol",
      description: "Latest workhorse model.",
      visibility: "list",
      supported_in_api: true,
      default_reasoning_level: "low",
      supported_reasoning_levels: [
        { effort: "low", description: "Fast" },
        { effort: "medium", description: "Everyday" },
      ],
    },
  ],
});

describe("Codex model catalog", () => {
  test("keeps the models the CLI shows and their reasoning levels", () => {
    const models = parseCodexCatalog(catalog);

    assert.equal(models.length, 1);
    assert.equal(models[0].name, "GPT-6.1-Sol");
    assert.deepEqual(models[0].efforts.map((level) => level.effort), ["low", "medium"]);
  });

  test("replaces an existing reasoning effort", () => {
    assert.deepEqual(withReasoningEffort(["-c", 'model_reasoning_effort="low"', "-c", "sandbox_mode=\"read-only\""], "medium"), [
      "-c",
      'sandbox_mode="read-only"',
      "-c",
      'model_reasoning_effort="medium"',
    ]);
  });
});
