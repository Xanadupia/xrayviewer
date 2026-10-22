import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { describe, test } from "node:test";
import type { CursorConfig } from "../src/cursor-harness.ts";
import { listCursorModels, parseModelList } from "../src/cursor-models.ts";
import { fakeInternals, ok } from "./support/fake-internals.ts";

const config: CursorConfig = { id: "cursor", command: "cursor-agent", model: "", extraArgs: [] };

describe("parseModelList", () => {
  test("reads every model of the real --list-models output, without the header or the tip", async () => {
    const text = await readFile(new URL("./fixtures/list-models.txt", import.meta.url), "utf8");
    const modelLines = text.split("\n").filter((line) => / - /.test(line) && !line.startsWith("Tip:"));

    const models = parseModelList(text);

    assert.equal(models.length, modelLines.length);
    assert.deepEqual(models[0], { id: "auto", name: "Auto", isDefault: true, isCurrent: false });
    assert.equal(models.filter((model) => model.isDefault).length, 1);
    assert.deepEqual(models.find((model) => model.id === "grok-4.7-low-fast"), {
      id: "grok-4.7-low-fast",
      name: "Grok 4.7 Low Fast",
      isDefault: false,
      isCurrent: false,
    });
    assert.equal(new Set(models.map((model) => model.id)).size, models.length);
    assert.ok(models.every((model) => !/[\u200b-\u200d]/.test(model.name)));
  });

  test("marks the current model and strips colors", () => {
    const models = parseModelList("\x1b[1mAvailable models\x1b[0m\n\nauto - Auto (default)\ncomposer-2.5 - Composer 2.5 (current)\n");

    assert.deepEqual(models[1], { id: "composer-2.5", name: "Composer 2.5", isDefault: false, isCurrent: true });
  });
});

describe("listCursorModels", () => {
  test("asks the CLI from an empty folder that it removes afterwards", async () => {
    const { internals, runs } = fakeInternals(() => ok("auto - Auto (default)\n"));

    const models = await listCursorModels(internals, config);

    assert.deepEqual(models, [{ id: "auto", name: "Auto", isDefault: true, isCurrent: false }]);
    assert.deepEqual(runs[0].args, ["--list-models"]);
    assert.deepEqual(runs[0].workspaceFiles, []);
    assert.equal(await stat(runs[0].options.cwd!).then(() => true, () => false), false);
  });

  test("returns null when the CLI fails or is missing", async () => {
    const failing = fakeInternals(() => ({ code: 1, stdout: "", stderr: "Not logged in", killed: false }));
    const missing = fakeInternals(() => {
      throw Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" });
    });

    assert.equal(await listCursorModels(failing.internals, config), null);
    assert.equal(await listCursorModels(missing.internals, config), null);
  });
});
