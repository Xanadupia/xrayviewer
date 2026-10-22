# Changelog

## 0.4.2

- **The id is xrayviewer.** Settings, commands, links, and the home folder use `xrayviewer`. The Marketplace name is X-RayViewer. The folder is `~/.xrayviewer`, or `XRAYVIEWER_HOME`.

## 0.4.1

- **A blue icon.** The viewfinder mark is white on blue.
- **Choose model says how a run works.** The picker has two parts: **Change all agents** and **Change one agent**. Each CLI says how many agents use it, and each agent shows its CLI, model, and what it looks at. **Run agents** runs every agent that's on, together. The **Default for all agents** row is gone, and Pi has its own row when it's installed.
- **Picking a model only saves it.** After you pick, a short note says what changed, such as "Saved. Claude Code agents will use Opus 5.5 at xhigh effort. Run agents starts all 5 agents together." Nothing runs until you press **Run agents**.
- **Each agent picks Cursor, Codex, or Claude Code.** Guide, Architecture, Correctness, Test, and Security open the same choice as **Change all agents**, then a model. The choice applies to that agent. Its instructions are left as they are.
- **/code-review also checks each agent's instructions.** On Claude Code, after /code-review reports, Claude Code checks the pull request against the instructions of each agent it replaced, such as Architecture. A problem /code-review missed shows under that agent, within its own max findings, minimum confidence, and skipped files. **Agent activity** lists those agents under **Code review agent**, with its status, rather than as skipped.
- **Post every finding when the run finishes.** Check **Post all findings when finished** beside **Run**, then run the agents. When that run finishes, every open finding is added and the review is posted to the pull request as comments. Uncheck it before the run finishes and nothing is posted for you.

## 0.4.0

The first X-RayView release.

- **The user guide is on the web** at [xanadupia.github.io/xrayviewer](https://xanadupia.github.io/xrayviewer), the same guide as this page.
- **See where X-RayView's review stands.** Each sidebar row says whether the pull request is reviewed (with its findings), reviewed before new commits, not reviewed, being reviewed, or failed, and its tooltip says it in full. The review page shows the same state as a pill beside the risk score that opens **Agent activity**.
- **Add every finding at once.** **Add all N to my review** under the findings list, or **Add all N** on any finding, adds each open finding as its suggested comment, on its line, at its level, the same as adding them one at a time. **Undo** takes them all back out.
- **Watch each agent work.** **Agents are running** and **Agent activity…** under **Run agents** list the agents the way GitHub lists a pull request's checks: a summary with a progress ring, then each agent under its status with its harness, model, and a live timer. **View details** in an agent's **⋯** menu, or its name, opens its log. In the log, the agent's messages read as text, and the commands, reads, and searches between them fold into one line, such as "Ran 2 commands, read cart.js", that opens to each step and a command's output. Claude Code, Codex, and Cursor report their steps as they go.
- **Every comment is tagged by level.** Each comment you post opens with a Greptile-style priority tag in place of the `blocking:` text: **P1** for High, **P2** for Medium, **P3** for Low. A comment from an agent finding starts at the finding's severity, and the comment box has a Level row to change it. Drafts, threads, and the Comments list show the level, and Greptile's P0, P1, and P2 comments show as High or Medium.
- **Claude Code reviews with its own /code-review.** On Claude Code, /code-review runs once in place of the agents that look for problems, at the effort level you picked. Its findings show under one **Code review** agent, on the right lines, with levels and suggested comments as usual. The guide keeps its own instructions. /code-review reads the diff with `git` in Claude Code's sandbox, which writes nothing and reads only the checkout and its git history.
- **Cursor, Codex, and Claude Code each have a row at the top of the picker.** Pick one, then a model, and every agent moves onto it, including agents that had a harness or model of their own. The row in use says so.
- **Every harness ends the same way.** After you pick a model for Cursor, Claude Code, Codex, or Pi, X-RayView says what the agents will use, and **OK** runs them on the open pull request. It no longer goes back to the harness list.
- **Choose model is always under Run agents.** The arrow beside **Run agents** or **Rerun** opens **Choose model…**, which names the harness, the model with its version, and the level the agents will use, such as Codex · gpt-6-astra · medium. It stays there after a run and while the agents run, and changes as soon as you pick another model.
- **Claude Code lists its models with their versions.** Opus 5.5, Sonnet 5.5, and the other models Claude Code knows, read from the installed Claude Code, then an effort level from low to max. **Change installed version…** is at the bottom, as with Codex. The level shows on the finished review.
- **A pull request's tooltip is a short card.** The title, who wrote it, the state, the size, and up to three reasons for the risk. The point math is left out.
- **The pull request list shows state and risk apart.** Each row's icon is open, draft, merged, or closed. A colored dot beside it is the risk. The list can be grouped or filtered by author.
- **The guide starts with the review itself.** Both guides open with the four steps and a picture of the review page, then the buttons and the model picker. The full settings stay at the end.
- **The review bar says what happens next.** **Post review** sends a review to GitHub. After one is posted, the button says **Update review** and is no longer the filled button. **Change** on the model line opens the model picker. The name in the bar is X-RayView.
- **The package is ready for the Visual Studio Marketplace and Open VSX.** It names the publisher, the repository, the license, and a 256×256 icon. Cursor installs the Open VSX copy.
- **The review bar uses the X-RayView mark.** The viewfinder sits next to the name.
- **The review page uses system type and a glass toolbar.** The bar and menus float above the review. The briefing and the path to merge stay on a solid surface. Buttons use the system blue, and the page uses the Mac system font.
- **Claude Code and Codex can be chosen by the version installed on this machine.** **Choose Agent Harnesses…** lists those versions, and offers the official installer when one is missing. Cursor still asks which model on the account to use.
- **The review page names the model.** After a run, the briefing, the Agent review summary, and each agent on the Workflow tab show the harness and model. A mix of models is listed as one combination per harness and model, with the agents that used it.
- **Cursor Agent as a harness.** Agents can run on the Cursor Agent CLI (`cursor-agent`) with any model on your Cursor account. Pick it in **X-RayView: Choose Agent Harnesses…** as the default or for one agent; choosing Cursor lists your account's models. `xrayviewer.cursor.path`, `xrayviewer.cursor.model` and `xrayviewer.cursor.extraArgs` configure it.
- **Read-only and isolated.** Cursor agents run in ask mode with the sandbox on, from an empty folder, with the pull request's checkout and the run folder added read-only. A pull request's own `.cursor` hooks, rules, MCP servers and `AGENTS.md` don't load, and MCP tools, web fetches, shell commands and writes are denied.
- **Its own name and id.** X-RayView (`aliqaryan.xrayviewer`) has its own commands, settings (`xrayviewer.*`), views, links (`cursor://aliqaryan.xrayviewer/open?...`) and settings folder (`~/.xrayviewer`, or `XRAYVIEWER_HOME`).
