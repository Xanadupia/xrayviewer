import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AgentRequest, AgentResult } from "../src/cursor-harness.ts";
import { fixReply, parseProblem, unreadable } from "../src/reply-fix.ts";
import { fakeInternals, HarnessError } from "./support/fake-internals.ts";

const { internals } = fakeInternals(() => {
  throw new Error("fixReply doesn't start processes itself");
});
const harness = { id: "cursor", command: "cursor-agent", model: "", extraArgs: [] };

/** The slip in the guide's reply on mondrian#10128: after a quoted `Promise.all([`, refs and the node closed after the first ref. */
const broken =
  '{"diagrams":[{"nodes":[{"id":"cooldowns","refs":[{"match":"const [a, b] = await Promise.all([","end":null}]},' +
  '{"match":"waitScope: a > 0","end":null}]},{"id":"cooldown-slot"}]}],"checked":[]}';
const fixedOutput = { diagrams: [{ nodes: [{ id: "cooldowns", refs: [{ match: "const [a, b] = await Promise.all([" }, { match: "waitScope: a > 0" }] }] }], checked: [] };

const notJson = (reply = broken) =>
  unreadable(new HarnessError("badOutput", "Cursor Agent didn't return JSON.", reply.slice(-20)), reply, {
    costUsd: 0.01,
    tokens: { input: 100, cachedInput: 80, output: 40 },
    model: "auto",
  });

const success: AgentResult = { output: fixedOutput, costUsd: 0.02, tokens: { input: 30, cachedInput: 0, output: 35 }, model: "composer-2.5", durationMs: 5 };

type Request = AgentRequest & { codeReview?: unknown };

function scripted(...steps: Array<AgentResult | Error>) {
  const calls: Array<{ harness: unknown; request: Request }> = [];
  const run = async (h: unknown, request: Request) => {
    calls.push({ harness: h, request });
    const step = steps.shift();
    if (!step) throw new Error("no more steps");
    if (step instanceof Error) throw step;
    return step;
  };
  return { run, calls };
}

function request(overrides: Partial<Request> = {}): Request {
  return { prompt: "You are the Guide agent.", schema: { type: "object" }, cwd: "/repo", readDirs: ["/run"], model: "auto", workDir: "/run/cursor-guide", timeoutMs: 60_000, ...overrides };
}

describe("fixReply", () => {
  test("a reply that parses comes back as it is, from one request", async () => {
    const { run, calls } = scripted(success);
    const logs: string[] = [];

    const result = await fixReply(internals, run, (line) => logs.push(line), harness, request());

    assert.equal(result, success);
    assert.equal(calls.length, 1);
    assert.deepEqual(logs, []);
  });

  test("sends a reply that doesn't parse back to the same harness and model once, with the parser's error", async () => {
    const { run, calls } = scripted(notJson(), success);
    const logs: string[] = [];
    const agentLog: string[] = [];
    const first = request({ codeReview: { args: "high a...b" }, onLog: (line: string) => agentLog.push(line) });

    const result = await fixReply(internals, run, (line) => logs.push(line), harness, first);

    assert.equal(calls.length, 2);
    const [, fix] = calls;
    assert.equal(fix.harness, harness);
    const { prompt, codeReview, ...same } = fix.request;
    const { prompt: _prompt, codeReview: _codeReview, ...asked } = first;
    assert.deepEqual(same, asked, "same model, schema, folders, workspace and timeout");
    assert.equal(codeReview, undefined, "Claude Code's /code-review doesn't run again");
    assert.match(String(prompt), /doesn't parse: Unexpected non-whitespace character after JSON at position \d+/);
    assert.ok(String(prompt).includes(`<reply>\n${broken}\n</reply>`), "the whole reply goes back");
    assert.deepEqual(result.output, fixedOutput);
    assert.equal(result.costUsd, 0.03);
    assert.deepEqual(result.tokens, { input: 130, cachedInput: 80, output: 75 });
    assert.equal(result.model, "composer-2.5");
    assert.equal(logs.length, 1);
    assert.match(logs[0], /^sent JSON that doesn't parse, asking it to fix it: Unexpected non-whitespace character after JSON/);
    assert.match(agentLog[0], /^Asking for the reply again as valid JSON: /);
  });

  test("asks only once: a fixed reply that still doesn't parse fails as bad output", async () => {
    const { run, calls } = scripted(notJson(), notJson("still {not json"));

    await assert.rejects(fixReply(internals, run, () => {}, harness, request()), {
      kind: "badOutput",
      message: "Cursor Agent didn't return JSON, even when asked to fix it.",
    });
    assert.equal(calls.length, 2);
  });

  test("a request to fix it that fails another way says so, with that failure's kind", async () => {
    const { run } = scripted(notJson(), new HarnessError("timeout", "The agent took too long and was stopped."));

    await assert.rejects(fixReply(internals, run, () => {}, harness, request()), {
      kind: "timeout",
      message: "Cursor Agent didn't return JSON. Asking it to fix that failed: The agent took too long and was stopped.",
    });
  });

  test("a stop before or during the request to fix it stays a stop", async () => {
    const stopped = new AbortController();
    stopped.abort();
    const before = scripted(notJson(), success);
    await assert.rejects(fixReply(internals, before.run, () => {}, harness, request({ signal: stopped.signal })), { kind: "badOutput" });
    assert.equal(before.calls.length, 1, "nothing more runs after a stop");

    const during = scripted(notJson(), new HarnessError("cancelled", "Stopped."));
    await assert.rejects(fixReply(internals, during.run, () => {}, harness, request()), { kind: "cancelled", message: "Stopped." });
  });

  test("only a reply that came back and doesn't parse is sent back", async () => {
    for (const error of [
      new HarnessError("timeout", "The agent took too long and was stopped."),
      new HarnessError("badOutput", "Cursor Agent didn't reply."),
      notJson("   "),
    ]) {
      const { run, calls } = scripted(error, success);
      await assert.rejects(fixReply(internals, run, () => {}, harness, request()), (thrown) => thrown === error);
      assert.equal(calls.length, 1, error.message);
    }
  });
});

describe("parseProblem", () => {
  test("says why a reply doesn't parse", () => {
    assert.equal(parseProblem("I can't review this."), "it has no JSON object");
    assert.equal(parseProblem('Here it is: {"findings":[]} Done.'), "it has text around the JSON object");
    assert.match(parseProblem(broken), /^Unexpected non-whitespace character after JSON at position \d+/);
    assert.match(parseProblem('{"findings":[{"title":"a"]}'), /^Expected ',' or '}' after property value/);
  });
});
