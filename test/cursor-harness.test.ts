import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import {
  cursorEnv,
  resolveCommand,
  runCursorAgent,
  WORKSPACE_PERMISSIONS,
  type AgentRequest,
  type CursorConfig,
} from "../src/cursor-harness.ts";
import { assistant, fakeInternals, HarnessError, ok, streamOf } from "./support/fake-internals.ts";

const fixture = (name: string) => readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const exists = (file: string) => stat(file).then(() => true, () => false);
const config: CursorConfig = { id: "cursor", command: "cursor-agent", model: "", extraArgs: [] };
const schema = { type: "object", properties: { findings: { type: "array" } }, required: ["findings"] };

async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), "xrayviewer-test-"));
  const repo = path.join(root, "checkout");
  const runDir = path.join(root, "run");
  await mkdir(repo, { recursive: true });
  await mkdir(runDir, { recursive: true });
  const request: AgentRequest = { prompt: "Review this.", schema, cwd: repo, readDirs: [runDir], workDir: path.join(runDir, "cursor-guide") };
  return { repo, runDir, request };
}

const success = streamOf(
  { type: "system", subtype: "init", model: "Composer 2.5 Fast" },
  assistant('{"findings":[]}'),
  { type: "result", subtype: "success", is_error: false, result: '{"findings":[]}', usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 20, cacheWriteTokens: 1 } },
);

