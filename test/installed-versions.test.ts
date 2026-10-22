import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { listClaudeVersions, listCodexVersions } from "../src/installed-versions.ts";

async function home(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "xrayview-clis-"));
}

describe("installed CLI versions", () => {
  test("lists each Claude Code build once, newest first", async () => {
    const root = await home();
    const versions = path.join(root, ".local", "share", "claude", "versions");
    await mkdir(versions, { recursive: true });
    await writeFile(path.join(versions, "2.1.100"), "");
    await writeFile(path.join(versions, "2.1.294"), "");
    await mkdir(path.join(root, ".local", "bin"), { recursive: true });
    await symlink(path.join(versions, "2.1.294"), path.join(root, ".local", "bin", "claude"));

    const found = listClaudeVersions(root, []);

    assert.deepEqual(
      found.map((item) => item.version),
      ["2.1.294", "2.1.100"],
    );
    assert.equal(found[0].path, realpathSync(path.join(versions, "2.1.294")));
  });

  test("lists Codex release directories and skips staging", async () => {
    const root = await home();
    const releases = path.join(root, ".codex", "packages", "standalone", "releases");
    const current = path.join(releases, "1.2.3-aarch64-apple-darwin", "bin");
    const older = path.join(releases, "0.9.0-aarch64-apple-darwin");
    await mkdir(current, { recursive: true });
    await mkdir(path.join(releases, ".staging.1.2.3"), { recursive: true });
    await mkdir(older, { recursive: true });
    await writeFile(path.join(current, "codex"), "");
    await writeFile(path.join(older, "codex"), "");

    const found = listCodexVersions(root, []);

    assert.deepEqual(
      found.map((item) => item.version),
      ["1.2.3", "0.9.0"],
    );
    assert.equal(found[0].path, realpathSync(path.join(current, "codex")));
  });

  test("is empty when neither CLI is installed", async () => {
    const root = await home();

    assert.deepEqual(listClaudeVersions(root, []), []);
    assert.deepEqual(listCodexVersions(root, []), []);
  });
});
