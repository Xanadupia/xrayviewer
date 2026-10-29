/** What stacking needs from a sidebar row: its pull request and the branches GitHub reported for it. */
export interface StackRow {
  record: {
    key: { owner: string; name: string; number: number };
    summary?: {
      state?: string | null;
      baseRefName?: string | null;
      headRefName?: string | null;
      isCrossRepository?: boolean | null;
    } | null;
  };
}

export type StackedRow<R> = R & {
  children: StackedRow<R>[];
  /** The pull request this one builds on, when it's open in the sidebar. */
  stackedOn?: number;
  /** Set when that pull request is in another group, so this row isn't nested under it. */
  stackedElsewhere?: boolean;
};

function repoOf(row: StackRow): string {
  return `${row.record.key.owner}/${row.record.key.name}`.toLowerCase();
}

function isOpen(row: StackRow): boolean {
  return row.record.summary?.state === "OPEN";
}

/** The branch other pull requests target to build on this one. A fork's branch isn't in the base repository. */
function headOf(row: StackRow): string {
  const summary = row.record.summary;
  if (!isOpen(row) || !summary?.headRefName || summary.isCrossRepository) return "";
  return `${repoOf(row)}\0${summary.headRefName}`;
}

function baseOf(row: StackRow): string {
  const base = row.record.summary?.baseRefName;
  return isOpen(row) && base ? `${repoOf(row)}\0${base}` : "";
}

/** Each branch and the pull request it heads. A branch two pull requests share maps to null, so neither is a parent. */
function byHead<R extends StackRow>(rows: readonly R[]): Map<string, R | null> {
  const heads = new Map<string, R | null>();
  for (const row of rows) {
    const head = headOf(row);
    if (head) heads.set(head, heads.has(head) ? null : row);
  }
  return heads;
}

/**
 * Nests each open pull request under the open one in the same repository whose branch it merges into, keeping the
 * group's order. `elsewhere` holds the sidebar's other rows: a pull request built on one of those stays at the top
 * and names it.
 */
export function nestStacks<R extends StackRow>(rows: readonly R[], elsewhere: readonly StackRow[] = []): StackedRow<R>[] {
  const heads = byHead(rows);
  const otherHeads = byHead(elsewhere);
  const nodes = new Map<R, StackedRow<R>>(rows.map((row) => [row, { ...row, children: [] }]));
  const parentOf = new Map<R, R>();
  const reaches = (from: R, target: R) => {
    for (let at: R | undefined = from; at; at = parentOf.get(at)) if (at === target) return true;
    return false;
  };
  for (const row of rows) {
    const base = baseOf(row);
    const parent = base ? heads.get(base) : null;
    const node = nodes.get(row)!;
    if (parent && parent !== row && !reaches(parent, row)) {
      parentOf.set(row, parent);
      node.stackedOn = parent.record.key.number;
      continue;
    }
    const other = base ? otherHeads.get(base) : null;
    if (other) {
      node.stackedOn = other.record.key.number;
      node.stackedElsewhere = true;
    }
  }
  const roots: StackedRow<R>[] = [];
  for (const row of rows) {
    const parent = parentOf.get(row);
    (parent ? nodes.get(parent)!.children : roots).push(nodes.get(row)!);
  }
  return roots;
}
