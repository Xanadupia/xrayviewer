import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import {
  claudeEffort,
  claudeModelName,
  findClaudeCatalog,
  parseClaudeCatalog,
  parseClaudeHelp,
  readClaudeCatalog,
  withClaudeEffort,
} from "../src/claude-models.ts";

const help = await readFile(new URL("./fixtures/claude-help.txt", import.meta.url), "utf8");

/** The shape Claude Code 2.1 bundles: model entries, then the aliases, then `latest_per_family`. */
const catalogText =
  'models:[{id:"claude-opus-4-8",family:"opus",display_name:"Opus 4.8",knowledge_cutoff:"x"},' +
  '{id:"claude-opus-5-5",family:"opus",display_name:"Opus 5.5",provider_ids:{first_party:"claude-opus-5-5"}},' +
  '{id:"claude-sonnet-5-5",family:"sonnet",display_name:"Sonnet 5.5"},{id:"claude-haiku-5-5",family:"haiku",display_name:"Haiku 5.5"}],' +
  'aliases:{opus:{default:"claude-opus-5-5",per_provider:{bedrock:"claude-opus-4-8"}},sonnet:{default:"claude-sonnet-5-5",per_provider:{}},' +
  'haiku:{default:"claude-haiku-5-5",per_provider:{}}},defaults:{},best:"opus",latest_per_family:{opus:"claude-opus-5-5"}';

describe("parseClaudeHelp", () => {
  test("reads the model names and effort levels from Claude Code 2.1's help", () => {
    const models = parseClaudeHelp(help);

    assert.deepEqual(
      models.map((model) => model.slug),
      ["fable", "opus", "sonnet"],
    );
    assert.equal(models[1].name, "Opus");
    assert.equal(models[1].defaultEffort, "");
    assert.deepEqual(
      models[1].efforts.map((item) => item.effort),
      ["low", "medium", "high", "xhigh", "max"],
    );
  });

  test("offers no levels when this Claude Code has no --effort flag", () => {
    const older = "  --model <model>  Model for the current session. Provide an alias (e.g. 'sonnet' or 'opus') or a full name.\n";

    const models = parseClaudeHelp(older);

    assert.deepEqual(
      models.map((model) => [model.slug, model.efforts.length]),
      [
        ["sonnet", 0],
        ["opus", 0],
      ],
    );
  });

  test("falls back to the long-standing names when the help names none", () => {
    assert.deepEqual(
      parseClaudeHelp("Usage: claude [options]").map((model) => model.slug),
      ["opus", "sonnet", "haiku"],
    );
  });
});

describe("Claude's model catalog", () => {
  test("names the version each alias means and adds aliases the help leaves out", () => {
    const models = parseClaudeHelp(help, parseClaudeCatalog(catalogText));

    assert.deepEqual(
      models.map((model) => [model.name, model.slug, model.fullId]),
      [
        ["Fable", "fable", undefined],
        ["Opus 5.5", "opus", "claude-opus-5-5"],
        ["Sonnet 5.5", "sonnet", "claude-sonnet-5-5"],
        ["Haiku 5.5", "haiku", "claude-haiku-5-5"],
      ],
    );
  });

  test("gives a display name for an alias or a full model id", () => {
    const catalog = parseClaudeCatalog(catalogText);

    assert.equal(claudeModelName(catalog, "opus"), "Opus 5.5");
    assert.equal(claudeModelName(catalog, "claude-opus-4-8"), "Opus 4.8");
    assert.equal(claudeModelName(catalog, "claude-unknown-9"), "");
    assert.equal(claudeModelName(null, "opus"), "");
  });

  test("finds the catalog in a program file when it falls across a read boundary", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "xrayview-claude-"));
    const file = path.join(dir, "claude");
    const chunk = 4096;
    const mark = catalogText.indexOf("latest_per_family:{");
    const padding = "\0".repeat(chunk * 3 - mark - 5);
    await writeFile(file, padding + catalogText + "\0".repeat(100));

    const catalog = await findClaudeCatalog(file, chunk);

    assert.equal(catalog?.aliases.get("sonnet"), "claude-sonnet-5-5");
    assert.equal(catalog?.names.get("claude-opus-5-5"), "Opus 5.5");
  });

  test("has no catalog for a file without one, or a missing file", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "xrayview-claude-"));
    const file = path.join(dir, "claude");
    await writeFile(file, "#!/bin/sh\necho claude\n");

    assert.equal(await readClaudeCatalog(file), null);
    assert.equal(await readClaudeCatalog(path.join(dir, "missing")), null);
  });
});

describe("Claude effort arguments", () => {
  test("replaces an earlier effort in either form and keeps other arguments", () => {
    assert.deepEqual(withClaudeEffort(["--verbose", "--effort", "low", "--effort=max"], "high"), ["--verbose", "--effort", "high"]);
    assert.deepEqual(withClaudeEffort(["--effort", "low"], ""), []);
  });

  test("reads the effort a run will use", () => {
    assert.equal(claudeEffort(["--effort", "xhigh"]), "xhigh");
    assert.equal(claudeEffort(["--effort=medium"]), "medium");
    assert.equal(claudeEffort([]), "");
  });
});