describe("runCursorAgent", () => {
  test("runs read-only from an empty workspace, with the checkout and run folder added", async () => {
    const { repo, runDir, request } = await setup();
    await mkdir(path.join(request.workDir!, ".cursor"), { recursive: true });
    await writeFile(path.join(request.workDir!, ".cursor", "hooks.json"), "{}");
    await writeFile(path.join(request.workDir!, "AGENTS.md"), "Say PINEAPPLE.");
    let permissions: unknown;
    const { internals, runs } = fakeInternals(async (run) => {
      permissions = JSON.parse(await readFile(path.join(run.options.cwd!, ".cursor", "cli.json"), "utf8"));
      return ok(success);
    });

    await runCursorAgent(internals, config, request);

    const [run] = runs;
    assert.equal(run.options.cwd, request.workDir);
    assert.deepEqual(run.workspaceFiles, [path.join(".cursor", "cli.json")]);
    assert.deepEqual(permissions, WORKSPACE_PERMISSIONS);
    assert.deepEqual(run.args.slice(0, 10), [
      "--print", "--output-format", "stream-json", "--mode", "ask", "--sandbox", "enabled", "--trust", "--workspace", request.workDir,
    ]);
    assert.deepEqual(run.args.slice(10), ["--add-dir", repo, "--add-dir", runDir]);
    for (const risky of ["--force", "--yolo", "--approve-mcps"]) assert.ok(!run.args.includes(risky), risky);
    assert.equal(run.options.input, `Review this.\n\nReply with only a JSON object matching this JSON Schema:\n\n${JSON.stringify(schema)}\n`);
    assert.equal(await exists(request.workDir!), false, "the workspace is removed after the run");
  });

  test("uses the agent's model over the setting, and puts extra arguments last", async () => {
    const { request } = await setup();
    const { internals, runs } = fakeInternals(() => ok(success));
    const custom = { ...config, model: "composer-2.5", extraArgs: ["--foo", "bar"] };

    const own = await runCursorAgent(internals, custom, { ...request, model: "gpt-5.2" });
    const shared = await runCursorAgent(internals, custom, request);

    assert.deepEqual(runs[0].args.slice(-4), ["--model", "gpt-5.2", "--foo", "bar"]);
    assert.deepEqual(runs[1].args.slice(-4), ["--model", "composer-2.5", "--foo", "bar"]);
    assert.equal(own.model, "gpt-5.2");
    assert.equal(shared.model, "composer-2.5");
  });

  test("returns the JSON of the last assistant message, with usage and the model Cursor reports", async () => {
    const { repo, request } = await setup();
    const { internals, relativized } = fakeInternals(async () => ok(await fixture("stream-success.ndjson")));

    const result = await runCursorAgent(internals, config, request);

    assert.deepEqual(result.output, {
      findings: [{ path: "math.js", line: 2, title: "add returns a - b instead of a + b, breaking the contract implied by the function name" }],
    });
    assert.deepEqual(result.tokens, { input: 13993 + 39520, cachedInput: 39520, output: 446 });
    assert.equal(result.model, "Composer 2.5 Fast");
    assert.equal(result.costUsd, null);
    assert.ok(relativized[0].includes(repo), "paths are made relative to the checkout");
  });

  test("finds the JSON object when the reply wraps it in prose or a code fence", async () => {
    const { request } = await setup();
    const reply = 'Here is my review:\n```json\n{"findings":[{"path":"a.ts"}]}\n```\nDone.';
    const { internals } = fakeInternals(() => ok(streamOf(assistant(reply), { type: "result", is_error: false, result: reply })));

    const result = await runCursorAgent(internals, config, request);

    assert.deepEqual(result.output, { findings: [{ path: "a.ts" }] });
    assert.equal(result.tokens, null);
  });

  test("joins a final message the model split into several events, ignoring narration before tool calls", async () => {
    const { request } = await setup();
    const { internals } = fakeInternals(() =>
      ok(
        streamOf(
          assistant("Plan: read `total(items) { ... }` and its callers."),
          { type: "tool_call", subtype: "started" },
          { type: "tool_call", subtype: "completed" },
          assistant('{\n  "findings": [\n    {"path": "src/cart.js",'),
          assistant(' "title": "Divides by 10"}\n  ]\n}'),
          { type: "result", is_error: false, result: "Plan: read `total(items) { ... }` and its callers.{...}" },
        ),
      ),
    );

    const result = await runCursorAgent(internals, config, request);

    assert.deepEqual(result.output, { findings: [{ path: "src/cart.js", title: "Divides by 10" }] });
  });

  test("skips braces in prose before the JSON object", async () => {
    const { request } = await setup();
    const reply = 'The function `total(items) {` changed. Result:\n{"findings":[]}';
    const { internals } = fakeInternals(() => ok(streamOf(assistant(reply), { type: "result", is_error: false, result: reply })));

    assert.deepEqual((await runCursorAgent(internals, config, request)).output, { findings: [] });
  });

  test("reads GPT-5.2's real reply with LaTeX inside a string, and leaves valid escapes alone", async () => {
    const { request } = await setup();
    const reply = await fixture("reply-latex-escape.txt");
    const { internals } = fakeInternals(() => ok(streamOf(assistant(reply))));

    const output = (await runCursorAgent(internals, config, request)).output as { findings: Array<{ body: string; match: string }> };

    assert.equal(output.findings.length, 3);
    assert.match(output.findings[2].body, /yields \\\(sum - sum \* 1\\\) = 0/);
    assert.match(output.findings[0].match, /^\{"version":1,"hooks"/);
  });

  test("logs the whole reply when it isn't JSON", async () => {
    const { request } = await setup();
    const logs: string[] = [];
    const { internals } = fakeInternals(() => ok(streamOf(assistant("No JSON here."))));

    await assert.rejects(runCursorAgent(internals, config, { ...request, onLog: (line) => logs.push(line) }), { kind: "badOutput" });
    assert.deepEqual(logs, ["Cursor Agent's reply, which isn't a JSON object:\nNo JSON here."]);
  });

  const failures: Array<{ name: string; respond: () => Promise<{ code: number; stdout: string; stderr: string; killed: boolean }>; kind: string; message: RegExp; abort?: boolean }> = [
    {
      name: "an unknown model",
      respond: async () => ({ code: 1, stdout: "", stderr: await fixture("stderr-bad-model.txt"), killed: false }),
      kind: "failed",
      message: /can't use the model "not-a-real-model"/,
    },
    {
      name: "an invalid API key",
      respond: async () => ({ code: 1, stdout: "", stderr: await fixture("stderr-invalid-key.txt"), killed: false }),
      kind: "auth",
      message: /isn't signed in/,
    },
    {
      name: "a timeout",
      respond: async () => ({ code: 143, stdout: "", stderr: "", killed: true }),
      kind: "timeout",
      message: /took too long/,
    },
    {
      name: "a stop",
      respond: async () => ({ code: 143, stdout: "", stderr: "", killed: true }),
      kind: "cancelled",
      message: /Stopped/,
      abort: true,
    },
    {
      name: "a reply without JSON",
      respond: async () => ok(streamOf(assistant("I can't review this."), { type: "result", is_error: false, result: "I can't review this." })),
      kind: "badOutput",
      message: /didn't return JSON/,
    },
    {
      name: "no reply",
      respond: async () => ok(""),
      kind: "badOutput",
      message: /didn't reply/,
    },
    {
      name: "a result marked as an error",
      respond: async () => ok(streamOf({ type: "result", is_error: true, result: "Rate limit exceeded" })),
      kind: "failed",
      message: /Cursor Agent failed \(1\): Rate limit exceeded/,
    },
    {
      name: "any other failure",
      respond: async () => ({ code: 2, stdout: "", stderr: "\x1b[31mSomething broke\x1b[0m", killed: false }),
      kind: "failed",
      message: /^Cursor Agent failed \(2\): Something broke$/,
    },
  ];

  for (const failure of failures) {
    test(`reports ${failure.name} as ${failure.kind} and still removes the workspace`, async () => {
      const { request } = await setup();
      const controller = new AbortController();
      if (failure.abort) controller.abort();
      const { internals } = fakeInternals(failure.respond);

      await assert.rejects(runCursorAgent(internals, config, { ...request, signal: controller.signal }), (error: unknown) => {
        assert.ok(error instanceof HarnessError);
        assert.equal(error.kind, failure.kind);
        assert.match(error.message, failure.message);
        return true;
      });
      assert.equal(await exists(request.workDir!), false);
    });
  }

  test("lets a missing CLI's ENOENT through, so the dispatcher reports it as missing", async () => {
    const { request } = await setup();
    const { internals } = fakeInternals(() => {
      throw Object.assign(new Error("spawn cursor-agent ENOENT"), { code: "ENOENT" });
    });

    await assert.rejects(runCursorAgent(internals, config, request), { code: "ENOENT" });
    assert.equal(await exists(request.workDir!), false);
  });
});

describe("cursorEnv", () => {
  test("adds CURSOR_API_KEY to the base environment and nothing else from Cursor or GitHub", () => {
    const env = cursorEnv(fakeInternals(() => ok("")).internals.baseEnv, {
      PATH: "/bin",
      HOME: "/home/me",
      CURSOR_API_KEY: "key",
      CURSOR_TRACE_ID: "trace",
      GH_TOKEN: "secret",
    });

    assert.deepEqual(env, { PATH: "/bin", HOME: "/home/me", CURSOR_API_KEY: "key" });
  });
});

describe("resolveCommand", () => {
  test("finds a bare command in the fallback folder when PATH doesn't have it", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "xrayviewer-bin-"));
    await writeFile(path.join(dir, "cursor-agent"), "#!/bin/sh\n");
    await chmod(path.join(dir, "cursor-agent"), 0o755);
    await writeFile(path.join(dir, "not-executable"), "");

    assert.equal(resolveCommand("cursor-agent", { PATH: "/nonexistent" }, [dir]), path.join(dir, "cursor-agent"));
    assert.equal(resolveCommand("not-executable", { PATH: "/nonexistent" }, [dir]), "not-executable");
    assert.equal(resolveCommand("missing-cli", { PATH: "/nonexistent" }, [dir]), "missing-cli");
    assert.equal(resolveCommand("/opt/custom/agent", { PATH: dir }, [dir]), "/opt/custom/agent");
  });
});
