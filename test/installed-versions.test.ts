import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { latestCommand, listClaudeVersions, listCodexVersions, listCursorVersions } from "../src/installed-versions.ts";

async function home(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "xrayviewer-clis-"));
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
    assert.deepEqual(listCursorVersions(root, []), []);
  });

  test("uses the newest Cursor Agent build, not an older path", async () => {
    const root = await home();
    const versions = path.join(root, ".local", "share", "cursor-agent", "versions");
    const older = path.join(versions, "2026.10.14-0f9edde");
    const current = path.join(versions, "2026.10.19-6bbf2c4");
    await mkdir(older, { recursive: true });
    await mkdir(current, { recursive: true });
    await writeFile(path.join(older, "cursor-agent"), "");
    await writeFile(path.join(current, "cursor-agent"), "");
    await mkdir(path.join(root, ".local", "bin"), { recursive: true });
    await symlink(path.join(older, "cursor-agent"), path.join(root, ".local", "bin", "cursor-agent"));

    const found = listCursorVersions(root, []);

    assert.deepEqual(
      found.map((item) => item.version),
      ["2026.10.19-6bbf2c4", "2026.10.14-0f9edde"],
    );
    assert.equal(latestCommand("cursor", path.join(older, "cursor-agent"), root), realpathSync(path.join(current, "cursor-agent")));
  });

  test("keeps a configured command when that CLI is not installed", async () => {
    const root = await home();
    const configured = path.join(root, "bin", "claude");
    await mkdir(path.join(root, "bin"), { recursive: true });
    await writeFile(configured, "");

    assert.equal(latestCommand("claude", configured, root), configured);
  });
});
