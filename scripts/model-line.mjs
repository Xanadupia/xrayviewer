/**
 * How a finished agent run is named on the review page. One harness and model stays a single line.
 * Different agents produce one segment each, with the agents that used it.
 * @param {Array<{ id?: string, name?: string, short?: string, harness?: string, model?: string, thinking?: string | null, effort?: string | null }> | null | undefined} agents
 */
export function modelSummary(agents) {
  const names = { claude: "Claude", codex: "Codex", pi: "Pi", cursor: "Cursor" };
  const harnessName = (id) => names[id] || id || "Unknown harness";
  const groups = [];
  for (const agent of agents || []) {
    const harness = agent.harness || "";
    const model = agent.model || "";
    const level = agent.thinking || agent.effort || "";
    if (!harness && !model) continue;
    let group = groups.find((item) => item.harness === harness && item.model === model && item.level === level);
    if (!group) {
      group = { harness, model, level, who: [] };
      groups.push(group);
    }
    group.who.push(agent.short || agent.name || agent.id);
  }
  const named = (group) => {
    const label = `${harnessName(group.harness)} · ${group.model || "CLI default"}`;
    return group.level ? `${label} · ${group.level}` : label;
  };
  const piece = (group) => (groups.length === 1 ? named(group) : `${named(group)} (${group.who.join(", ")})`);
  const line = groups.length ? `${groups.length === 1 ? "Model" : "Models"}: ${groups.map(piece).join("; ")}` : "";
  const caption = !groups.length ? "" : groups.length > 1 ? " · mixed models" : ` · ${groups[0].model || "CLI default"}${groups[0].level ? ` · ${groups[0].level}` : ""}`;
  const detail = (agent) => {
    if (!agent || (!agent.harness && !agent.model)) return "";
    const level = agent.thinking || agent.effort || "";
    return ` · ${harnessName(agent.harness)} · ${agent.model || "CLI default"}${level ? ` · ${level}` : ""}`;
  };
  return { line, caption, detail };
}
