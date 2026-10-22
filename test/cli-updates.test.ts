import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import {
  availableUpdates,
  claudeLatestVersion,
  codexLatestVersion,
  cursorLatestVersion,
  forgetCliUpdates,
  offeredUpdate,
  updateInstalledCli,
  type UpdateDeps,
} from "../src/cli-updates.ts";

const about = `CLI Version         2026.10.19-6bbf2c4
Latest              2026.10.22-27dcf5f (update available — run \`agent update\`)
`;

describe("published CLI versions", () => {
  test("reads the version files and tags these CLIs publish", () => {
    assert.equal(claudeLatestVersion("2.1.308\n"), "2.1.308");
    assert.equal(claudeLatestVersion("latest"), "");
    assert.equal(codexLatestVersion("rust-v0.163.0"), "0.163.0");
    assert.equal(codexLatestVersion("not-a-version"), "");
    assert.equal(cursorLatestVersion(about), "2026.10.22-27dcf5f");
    assert.equal(cursorLatestVersion("Latest              2026.10.19-6bbf2c4\n"), "");
  });

  test("offers a version only when it is newer than the one installed", () => {
    assert.equal(offeredUpdate("2.1.294", "2.1.308"), "2.1.308");
    assert.equal(offeredUpdate("0.163.0", "0.163.0"), "");
    assert.equal(offeredUpdate("", "2.1.308"), "");
  });
});

describe("availableUpdates", () => {
  test("asks each installed CLI and keeps the ones with a newer release", async () => {
    forgetCliUpdates();
    const asked: string[] = [];
    const deps: UpdateDeps = {
      async fetch(url) {
        asked.push(url);
        if (url.includes("claude")) return { ok: true, text: async () => "2.1.308" };
        return { ok: true, text: async () => JSON.stringify({ tag_name: "rust-v0.163.0", prerelease: false }) };
      },
      async cursorAbout() {
        return about;
      },
    };

    const updates = await availableUpdates({ claude: "2.1.294", codex: "0.162.1", cursor: "2026.10.19-6bbf2c4" }, deps);

    assert.deepEqual(updates, { claude: "2.1.308", codex: "0.163.0", cursor: "2026.10.22-27dcf5f" });
    assert.equal(asked.length, 2);
    assert.deepEqual(await availableUpdates({ claude: "2.1.294", codex: "0.162.1", cursor: "2026.10.19-6bbf2c4" }, deps), updates, "the same check is reused");
    assert.equal(asked.length, 2);
  });

  test("skips a CLI that isn't installed or whose check fails", async () => {
    forgetCliUpdates();
    const deps: UpdateDeps = {
      async fetch() {
        return { ok: false, text: async () => "" };
      },
      async cursorAbout() {
        throw new Error("not signed in");
      },
    };

    assert.deepEqual(await availableUpdates({ claude: "", codex: "0.162.1", cursor: "2026.10.19-6bbf2c4" }, deps), {});
  });
});

describe("updateInstalledCli", () => {
  test("downloads with the CLI's own update command and then reads the version on disk", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "xrayviewer-update-"));
    const versions = path.join(root, ".local", "share", "claude", "versions");
    await mkdir(versions, { recursive: true });
    await writeFile(path.join(versions, "2.1.294"), "");
    const ran: string[][] = [];
    const logs: string[] = [];

    const updated = await updateInstalledCli(
      {
        vscode: {
          window: {
            async showInformationMessage(_message, _modal, ...items) {
              return items[0];
            },
            async showWarningMessage() {
              return undefined;
            },
            withProgress: (_options, task) => task(),
          },
          ProgressLocation: { Notification: 15 },
        },
        log: (line) => logs.push(line),
        async run(command, args) {
          ran.push([command, ...args]);
          await writeFile(path.join(versions, "2.1.308"), "");
          return { ok: true, output: "" };
        },
      },
      "claude",
      root,
    );

    assert.equal(updated, true);
    assert.equal(ran.length, 1);
    assert.deepEqual(ran[0].slice(1), ["update"]);
    assert.deepEqual(logs, ["Claude Code is now 2.1.308."]);
  });

  test("does not download when the update is declined", async () => {
    let ran = 0;
    const updated = await updateInstalledCli(
      {
        vscode: {
          window: {
            async showInformationMessage() {
              return undefined;
            },
            async showWarningMessage() {
              return undefined;
            },
            withProgress: (_options, task) => task(),
          },
          ProgressLocation: { Notification: 15 },
        },
        log: () => {},
        async run() {
          ran += 1;
          return { ok: true, output: "" };
        },
      },
      "codex",
      await mkdtemp(path.join(tmpdir(), "xrayviewer-update-")),
    );

    assert.equal(updated, false);
    assert.equal(ran, 0);
  });
});
