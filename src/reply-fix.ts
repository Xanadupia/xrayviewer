import type { AgentRequest, AgentResult, BundleInternals, ErrorKind, Tokens } from "./cursor-harness.ts";

export type Usage = Pick<AgentResult, "costUsd" | "tokens" | "model">;

interface Unreadable {
  reply: string;
  usage: Usage;
}

export function addTokens(a: Tokens | null, b: Tokens | null): Tokens | null {
  if (!a || !b) return a ?? b;
  return { input: a.input + b.input, cachedInput: a.cachedInput + b.cachedInput, output: a.output + b.output };
}

function addUsage(earlier: Usage, later: Usage): Usage {
  return {
    costUsd: earlier.costUsd === null && later.costUsd === null ? null : (earlier.costUsd ?? 0) + (later.costUsd ?? 0),
    tokens: addTokens(earlier.tokens, later.tokens),
    model: later.model ?? earlier.model,
  };
}

/** Marks a harness error as a reply that came back but doesn't parse, with what that request used. */
export function unreadable<E extends Error>(error: E, reply: string, usage: Usage): E {
  const found: Unreadable = { reply, usage };
  return Object.assign(error, { unreadable: found });
}

function unreadableOf(error: unknown): Unreadable | null {
  const found = (error as { unreadable?: Unreadable } | null)?.unreadable;
  return found?.reply.trim() ? found : null;
}

/** Counts an earlier step, such as Claude Code's /code-review, in an unreadable reply's usage. */
export function withEarlierUsage(error: unknown, earlier: Usage): unknown {
  const found = unreadableOf(error);
  if (found) found.usage = addUsage(earlier, found.usage);
  return error;
}

/** Why the reply doesn't parse, in the parser's words. */
export function parseProblem(reply: string): string {
  const text = reply.trim();
  const start = text.indexOf("{");
  if (start === -1) return "it has no JSON object";
  try {
    JSON.parse(text.slice(start, text.lastIndexOf("}") + 1));
    return "it has text around the JSON object";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function fixPrompt(reply: string, problem: string): string {
  return `An earlier reply of yours, below, was meant to be one JSON object matching the schema, but it doesn't parse: ${problem}.

Write it again as valid JSON. Keep every field and value as it is and fix only the syntax, such as a bracket or brace that closes too early or too late, a missing comma or quote, or a backslash that isn't escaped. You don't need to read any files.

<reply>
${reply.trim()}
</reply>
`;
}

/**
 * Runs an agent. When its reply comes back but doesn't parse, sends that reply to the same harness and model once
 * more, with the parser's error, and asks for it as valid JSON. That request doesn't run Claude Code's /code-review
 * again. Cost, tokens and time cover both requests.
 */
export async function fixReply<H, R extends AgentRequest & { codeReview?: unknown }>(
  internals: BundleInternals,
  run: (harness: H, request: R) => Promise<AgentResult>,
  log: (line: string) => void,
  harness: H,
  request: R,
): Promise<AgentResult> {
  const started = Date.now();
  try {
    return await run(harness, request);
  } catch (error) {
    const found = unreadableOf(error);
    if (!found || request.signal?.aborted) throw error;
    const problem = parseProblem(found.reply);
    log(`sent JSON that doesn't parse, asking it to fix it: ${problem}`);
    request.onLog?.(`Asking for the reply again as valid JSON: ${problem}`);
    try {
      const fixed = await run(harness, { ...request, prompt: fixPrompt(found.reply, problem), codeReview: undefined });
      return { ...fixed, ...addUsage(found.usage, fixed), durationMs: Date.now() - started };
    } catch (retry) {
      const { kind, message, detail } = retry as { kind?: ErrorKind; message?: string; detail?: string };
      if (kind === "cancelled") throw retry;
      const first = (error as Error).message.replace(/\.$/, "");
      throw unreadableOf(retry)
        ? new internals.HarnessError("badOutput", `${first}, even when asked to fix it.`, detail)
        : new internals.HarnessError(kind ?? "failed", `${first}. Asking it to fix that failed: ${message}`, detail);
    }
  }
}
