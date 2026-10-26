/**
 * What the built-in agents are called, and the line under each name in the agent picker. The ids stay, since
 * agents.yml, the instruction files, saved reviews and each pull request's model choice refer to them. When an earlier
 * agents.yml is upgraded, a name or line that's still an earlier default gets the new one; anything someone wrote stays.
 */

const AGENTS = [
  {
    id: "guide",
    was: { name: "Guide agent", focus: "Checks the description, sets the reading order and draws the flow the change touches" },
    now: { name: "Overview agent", focus: "Checks the description, suggests a reading order and draws the flow it touches" },
  },
  {
    id: "architecture",
    was: { name: "Architecture agent", focus: "Where code lives: boundaries, existing patterns and code that shouldn't exist" },
    now: { name: "Architecture agent", focus: "Code in the wrong module, duplicated helpers and code that breaks the patterns around it" },
  },
  {
    id: "correctness",
    was: { name: "Correctness agent", focus: "Logic errors, races and edge cases" },
    now: { name: "Bugs agent", focus: "Logic errors, races and edge cases" },
  },
  {
    id: "tests",
    was: { name: "Test agent", focus: "Behavior changes that no test covers" },
    now: { name: "Test agent", focus: "Changed behavior that no test covers, and tests that wouldn't catch a bug" },
  },
  {
    id: "security",
    was: { name: "Security agent", focus: "Money movement, sign-in and input validation" },
    now: { name: "Security agent", focus: "Untrusted input, auth, secrets and data leaks" },
  },
];

const fields = (agent) => `${agent.id}:{name:${JSON.stringify(agent.was.name)},focus:${JSON.stringify(agent.was.focus)},`;

/** The fields each agent no longer has by default, by id, so agents.yml can drop them for the new ones. */
const PREVIOUS = Object.fromEntries(
  AGENTS.map((agent) => [agent.id, Object.fromEntries(Object.entries(agent.was).filter(([key, value]) => agent.now[key] !== value))]),
);

/**
 * The agents.yml comments that name the guide, as earlier versions wrote them and as they read now. A file whose header
 * still has the earlier first line hasn't been upgraded, so only then do its defaults change; after that, a name someone
 * writes stays even when it matches an earlier default.
 */
const COMMENTS = [
  {
    id: "agents-yml-guide-comment",
    was: "# agents: every agent X-RayViewer runs, in this order. The guide checks the description, sets the reading order and",
    now: "# agents: every agent X-RayViewer runs, in this order. The overview agent (guide) checks the description, suggests a reading order and",
  },
  {
    id: "agents-yml-lede-comment",
    was: "The lede (the briefing's opening line) uses the guide's harness.",
    now: "The lede (the briefing's opening line) uses the overview agent's harness.",
  },
  {
    id: "agents-yml-rules-comment",
    was: "# The rules the guide agent checks the pull request description against, per kind of change.",
    now: "# The rules the overview agent checks the pull request description against, per kind of change.",
  },
];

const overview = (id, find) => ({ id, find, replace: find.replaceAll("guide agent", "overview agent") });

export const AGENT_NAME_PATCHES = [
  ...AGENTS.map((agent) => ({
    id: `agent-defaults-${agent.id}`,
    find: fields(agent),
    replace: `${agent.id}:{name:${JSON.stringify(agent.now.name)},focus:${JSON.stringify(agent.now.focus)},`,
  })),
  ...COMMENTS.map((comment) => ({ id: comment.id, find: comment.was, replace: comment.now })),
  {
    id: "agents-yml-upgrade-comments",
    find: 'let e=n;e.includes("# name: what the review page calls it")',
    replace:
      `let e=n,xrvRenamed=!n.includes(${JSON.stringify(COMMENTS[0].now)});` +
      `if(xrvRenamed)for(let[r,o]of ${JSON.stringify(COMMENTS.map((comment) => [comment.was, comment.now]))})e=e.replace(r,o);` +
      'e.includes("# name: what the review page calls it")',
  },
  {
    id: "agents-yml-previous-defaults",
    find: 'o.items.unshift(o.items.splice(1,1)[0]),i=!0)}i&&await(0,W.writeFile)(ne(),t.toString(On),"utf8")}',
    replace:
      "o.items.unshift(o.items.splice(1,1)[0]),i=!0)}" +
      `if(xrvRenamed&&xe.default.isMap(s))for(let[r,x]of Object.entries(${JSON.stringify(PREVIOUS)})){let o=s.get(r,!0);if(xe.default.isMap(o))for(let[k,v]of Object.entries(x))o.get(k)===v&&(o.set(k,Xe.agents[r][k]),i=!0)}` +
      'i&&await(0,W.writeFile)(ne(),t.toString(On),"utf8")}',
  },
  {
    id: "guide-remove-message",
    find: "\"The guide can't be removed; turn it off with enabled: false instead.\"",
    replace: "\"The overview agent can't be removed; turn it off with enabled: false instead.\"",
  },
  overview("description-rule-note", "\"The guide agent didn't assess this rule.\""),
  overview("chapter-source", '"Grouped by the guide agent"'),
];

export const AGENT_NAME_UI_PATCHES = [
  overview("ui-description-check", "The guide agent checked ${own"),
  overview("ui-chapters-by", "Drafted by the guide agent${"),
  overview("ui-chapters-sheet", "The guide agent drafted these chapters"),
  overview("ui-flow-pick", '"The flow the guide agent drew" : `${DIAGRAMS.length} flows the guide agent drew`'),
  overview("ui-map-by", "Drawn by the guide agent from the diff."),
  overview(
    "ui-map-none",
    "\"The guide agent didn't draw a flow for this pull request. It leaves one out when the change has no runtime flow, such as docs or configuration only.\" : \"There's no flow diagram yet. Run the agents, and the guide agent draws the flow this pull request changes.\"",
  ),
  {
    id: "ui-map-reading-order",
    find: "in the order the guide suggests reading them",
    replace: "in the order the overview agent suggests reading them",
  },
];
