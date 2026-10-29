import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { nestStacks, type StackedRow, type StackRow } from "../src/pr-stacks.ts";

type Row = StackRow & { kind: "pr" };

const pr = (number: number, base: string, head: string, extra: Partial<NonNullable<StackRow["record"]["summary"]>> & { repo?: string } = {}): Row => {
  const { repo = "acme/app", ...summary } = extra;
  const [owner, name] = repo.split("/");
  return { kind: "pr", record: { key: { owner, name, number }, summary: { state: "OPEN", baseRefName: base, headRefName: head, ...summary } } };
};

const shape = (rows: StackedRow<Row>[]): unknown[] =>
  rows.map((row) => (row.children.length ? { [row.record.key.number]: shape(row.children) } : row.record.key.number));

describe("stacked pull requests in the sidebar", () => {
  test("nest under the pull request whose branch they merge into, as deep as the stack goes", () => {
    const rows = [pr(30, "hover", "pill-stop"), pr(12, "main", "docs"), pr(28, "main", "notes"), pr(29, "notes", "hover")];
    const nested = nestStacks(rows);

    assert.deepEqual(shape(nested), [12, { 28: [{ 29: [30] }] }], "a stack sits where its bottom pull request sorts");
    assert.equal(nested[1].children[0].stackedOn, 28);
    assert.equal(nested[1].children[0].stackedElsewhere, undefined);
    assert.equal(nested[0].stackedOn, undefined);
  });

  test("keep the group's order among pull requests built on the same one", () => {
    assert.deepEqual(shape(nestStacks([pr(28, "main", "notes"), pr(41, "notes", "b"), pr(40, "notes", "a")])), [{ 28: [41, 40] }]);
  });

  test("keep every field of the row, so it opens, hovers and checks the same", () => {
    const [root] = nestStacks([{ ...pr(28, "main", "notes"), risk: "high" }, { ...pr(29, "notes", "hover"), risk: "low" }]);
    assert.equal(root.kind, "pr");
    assert.equal(root.risk, "high");
    assert.equal(root.children[0].risk, "low");
  });

  test("don't nest under a fork's branch, which isn't in the base repository", () => {
    const rows = [pr(7, "main", "main", { isCrossRepository: true }), pr(8, "main", "feature")];
    assert.deepEqual(shape(nestStacks([...rows, pr(9, "main", "fix")])), [7, 8, 9], "a fork opened from its main isn't the parent of everything on main");
    assert.deepEqual(shape(nestStacks([pr(28, "main", "notes"), pr(31, "notes", "x", { isCrossRepository: true })])), [{ 28: [31] }], "a fork can build on a branch here");
  });

  test("don't nest across repositories, or under a branch two pull requests share", () => {
    assert.deepEqual(shape(nestStacks([pr(28, "main", "notes"), pr(5, "notes", "x", { repo: "acme/web" })])), [28, 5]);
    assert.deepEqual(shape(nestStacks([pr(28, "main", "notes", { repo: "Acme/App" }), pr(29, "notes", "x")])), [{ 28: [29] }], "owner and name ignore case");
    assert.deepEqual(shape(nestStacks([pr(28, "main", "notes"), pr(27, "dev", "notes", { isCrossRepository: false }), pr(29, "notes", "x")])), [28, 27, 29]);
  });

  test("leave merged and closed pull requests flat", () => {
    assert.deepEqual(shape(nestStacks([pr(28, "main", "notes", { state: "MERGED" }), pr(29, "notes", "x")])), [28, 29]);
    assert.deepEqual(shape(nestStacks([pr(28, "main", "notes"), pr(29, "notes", "x", { state: "CLOSED" })])), [28, 29]);
  });

  test("show each pull request once when two branches point at each other", () => {
    const nested = nestStacks([pr(1, "b", "a"), pr(2, "a", "b"), pr(3, "b", "c")]);
    assert.deepEqual(shape(nested), [{ 2: [1, 3] }], "the link that would close the loop is the one left out");
  });

  test("say which pull request one builds on when that one is in another group, and stay at the top", () => {
    const yours = [pr(28, "main", "notes")];
    const requested = nestStacks([pr(29, "notes", "hover"), pr(12, "main", "docs")], yours);

    assert.deepEqual(shape(requested), [29, 12]);
    assert.equal(requested[0].stackedOn, 28);
    assert.equal(requested[0].stackedElsewhere, true);
    assert.equal(requested[1].stackedOn, undefined);
  });

  test("leave rows GitHub hasn't described yet where they are", () => {
    const bare: Row = { kind: "pr", record: { key: { owner: "acme", name: "app", number: 3 } } };
    assert.deepEqual(shape(nestStacks([bare, pr(28, "main", "notes")])), [3, 28]);
  });
});
