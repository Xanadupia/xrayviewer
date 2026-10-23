# Changelog

## 0.5.1

- **The guide walks through a real review.** It follows one pull request from the sidebar to the posted review, with a screenshot of each step, and a new diagram shows what runs during a review.
- **Each release is on GitHub.** It has the `.vsix` for Cursor, its checksum, and a record of the workflow that built it.
- **The package is over a third smaller.** It no longer carries the guide's pictures; the Marketplace page loads them from GitHub.

## 0.5.0

- **The review page is redesigned.** One compact bar holds the repository and pull request, the save state, Refresh, Open on GitHub, the theme button, and Post review. A thin line along its bottom fills as you review and turns green when every hunk is decided. The workflow steps moved to Workflow.
- **Light, Dark, or System.** The theme button on a review page, **X-RayViewer: Choose Theme…**, and the new `xrayviewer.theme` setting change every open review at once. System follows the editor, including high contrast themes.
- **Findings are grouped by High, Medium, and Low.** Each group's heading is a tinted chip with a count, such as "3 of 5 open". Long Low lists fold after four. Each finding shows its decision as an icon.
- **The agent color is mint.** It no longer looks like the purple GitHub uses for merged.
- **Next and previous keep their place.** After you add or dismiss a finding, **a** goes on to the next one instead of back to the first. **j**, **k**, **n**, **r**, and **c** start from the hunk on screen, not the last one you moved to with the keyboard.
- **Buttons that only show an icon say their name on hover.**
- **Motion follows the editor's Reduce Motion setting.** Buttons respond to a press, and menus ease in.
- **Each pull request can run on its own models.** Choose model on a review page saves the CLI, model, and level for that pull request only, so two open pull requests can use different ones. **Use the default** drops its choice, and **Change the default…** changes what every other pull request runs on.
- **The architecture agent checks each file's paradigm.** New code should follow the file's object-oriented or functional style, and a helper beside a class should be a method or move to a module of functions. It only comments on code the pull request adds or changes. Existing installs keep their `agents/architecture.md`; **Reset Agent Settings** brings in the new text.
- **Choose model is easier to scan.** Every row has an icon. The sections are **All agents** and **One agent**. A CLI row leads with its name, and its version and how many agents use it are in gray. Each row has one line of detail.
- **The sidebar is easier to read.** Each row leads with the title, and the number moves to the gray text. One icon shows the state by its shape and the risk by its color. The review mark is a dot while reviewing and a check when done, and titles keep the theme's text color. The list is named **Pull Requests**.
- **Running Reviews lists the pull requests under review.** The new sidebar section shows each one's progress and how long it has run. Click one to open it.
- **The activity bar icon counts review requests.** It shows how many open pull requests request your review by name.
- **The buttons under the list say what they act on,** such as **Open 2 pull requests** and **Review 2 and post**. They are dimmed until you check a pull request.
- **An agent whose reply isn't valid JSON gets one chance to fix it.** X-RayViewer sends the reply back to the same CLI and model with the parser's error, and uses the fixed reply. This works the same on Cursor, Claude Code, and Codex. The agent's cost, tokens, and time include both requests.

## 0.4.10

- **Install and Install update sit on the CLI row.** Choose model no longer has a separate update list. The control on the right says Install when that program is missing, and Install update when a newer version is published.
- **The section titles in Choose model are easier to see.** Each break is a light rule around the title.

## 0.4.9

- **The pull request list loads again.** A sidebar row no longer fails with “a is not defined” while it draws the risk bar.

## 0.4.8

- **Update Claude Code, Codex, and Cursor Agent from the model list.** When a newer version is published, **Choose model** lists it under **Updates**. Pick it to download. The list shows the new version when the download finishes, and the next run uses it.

## 0.4.7

- **Pi is no longer a harness.** Agents run on Cursor Agent, Claude Code, or Codex. An agent that was set to Pi uses the default harness.

## 0.4.6

- **Agents run the newest CLI on this machine.** Claude Code, Codex, and Cursor Agent use the latest version installed, even when a setting still names an older copy. The path setting is used only when no installed version is found.

## 0.4.5

- **Each pull request opens in its own tab.** Opening another pull request leaves the one you already have open. Opening the same pull request again shows its tab.

## 0.4.4

- **Each pull request says whether X-RayViewer has reviewed it.** The row reads Reviewed, Not reviewed, or Reviewing, and a mark on the icon uses the same three colors. **Group Pull Requests…** can group the list that way.
- **The risk is a bar at the left of the row.** Green is low, orange is medium, and red is high. The pull request icon sits beside it.

## 0.4.3

- **The name in the guide and commands is X-RayViewer.**

## 0.4.2

- **The id is xrayviewer.** Settings, commands, links, and the home folder use `xrayviewer`. The Marketplace name is X-RayViewer. The folder is `~/.xrayviewer`, or `XRAYVIEWER_HOME`.

## 0.4.1

- **A blue icon.** The viewfinder mark is white on blue.
- **Choose model says how a run works.** The picker has two parts: **Change all agents** and **Change one agent**. Each CLI says how many agents use it, and each agent shows its CLI, model, and what it looks at. **Run agents** runs every agent that's on, together. The **Default for all agents** row is gone.
- **Picking a model only saves it.** After you pick, a short note says what changed, such as "Saved. Claude Code agents will use Opus 5.5 at xhigh effort. Run agents starts all 5 agents together." Nothing runs until you press **Run agents**.
- **Each agent picks Cursor, Codex, or Claude Code.** Guide, Architecture, Correctness, Test, and Security open the same choice as **Change all agents**, then a model. The choice applies to that agent. Its instructions are left as they are.
- **/code-review also checks each agent's instructions.** On Claude Code, after /code-review reports, Claude Code checks the pull request against the instructions of each agent it replaced, such as Architecture. A problem /code-review missed shows under that agent, within its own max findings, minimum confidence, and skipped files. **Agent activity** lists those agents under **Code review agent**, with its status, rather than as skipped.
- **Post every finding when the run finishes.** Check **Post all findings when finished** beside **Run**, then run the agents. When that run finishes, every open finding is added and the review is posted to the pull request as comments. Uncheck it before the run finishes and nothing is posted for you.

