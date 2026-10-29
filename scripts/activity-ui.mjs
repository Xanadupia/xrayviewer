/**
 * The Agent activity sheet: the agents listed the way GitHub lists a pull request's checks, and each agent's log with
 * its commands, reads and searches folded into one line between its messages, the way the Claude app shows them.
 * Each function is copied into the review page as written, so it keeps its data inside and calls only the others here.
 * The page passes in its `esc` and `icon` helpers and its agent avatar.
 */

/** @param {number} ms */
export function activityTime(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/**
 * Messages stand on their own; the steps between two messages fold into one group.
 * @template {{ kind: string }} T
 * @param {T[]} steps
 * @returns {Array<{ kind: "message", step: T } | { kind: "group", steps: T[] }>}
 */
export function activityGroups(steps) {
  /** @type {Array<{ kind: "message", step: T } | { kind: "group", steps: T[] }>} */
  const out = [];
  for (const step of steps) {
    if (step.kind === "message") {
      out.push({ kind: "message", step });
      continue;
    }
    const last = out[out.length - 1];
    if (last && last.kind === "group") last.steps.push(step);
    else out.push({ kind: "group", steps: [step] });
  }
  return out;
}

/**
 * One line for a group, like "Ran 2 commands, read math.js". A step still running reads in the present tense.
 * @param {Array<{ kind: string, title: string, state: string }>} steps
 * @param {boolean} live whether the agent is still running
 */
export function activitySummary(steps, live) {
  const words = {
    command: ["ran", "command", "commands", "running"],
    read: ["read", "file", "files", "reading"],
    search: ["searched", "pattern", "patterns", "searching for"],
    thinking: ["thought", "time", "times", "thinking"],
    tool: ["used", "tool", "tools", "using"],
  };
  const order = ["command", "read", "search", "tool", "thinking"];
  const firstLine = (text) => text.split("\n")[0];
  const running = live ? steps.filter((step) => step.state === "running") : [];
  const done = steps.filter((step) => !running.includes(step));
  const parts = [];
  for (const kind of order) {
    const these = done.filter((step) => step.kind === kind);
    if (!these.length) continue;
    const [verb, one, many] = words[kind];
    if (kind === "thinking") parts.push(these.length === 1 ? verb : `${verb} ${these.length} ${many}`);
    else if (kind === "tool" && these.length <= 2) parts.push(...these.map((step) => step.title.charAt(0).toLowerCase() + step.title.slice(1)));
    else if (these.length > 1) parts.push(`${verb} ${these.length} ${many}`);
    else if (kind === "read" || kind === "search") parts.push(`${verb} ${firstLine(these[0].title)}`);
    else parts.push(`${verb} 1 ${one}`);
  }
  const failed = done.filter((step) => step.state === "failed").length;
  if (failed) parts.push(`${failed} failed`);
  const now = running[running.length - 1];
  if (now) {
    const verb = words[now.kind] ? words[now.kind][3] : "working";
    parts.push(now.kind === "thinking" ? verb : now.kind === "tool" ? now.title.charAt(0).toLowerCase() + now.title.slice(1) : `${verb} ${firstLine(now.title)}`);
  }
  const line = parts.join(", ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/**
 * The sheet's body. Without `view.detail` it lists the agents the way GitHub lists a pull request's checks: a header
 * that sums them up, then one row per agent under its status, each with a ⋯ button that opens its log. With
 * `view.detail` set to an agent it shows that agent's steps, the way GitHub shows a job's log.
 * `view.open` remembers which rows the reader opened or closed, by `data-key`. An agent whose progress has `by` is
 * reviewed inside that agent, such as the Code review agent's /code-review: it sits under that agent's row, with its
 * status and steps.
 * @param {{ agents?: Record<string, any>, activity?: Record<string, { steps: any[], dropped: number }> } | null | undefined} progress
 * @param {Array<{ id: string, name?: string, harness?: string, model?: string, thinking?: string | null }> | null | undefined} plan
 * @param {{ esc: (s: string) => string, icon: (name: string, cls?: string) => string, now: number, open: Map<string, boolean>, detail?: string, avatar?: string }} view
 */
export function activityHTML(progress, plan, view) {
  const { esc, icon, now, open } = view;
  const agents = (progress && progress.agents) || {};
  const activity = (progress && progress.activity) || {};
  const ids = Object.keys(agents);
  if (!ids.length) {
    return `<p class="act-empty">No agent run on this pull request yet. Run the agents to watch each one read the change, run commands and write its review here.</p>`;
  }
  const harnesses = { claude: "Claude Code", codex: "Codex", cursor: "Cursor Agent" };
  const verbs = { command: "Ran", read: "Read", search: "Searched" };
  const planned = (id) => (plan || []).find((agent) => agent.id === id) || null;
  const byOf = (id) => {
    const by = agents[id] && agents[id].by;
    return by && by !== id && agents[by] && !agents[by].by ? by : "";
  };
  const nameOf = (id) => {
    if (agents[id] && agents[id].name) return agents[id].name;
    const entry = planned(id);
    if (entry && entry.name) return entry.name;
    if (id === "lede") return "Summary";
    const words = id.replace(/[-_]+/g, " ");
    return words.charAt(0).toUpperCase() + words.slice(1);
  };
  const isOpen = (key, fallback) => (open.has(key) ? open.get(key) : fallback);
  const toggle = (key, opened, cls, summary, body) =>
    `<details class="${cls}" data-key="${esc(key)}" data-was="${opened ? 1 : 0}"${opened ? " open" : ""}><summary tabindex="0">${summary}</summary>${body}</details>`;
  const timeHTML = (ms, since) =>
    since ? `<span class="act-time" data-since="${since}">${activityTime(now - since)}</span>` : ms ? `<span class="act-time">${activityTime(ms)}</span>` : "";
  const prose = (text) => esc(text).replace(/`([^`\n]+)`/g, "<code>$1</code>");
  const mark = (state) => (state === "running" ? `<span class="spin" aria-label="Running"></span>` : state === "failed" ? icon("x-circle", "act-bad") : "");

  const stepHTML = (jobId, step, live) => {
    const state = step.state === "running" && !live ? "done" : step.state;
    const cls = `act-step${step.sub ? " act-sub" : ""}${state === "failed" ? " is-failed" : ""}`;
    const time = timeHTML(step.ms, state === "running" ? step.startedAt : 0);
    if (step.kind === "thinking") {
      const label = state === "running" ? "Thinking" : step.ms >= 1000 ? `Thought for ${activityTime(step.ms)}` : "Thought";
      return toggle(`s:${jobId}:${step.id}`, isOpen(`s:${jobId}:${step.id}`, false), cls, `${mark(state)}<span class="act-verb">${label}</span>`, `<p class="act-thought">${prose(step.title)}</p>`);
    }
    const head = verbs[step.kind]
      ? `${mark(state)}<span class="act-verb">${verbs[step.kind]}</span><code class="act-title">${esc(step.title)}</code>${time}`
      : `${mark(state)}<span class="act-title act-plain">${esc(step.title)}</span>${time}`;
    if (!step.detail) return `<div class="${cls}">${head}</div>`;
    const label = step.kind === "command" ? "Output" : state === "failed" ? "Error" : "Result";
    return toggle(`s:${jobId}:${step.id}`, isOpen(`s:${jobId}:${step.id}`, state === "failed"), cls, head, `<pre class="act-out" aria-label="${label}">${esc(step.detail)}</pre>`);
  };

  const stateOf = (id) => (byOf(id) ? stateOf(byOf(id)) : (agents[id] && agents[id].state) || "queued");
  const metaOf = (id) => {
    if (byOf(id)) return metaOf(byOf(id));
    const info = agents[id] || {};
    const entry = planned(id);
    const harness = info.harness || (entry && entry.harness) || "";
    const same = entry && entry.harness === harness;
    const model = same ? entry.model || "CLI default" : "";
    const level = same ? entry.thinking || "" : "";
    return { harness, line: [harnesses[harness] || harness, model, level].filter(Boolean).join(" · ") };
  };
  const skippedMark = '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3.6 12.4l8.8-8.8" stroke="currentColor" stroke-width="1.5"/></svg>';
  const markHTML = (state) => {
    const marks = {
      running: `<span class="spin" aria-label="In progress"></span>`,
      queued: `<span aria-label="Queued">${icon("clock")}</span>`,
      done: `<span aria-label="Successful">${icon("check")}</span>`,
      failed: `<span aria-label="Failed">${icon("x")}</span>`,
      cancelled: `<span aria-label="Cancelled">${skippedMark}</span>`,
      skipped: `<span aria-label="Skipped">${skippedMark}</span>`,
    };
    return `<span class="check-mark is-${esc(state)}">${marks[state] || marks.queued}</span>`;
  };
  const statusHTML = (id) => {
    if (byOf(id)) return `Covered by ${esc(nameOf(byOf(id)))} · ${statusHTML(byOf(id))}`;
    const info = agents[id] || {};
    const state = stateOf(id);
    const took = info.ms ? ` ${activityTime(info.ms)}` : "";
    if (state === "running") return `In progress${info.startedAt ? ` for ${timeHTML(0, info.startedAt)}` : ""}`;
    if (state === "queued") return "Queued";
    if (state === "done") return `Successful${took ? ` in${took}` : ""}`;
    if (state === "failed") return `Failed${took ? ` after${took}` : ""}`;
    if (state === "cancelled") return `Cancelled${took ? ` after${took}` : ""}`;
    return `Skipped${info.error ? `: ${esc(info.error)}` : ""}`;
  };
  const costHTML = (id) => {
    const cost = agents[id] && agents[id].costUsd;
    return typeof cost === "number" && cost > 0 ? `<span class="check-pill">$${cost.toFixed(3)}</span>` : "";
  };

  const logHTML = (id) => {
    const by = byOf(id);
    if (by) {
      return `<p class="act-note">${esc(nameOf(by))} reviews for this agent, using its instructions, and its findings for it show under ${esc(nameOf(id))}. Its steps:</p>${logHTML(by)}`;
    }
    const info = agents[id] || {};
    const state = stateOf(id);
    const live = state === "running";
    const record = activity[id] || { steps: [], dropped: 0 };
    const parts = [];
    if (record.dropped) parts.push(`<p class="act-note">${record.dropped} earlier ${record.dropped === 1 ? "step isn't" : "steps aren't"} shown.</p>`);
    for (const group of activityGroups(record.steps)) {
      if (group.kind === "message") {
        const typing = live && group.step.state === "running";
        parts.push(`<p class="act-msg${group.step.sub ? " act-sub" : ""}${typing ? " is-typing" : ""}">${prose(group.step.title)}</p>`);
        continue;
      }
      if (group.steps.length === 1 && group.steps[0].kind === "thinking") {
        parts.push(stepHTML(id, group.steps[0], live));
        continue;
      }
      const key = `g:${id}:${group.steps[0].id}`;
      const busy = live && group.steps.some((step) => step.state === "running");
      const failed = group.steps.some((step) => step.state === "failed");
      const head = `${icon("chev", "act-chev")}<span class="act-sum">${esc(activitySummary(group.steps, live))}</span>${busy ? `<span class="spin" aria-label="Running"></span>` : failed ? icon("x-circle", "act-bad") : ""}`;
      parts.push(toggle(key, isOpen(key, busy), "act-group", head, `<div class="act-steps">${group.steps.map((step) => stepHTML(id, step, live)).join("")}</div>`));
    }
    if (state === "queued") parts.push(`<p class="act-note">Waiting for a free slot.</p>`);
    else if (state === "skipped") parts.push(`<p class="act-note">This agent didn't run.</p>`);
    else if (!record.steps.length && live) parts.push(`<p class="act-note">Starting…</p>`);
    else if (!record.steps.length) parts.push(`<p class="act-note">No steps reported.</p>`);
    if ((state === "failed" || state === "cancelled") && info.error) parts.push(`<p class="act-error">${icon("alert")}<span>${esc(info.error)}</span></p>`);
    return parts.join("");
  };

  const detail = view.detail && agents[view.detail] ? view.detail : "";
  if (detail) {
    return `<div class="job-detail" data-agent="${esc(detail)}">
      <button type="button" class="act-back" data-act="activity-back">${icon("left")}All agents</button>
      <div class="job-head">${markHTML(stateOf(detail))}<div class="job-title"><b class="job-name">${esc(nameOf(detail))}</b><span class="job-meta">${esc(metaOf(detail).line)}</span><span class="job-status">${statusHTML(detail)}</span></div>${costHTML(detail)}</div>
      <div class="job-body">${logHTML(detail)}</div>
    </div>`;
  }

  const bucketOf = (state) => ({ failed: "failing", cancelled: "cancelled", running: "progress", skipped: "skipped", done: "successful" })[state] || "queued";
  const agentsWord = (n) => (n === 1 ? "agent" : "agents");
  const buckets = [
    { id: "failing", word: "failing", group: (n) => `${n} failing ${agentsWord(n)}` },
    { id: "cancelled", word: "cancelled", group: (n) => `${n} cancelled ${agentsWord(n)}` },
    { id: "progress", word: "in progress", group: (n) => `${n} ${agentsWord(n)} in progress` },
    { id: "queued", word: "queued", group: (n) => `${n} queued ${agentsWord(n)}` },
    { id: "skipped", word: "skipped", group: (n) => `${n} skipped ${agentsWord(n)}` },
    { id: "successful", word: "successful", group: (n) => `${n} successful ${agentsWord(n)}` },
  ].map((bucket) => ({ ...bucket, ids: ids.filter((id) => !byOf(id) && bucketOf(stateOf(id)) === bucket.id) }));
  const shown = ids.filter((id) => !byOf(id)).length;
  const count = (bucketId) => (buckets.find((bucket) => bucket.id === bucketId) || { ids: [] }).ids.length;
  const unfinished = count("progress") + count("queued");
  const unsuccessful = count("failing") + count("cancelled");
  const title = unfinished ? "Some agents haven't finished yet" : unsuccessful ? "Some agents were not successful" : count("successful") ? "All agents have finished" : "Every agent was skipped";
  const tally = buckets.filter((bucket) => bucket.ids.length).map((bucket) => `${bucket.ids.length} ${bucket.word}`).join(", ") + ` ${agentsWord(shown)}`;

  const ring = () => {
    const r = 9;
    const around = 2 * Math.PI * r;
    const tones = [["successful", "ok"], ["failing", "bad"], ["cancelled", "ink-3"], ["progress", "warn"], ["queued", "warn"], ["skipped", "ink-3"]];
    let start = 0;
    const arcs = tones.map(([bucketId, tone]) => {
      const length = (count(bucketId) / shown) * around;
      const arc = length ? `<circle cx="12" cy="12" r="${r}" fill="none" stroke="var(--${tone})" stroke-width="3" stroke-dasharray="${length.toFixed(2)} ${(around - length).toFixed(2)}" stroke-dashoffset="${(-start).toFixed(2)}"/>` : "";
      start += length;
      return arc;
    });
    return `<svg class="checks-ring${unfinished ? " is-live" : ""}" viewBox="0 0 24 24" aria-hidden="true"><g transform="rotate(-90 12 12)">${arcs.join("")}</g></svg>`;
  };

  const rowHTML = (id, sub) => {
    const name = nameOf(id);
    const meta = metaOf(id).line;
    const more = `<button type="button" class="check-more" data-act="activity-detail" data-id="${esc(id)}" aria-label="View details for ${esc(name)}" title="View details"><svg class="i" viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r="1.4" fill="currentColor"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/><circle cx="13" cy="8" r="1.4" fill="currentColor"/></svg></button>`;
    return `<li class="check is-${esc(stateOf(id))}${sub ? " is-sub" : ""}">${markHTML(stateOf(id))}${view.avatar || ""}<button type="button" class="check-name" data-act="activity-detail" data-id="${esc(id)}"${meta ? ` title="${esc(`${name} / ${meta}`)}"` : ""}><b>${esc(name)}</b>${meta ? ` / ${esc(meta)}` : ""}</button><span class="check-status">${statusHTML(id)}</span>${costHTML(id)}${more}</li>`;
  };
  const groups = buckets
    .filter((bucket) => bucket.ids.length)
    .map((bucket) => toggle(`c:${bucket.id}`, isOpen(`c:${bucket.id}`, true), "checks-group", `<span class="checks-group-name">${bucket.group(bucket.ids.length)}</span>${icon("chev", "checks-chev")}`, `<ul class="checks-list">${bucket.ids.map((id) => rowHTML(id) + ids.filter((other) => byOf(other) === id).map((other) => rowHTML(other, true)).join("")).join("")}</ul>`));
  return `<section class="checks" aria-label="Agents">
    <header class="checks-head">${ring()}<div><b class="checks-title">${title}</b><span class="checks-tally">${tally}</span></div></header>
    ${groups.join("")}
  </section>`;
}
