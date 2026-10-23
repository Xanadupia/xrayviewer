import { homedir } from "node:os";
import { claudeModelName, listClaudeModels, readClaudeCatalog } from "./claude-models.ts";
import { createActivityLog } from "./activity.ts";
import {
  claudeResult,
  codeReviewResults,
  findingSchema,
  planCodeReview,
  plannedWithCodeReview,
  runCodeReview,
  withRealPaths,
  type ClaudeConfig,
  type CodeReviewRequest,
} from "./claude-review.ts";
import { resolveCommand, runCursorAgent, type AgentRequest, type AgentResult, type BundleInternals, type CursorConfig } from "./cursor-harness.ts";
import { pickCursorModel, type AgentRef, type PickerDeps } from "./cursor-model-picker.ts";
import { listCursorModels } from "./cursor-models.ts";
import { availableUpdates, installCli, updateInstalledCli } from "./cli-updates.ts";
import { installedSummary, latestCommand, listClaudeVersions, listCodexVersions, type InstalledCli } from "./installed-versions.ts";
import { listCodexModels } from "./codex-models.ts";
import { harnessPicker, type PickerAgent } from "./harness-picker.ts";
import { agentUnavailable, comparePullRequests } from "./agent-pool.ts";
import { activityBody, activityPanelHTML, bindActivity, onActivityMessage, publishActivity } from "./activity-panel.ts";
import { answerNotice, bindNotice, cancelNotices, clearNotice, holdNotice, offerNotice } from "./page-notice.ts";
import { armAutoPost, checkedKeys, chosenPullRequests, clearAutoPost, clearChecked, isChecked, selectionBarHTML, setChecked, wantsAutoPost } from "./sidebar-batch.ts";
import { announceChoice, plannedAgents, type AgentSetting, type HarnessId, type HarnessTable, type NoticeDeps, type RunChoice } from "./run-confirm.ts";
import { officialInstallCommand, pickCliVersion, runOfficialInstall, type CliId, type VersionPickerDeps } from "./version-picker.ts";

/** What each agent runs on, with Claude Code models named with their versions. `all` includes agents turned off. */
async function namedPlan(harnesses: HarnessTable, agents: Record<string, AgentSetting>, all = false) {
  const shown = all ? Object.fromEntries(Object.entries(agents).map(([id, agent]) => [id, { ...agent, enabled: true }])) : agents;
  const command = harnesses.claude?.command;
  const usesClaude = Object.values(shown).some((agent) => agent.enabled && (agent.harness || harnesses.default) === "claude");
  const catalog = usesClaude && command ? await readClaudeCatalog(resolveCommand(command)) : null;
  return plannedAgents(shown, harnesses, (harness, model) => (harness === "claude" ? claudeModelName(catalog, model) : ""));
}

function cliCatalog(id: CliId) {
  switch (id) {
    case "claude":
      return { list: () => listClaudeVersions(homedir()), listModels: listClaudeModels };
    case "codex":
      return { list: () => listCodexVersions(homedir()), listModels: listCodexModels };
    default: {
      const never: never = id;
      return never;
    }
  }
}

/** Entry point the patched bundle requires as `./cursor-harness.cjs`. */
export function createCursorHarness(internals: BundleInternals) {
  return {
    run: (config: CursorConfig, request: AgentRequest) => runCursorAgent(internals, config, request),
    planCodeReview,
    findingSchema,
    codeReviewResults,
    activityLog: (roots: string[], onChange: () => void) => createActivityLog(withRealPaths(roots), onChange),
    claudeResult,
    codeReview: (config: ClaudeConfig, request: CodeReviewRequest, runClaude: (config: ClaudeConfig, request: AgentRequest) => Promise<AgentResult>) =>
      runCodeReview(internals, config, request, runClaude),
    resolveCommand: (command: string) => resolveCommand(command),
    latestCommand: (id: InstalledCli, configured: string) => latestCommand(id, configured, homedir()),
    pickModel: (deps: Omit<PickerDeps, "listModels">, agent: AgentRef | null) =>
      pickCursorModel({ ...deps, listModels: () => listCursorModels(internals, deps.readConfig()) }, agent),
    installedSummary: (id: CliId) => installedSummary(id, homedir()),
    pickCli: (deps: Omit<VersionPickerDeps, "list" | "install">, id: CliId, agent: { id?: string; name: string } | null) =>
      pickCliVersion({ ...deps, ...cliCatalog(id), install: () => runOfficialInstall(officialInstallCommand(id)) }, id, agent),
    announceChoice: async (deps: NoticeDeps, { agents, harnesses, ...choice }: RunChoice & { agents?: Record<string, AgentSetting>; harnesses?: HarnessTable }) => {
      const plan = agents && harnesses ? await namedPlan(harnesses, agents) : undefined;
      if (choice.harness !== "claude" || !choice.settings.command) return announceChoice(deps, { ...choice, plan });
      const catalog = await readClaudeCatalog(resolveCommand(choice.settings.command));
      return announceChoice(deps, { ...choice, plan, modelName: claudeModelName(catalog, choice.agent?.model || choice.settings.model) });
    },
    harnessPicker: async (harnesses: HarnessTable, agents: Record<string, AgentSetting & PickerAgent>, installed: Record<HarnessId, string>, guideId: string) =>
      harnessPicker({ agents, plan: await namedPlan(harnesses, agents, true), installed, updates: await availableUpdates(installed), guideId }),
    updateCli: (deps: Parameters<typeof updateInstalledCli>[0], id: InstalledCli) => updateInstalledCli(deps, id, homedir()),
    installCli: (deps: Parameters<typeof installCli>[0], id: InstalledCli) => installCli(deps, id, homedir()),
    bindNotice,
    answerNotice,
    offerNotice,
    holdNotice,
    clearNotice,
    cancelNotices,
    comparePullRequests,
    agentUnavailable,
    activityPanelHTML,
    activityBody,
    bindActivity,
    onActivityMessage,
    publishActivity,
    chosenPullRequests,
    isChecked,
    checkedKeys,
    setChecked,
    clearChecked,
    armAutoPost,
    clearAutoPost,
    wantsAutoPost,
    selectionBarHTML,
    modelPlan: async (harnesses: HarnessTable, agents: Record<string, AgentSetting>) =>
      plannedWithCodeReview(await namedPlan(harnesses, agents), "guide"),
  };
}