## 0.4.0

The first X-RayViewer release.

- **The user guide is on the web** at [xanadupia.github.io/xrayviewer](https://xanadupia.github.io/xrayviewer), the same guide as this page.
- **See where X-RayViewer's review stands.** Each sidebar row says whether the pull request is reviewed (with its findings), reviewed before new commits, not reviewed, being reviewed, or failed, and its tooltip says it in full. The review page shows the same state as a pill beside the risk score that opens **Agent activity**.
- **Add every finding at once.** **Add all N to my review** under the findings list, or **Add all N** on any finding, adds each open finding as its suggested comment, on its line, at its level, the same as adding them one at a time. **Undo** takes them all back out.
- **Watch each agent work.** **Agents are running** and **Agent activity…** under **Run agents** list the agents the way GitHub lists a pull request's checks: a summary with a progress ring, then each agent under its status with its harness, model, and a live timer. **View details** in an agent's **⋯** menu, or its name, opens its log. In the log, the agent's messages read as text, and the commands, reads, and searches between them fold into one line, such as "Ran 2 commands, read cart.js", that opens to each step and a command's output. Claude Code, Codex, and Cursor report their steps as they go.
- **Every comment is tagged by level.** Each comment you post opens with a Greptile-style priority tag in place of the `blocking:` text: **P1** for High, **P2** for Medium, **P3** for Low. A comment from an agent finding starts at the finding's severity, and the comment box has a Level row to change it. Drafts, threads, and the Comments list show the level, and Greptile's P0, P1, and P2 comments show as High or Medium.
- **Claude Code reviews with its own /code-review.** On Claude Code, /code-review runs once in place of the agents that look for problems, at the effort level you picked. Its findings show under one **Code review** agent, on the right lines, with levels and suggested comments as usual. The guide keeps its own instructions. /code-review reads the diff with `git` in Claude Code's sandbox, which writes nothing and reads only the checkout and its git history.
- **Cursor, Codex, and Claude Code each have a row at the top of the picker.** Pick one, then a model, and every agent moves onto it, including agents that had a harness or model of their own. The row in use says so.
- **Every harness ends the same way.** After you pick a model for Cursor, Claude Code, or Codex, X-RayViewer says what the agents will use, and **OK** runs them on the open pull request. It no longer goes back to the harness list.
- **Choose model is always under Run agents.** The arrow beside **Run agents** or **Rerun** opens **Choose model…**, which names the harness, the model with its version, and the level the agents will use, such as Codex · gpt-6-astra · medium. It stays there after a run and while the agents run, and changes as soon as you pick another model.
- **Claude Code lists its models with their versions.** Opus 5.5, Sonnet 5.5, and the other models Claude Code knows, read from the installed Claude Code, then an effort level from low to max. **Change installed version…** is at the bottom, as with Codex. The level shows on the finished review.
- **A pull request's tooltip is a short card.** The title, who wrote it, the state, the size, and up to three reasons for the risk. The point math is left out.
- **The pull request list shows state and risk apart.** Each row's icon is open, draft, merged, or closed. A colored dot beside it is the risk. The list can be grouped or filtered by author.
- **The guide starts with the review itself.** Both guides open with the four steps and a picture of the review page, then the buttons and the model picker. The full settings stay at the end.
- **The review bar says what happens next.** **Post review** sends a review to GitHub. After one is posted, the button says **Update review** and is no longer the filled button. **Change** on the model line opens the model picker. The name in the bar is X-RayViewer.
- **The package is ready for the Visual Studio Marketplace and Open VSX.** It names the publisher, the repository, the license, and a 256×256 icon. Cursor installs the Open VSX copy.
- **The review bar uses the X-RayViewer mark.** The viewfinder sits next to the name.
- **The review page uses system type and a glass toolbar.** The bar and menus float above the review. The briefing and the path to merge stay on a solid surface. Buttons use the system blue, and the page uses the Mac system font.
- **Claude Code and Codex can be chosen by the version installed on this machine.** **Choose Agent Harnesses…** lists those versions, and offers the official installer when one is missing. Cursor still asks which model on the account to use.
- **The review page names the model.** After a run, the briefing, the Agent review summary, and each agent on the Workflow tab show the harness and model. A mix of models is listed as one combination per harness and model, with the agents that used it.
- **Cursor Agent as a harness.** Agents can run on the Cursor Agent CLI (`cursor-agent`) with any model on your Cursor account. Pick it in **X-RayViewer: Choose Agent Harnesses…** as the default or for one agent; choosing Cursor lists your account's models. `xrayviewer.cursor.path`, `xrayviewer.cursor.model` and `xrayviewer.cursor.extraArgs` configure it.
- **Read-only and isolated.** Cursor agents run in ask mode with the sandbox on, from an empty folder, with the pull request's checkout and the run folder added read-only. A pull request's own `.cursor` hooks, rules, MCP servers and `AGENTS.md` don't load, and MCP tools, web fetches, shell commands and writes are denied.
- **Its own name and id.** X-RayViewer (`aliqaryan.xrayviewer`) has its own commands, settings (`xrayviewer.*`), views, links (`cursor://aliqaryan.xrayviewer/open?...`) and settings folder (`~/.xrayviewer`, or `XRAYVIEWER_HOME`).
