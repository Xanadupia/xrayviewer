import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import { VERSION } from "../scripts/manifest.mjs";
import { releaseNotes } from "../scripts/release.mjs";

const script = fileURLToPath(new URL("../scripts/release.mjs", import.meta.url));
const changelog = () => readFile(new URL("../assets/changelog.md", import.meta.url), "utf8");

const CHANGELOG = "# Changelog\n\n## 0.6.0\n\n- **New.** It works.\n\n## 0.5.0\n\n- **Old.** It worked.\n";

describe("release notes", () => {
  test("are the tagged version's changelog section, then how to install the package", () => {
    const notes = releaseNotes("v0.6.0", CHANGELOG, "0.6.0");

    assert.ok(notes.startsWith("- **New.** It works.\n\n## Install\n"));
    assert.equal(notes.includes("Old."), false);
    assert.match(notes, /download `xrayviewer-0\.6\.0\.vsix` below/);
    assert.match(notes, /cursor --install-extension xrayviewer-0\.6\.0\.vsix/);
    assert.match(notes, /gh attestation verify xrayviewer-0\.6\.0\.vsix -R Xanadupia\/xrayviewer/);
  });

  test("exist for the version this checkout packages", async () => {
    assert.match(releaseNotes(`v${VERSION}`, await changelog()), /## Install/);
  });

  test("refuse a tag for another version than the one packaged", () => {
    assert.throws(() => releaseNotes("v0.6.1", CHANGELOG, "0.6.0"), /v0\.6\.1 doesn't match VERSION 0\.6\.0 in scripts\/manifest\.mjs/);
  });

  test("refuse a tag that isn't v and a version", () => {
    for (const tag of ["0.6.0", "v0.6", "v0.6.0-beta.1", "release-0.6.0"]) {
      assert.throws(() => releaseNotes(tag, CHANGELOG, "0.6.0"), /isn't a release tag/, tag);
    }
  });

  test("refuse a version the changelog doesn't describe", () => {
    assert.throws(() => releaseNotes("v0.7.0", CHANGELOG, "0.7.0"), /has no "## 0\.7\.0" section/);
    assert.throws(() => releaseNotes("v0.7.0", "## 0.7.0\n\n## 0.6.0\n\n- x\n", "0.7.0"), /section of assets\/changelog\.md is empty/);
  });

  test("the command prints the notes, and fails a tag the workflow must not release", () => {
    const good = spawnSync(process.execPath, [script, `v${VERSION}`], { encoding: "utf8" });
    assert.equal(good.status, 0, good.stderr);
    assert.match(good.stdout, /## Install/);

    const bad = spawnSync(process.execPath, [script, "v99.0.0"], { encoding: "utf8" });
    assert.equal(bad.status, 1);
    assert.equal(bad.stdout, "");
    assert.match(bad.stderr, /v99\.0\.0 doesn't match VERSION/);
  });
});
