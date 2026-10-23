export interface SortableRow {
  record?: {
    key?: { number?: number };
    summary?: { title?: string; createdAt?: string; updatedAt?: string; additions?: number; deletions?: number };
  };
  risk?: { score?: number };
}

const updatedAt = (row: SortableRow) => String(row.record?.summary?.updatedAt || "");
const byUpdated = (left: SortableRow, right: SortableRow) => updatedAt(right).localeCompare(updatedAt(left));

/**
 * Order of pull requests inside a sidebar group. Every group uses this, including Not reviewed and Reviewed.
 * Risk, date and size put the largest first. Title is A to Z.
 */
export function comparePullRequests(sortBy: string): (left: SortableRow, right: SortableRow) => number {
  switch (sortBy) {
    case "created":
      return (left, right) => String(right.record?.summary?.createdAt || "").localeCompare(String(left.record?.summary?.createdAt || "")) || byUpdated(left, right);
    case "updated":
      return byUpdated;
    case "title":
      return (left, right) => String(left.record?.summary?.title || "").localeCompare(String(right.record?.summary?.title || "")) || byUpdated(left, right);
    case "size":
      return (left, right) => sizeOf(right) - sizeOf(left) || byUpdated(left, right);
    case "number":
      return (left, right) => (right.record?.key?.number || 0) - (left.record?.key?.number || 0);
    default:
      return (left, right) => (right.risk?.score ?? -1) - (left.risk?.score ?? -1) || byUpdated(left, right);
  }
}

function sizeOf(row: SortableRow): number {
  return (row.record?.summary?.additions || 0) + (row.record?.summary?.deletions || 0);
}

/**
 * The CLI could not start because the same agent is already busy. The run should wait and try again,
 * rather than fail the pull request.
 */
export function agentUnavailable(error: unknown): boolean {
  const text = errorText(error).toLowerCase();
  return /busy|unavailable|try again|temporarily|another instance|already running|resource temporarily|too many requests|rate limit|\b429\b|locked|could not start|no agent is free/.test(text);
}

function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) {
    const detail = "detail" in error ? String((error as { detail?: unknown }).detail ?? "") : "";
    return `${error.message}\n${detail}`;
  }
  if (error && typeof error === "object") {
    const item = error as { message?: unknown; detail?: unknown };
    return `${String(item.message ?? "")}\n${String(item.detail ?? "")}`;
  }
  return "";
}
