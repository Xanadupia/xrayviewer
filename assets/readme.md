# X-RayViewer

Review GitHub pull requests in VS Code or Cursor. Agents on your computer read the change before you do: they check the description, set a reading order, draw the flow, and flag problems on the lines. You keep what you agree with and post one review. Nothing reaches GitHub until you press **Post now**.

![X-RayViewer in VS Code: your pull requests in the sidebar, and a review page with the agents' briefing, the description check, the flow, and 12 findings grouped by severity](docs/hero.png)

This guide is also on the web: [xanadupia.github.io/xrayviewer](https://xanadupia.github.io/xrayviewer).

## Set up

You need:

- **VS Code** 1.95 or later, or **Cursor**
- **GitHub CLI**, signed in: `gh auth login` ([cli.github.com](https://cli.github.com))
- **git**
- One program to run the agents, signed in: **Claude Code**, **Codex**, or **Cursor Agent** (`cursor-agent login`)

In VS Code, search for **X-RayViewer** in the Extensions view and install it. The id is `aliqaryan.xrayviewer`. Cursor installs extensions from Open VSX, where X-RayViewer isn't listed yet. Until it is, download the `.vsix` from the [latest release](https://github.com/Xanadupia/xrayviewer/releases/latest) and run **Extensions: Install from VSIX…** in Cursor.

Click the X-RayViewer icon in the activity bar. Your pull requests load in a few seconds. If the list stays empty, run `gh auth login` in a terminal, then **X-RayViewer: Refresh**.

Automatic runs are on. About two minutes after the editor starts, agents begin on pull requests that request your review by name. To start every run yourself, turn off `xrayviewer.agents.autoRun` before then.

## Your first review

### 1. Find the pull request

![The sidebar: pull requests grouped by how they relate to you, each row with its number and review status, and two checked rows with Open 2 pull requests and Review 2 and post under the list](docs/sidebar.png)

The sidebar groups pull requests by how they relate to you: requested from you, assigned, reviewed, code owner, team, yours, and watched. Each row is the title, then the number and what's worth knowing, such as **draft**, **conflicts**, or **Reviewed & posted, 3 findings**. The icon's color is the risk: red is high and orange is medium. A check at the end means X-RayViewer reviewed it, and a dot means a review is running.

Click a row to open its review page. For a pull request that isn't listed, run **X-RayViewer: Open a Pull Request…** (**⌥⇧⌘P** on macOS, **Ctrl+Shift+Alt+P** on Windows and Linux) and paste its GitHub link.

### 2. Run the agents

![A review page before any agent ran: No agent review yet, with Run agents and the Post all findings when finished checkbox beside it](docs/run-agents.png)

Press **Run agents**. Five agents run together: the **overview** agent checks the description, suggests a reading order, and draws the flow, while the **architecture**, **bugs**, **test**, and **security** agents look for problems. A run takes a few minutes, and you can read the diff meanwhile. The arrow beside **Run agents** picks the program and model (see **Pick the program and model** below).

Leave **Post all findings when finished** unchecked for now. When it's checked, the run ends by posting every open finding to GitHub as comments, before you've read them.

### 3. Watch them work

![Agent Activity while a review runs, with Claude Code Review listed among the agents](docs/agent-activity.png)

**Ongoing Reviews** in the sidebar lists every pull request under review, and every review page that is open, with its progress and how long it has run. A finished run stays until you refresh that list. An open page leaves when its tab closes. **Agent Activity** below it lists the agents the way GitHub lists checks: each one's status, program, model, time, and cost. Click an agent for its log: what it said, and the commands, reads, and searches it ran.

On Claude Code, **Claude Code Review** also runs Claude Code's **/code-review** when at least one selected agent runs on Claude Code, whether you run every agent or only one. It isn't listed in the agent menus. The other agents still run with their own instructions, and **Agent Activity** lists it as Claude Code Review. A Claude model on Cursor Agent does not run it. If **/code-review** doesn't finish, the other agents' findings stay open for you to review, and they are not posted on their own. A large pull request can keep /code-review busy for a long time, so it isn't stopped at `xrayviewer.agents.timeoutMinutes`. It's stopped when Claude Code goes 5 minutes without doing anything, or at three times that setting (an hour by default).

On Codex, **Codex Code Review** runs `codex review` the same way, when at least one selected agent runs on the Codex CLI. It isn't listed in the agent menus, and **Agent Activity** lists it as Codex Code Review. A Codex model on Cursor Agent does not run it. If it doesn't finish, the other findings stay open and are not posted on their own. It stops on the same rule: 5 minutes without activity, or three times that setting.

### 4. Read the briefing

![The briefing after a run: the flow drawn as 8 steps, then 2 medium and 10 low findings, Add all 12 to my review, and 10 things checked and fine](docs/findings.png)

When the run finishes, the top of the page is the agents' briefing: a summary of the change, how well the description covers what your team asks for, the flow the change touches, and the findings grouped by **High**, **Medium**, and **Low**. Click a finding to jump to its line. **10 things checked and fine** lists what the agents looked at and cleared.

### 5. Read the change in order

![The map: the overview agent's drawing of the flow, each numbered box linked to its lines, and a Start here list of the boxes with findings](docs/map.png)

The rail on the left splits the diff into chapters, in the order the overview agent suggests: code that the rest depends on comes first. **Map** draws the flow the change touches. Each numbered box links to its lines, and **Follow the flow** walks you through them.

Mark each hunk reviewed as you go. The ring at the top counts them, and **Saved locally** in the bar means your marks and drafts are on disk. Press `j` and `k` to move between hunks, `r` to mark one reviewed, and `c` to comment.

### 6. Decide each finding

![A finding under the line it's about: the agent, severity, and confidence, what's wrong, How the agent got there, a suggested fix, and Add to my review, Add all 12, Copy, and Dismiss](docs/finding-on-line.png)

Each finding sits under its line, with the agent, severity, confidence, what's wrong, and a suggested fix. **How the agent got there** shows its reasoning.

- **Add to my review** turns it into a comment on that line, at its severity. Edit the words before you post.
- **Dismiss** leaves it out. Only what you post is visible to the author.
- **Add all 12** adds every open finding at once. **Undo** in the message takes them back out.
- **Copy** copies the finding word for word, for example to hand to a coding agent. It includes code, so paste it only where that code may go.

To write your own comment, click a line number or the **+** beside it, or select code and click **Comment**. Pick its kind, and its level follows. On GitHub the comment opens with a colored priority tag: **P1** for High, **P2** for Medium, **P3** for Low.

| Kind of comment | Level it starts at |
|---|---|
| From an agent finding | The finding's severity |
| Blocking | High |
| Suggestion, question, or a plain comment | Medium |
| Nit or praise | Low |

### 7. Post

![Post your review to GitHub: how much you reviewed, your comments, the agent findings you kept, and Comment, Approve, or Request changes](docs/post.png)

Press **Post review** in the bar. The sheet sums up what you reviewed and what will be sent. Pick **Comment**, **Approve**, or **Request changes**, add a summary, and press **Post to GitHub**. It asks once more, **Post as @you to owner/name #12?**, and **Post now** sends it. **Preview what's sent** shows the exact text first.

After that the button says **Update review**, the line under the title says what you did, such as "You approved this 2 hours ago", and the sidebar row says **Reviewed & posted**.

## How a review works

![How a review works: X-RayViewer reads the pull request from GitHub with gh and git, checks it out locally, runs the overview agent and four review agents in parallel through your model provider's CLI, and shows the briefing, chapters, map, and findings on the review page, where you decide what to keep before posting one review back to GitHub](docs/how-it-works.png)

The agents read a local checkout at the pull request's head commit and change nothing. Each finding comes back with a severity, the exact line, why it matters, and a suggested comment. Your drafts, review marks, and agent results are saved on this computer, so they survive a restart. The only write to GitHub is your review, when you press **Post now**.

## Review several at once

Check up to five rows in the sidebar, then use the buttons under the list. **Open 2 pull requests** opens each in its own tab. **Review 2 and post** opens them, runs their agents, and posts each one's open findings as comments when its run finishes, as if **Post all findings when finished** were checked on each.

**Ongoing Reviews** shows where each one is: **Queued**, **Starting soon**, **Waiting for a free agent**, **In another window**, or progress such as "2 of 6 agents done · 4 min". **Stop** on that section, and on a row that is still running, stops the agents. A finished run stays until you press **Refresh** on that section. A review page that is open shows as **Open** and leaves when its tab closes. In **Pull Requests**, the review in front has its title highlighted. Click a row to open its review, and **Agent Activity** follows it.

## Let agents start on their own

Agents start by themselves only on pull requests that request your review by name, when they open and after each push.

- A two-minute pause folds a burst of pushes into one run.
- Drafts are skipped.
- A pull request over 100 files or 5,000 changed lines waits until you press **Run agents**.
- Each pull request gets at most five automatic runs.
- If it's already approved, X-RayViewer asks once per push: **Skip this PR**, **Run anyway**, or **Always skip approved**.
- A run that starts by itself never posts. It waits for you.

With several windows open, one window starts the automatic runs, and a pull request's agents run in one window at a time.

## Pick the program and model

![What the agents run on: Codex and Claude Code show Update and the new version on the name, with the download icon on a soft highlight, then each agent with its program, model, and what it looks at](docs/picker.png)

Open the picker from the arrow beside **Run agents**, from **Change** on the page's model line, or with **X-RayViewer: Choose Agent Harnesses…**. Pick a program under **All agents** to move every agent to it, or pick one agent to move only that one. Picking saves the choice. It never starts a run.

![Model for agents on Claude Code: Claude Code's default, Fable 5.1, Opus 5.5 in use, Sonnet 5.5, Haiku 5.5, and Change installed version](docs/picker-models.png)

Then pick a model.

- **Claude Code** rows use its short names, such as `opus`, so they follow the newest version. To keep one version, set `xrayviewer.claude.model` to its full id, such as `claude-opus-5-5`.
- **Codex** lists the models that CLI provides.
- **Cursor Agent** lists the models on your Cursor account. The first row keeps whatever it used last.

![Effort for Opus 5.5: Claude Code's default, Low, Medium, High in use, Xhigh, and Max, each with a line on how long it thinks](docs/picker-level.png)

On Claude Code and Codex, pick a level last. It sets how long the model thinks before it answers, so a higher level is slower and costs more.

- **Claude Code** asks for an effort: Low, Medium, High, Xhigh, or Max. **Claude Code's default** leaves it to the CLI.
- **Codex** asks for a reasoning level from the ones that model supports, and marks its default.
- **Cursor Agent** has no level step. The level is part of the model's name, such as **Claude Opus 5.5 1M High**.

Picking the level saves the model and level together, and a note says what the agents will use, such as "Claude Code agents will use Opus 5.5 at high effort." Escape backs out without saving. Each agent's row in the picker shows its level, such as **Claude Code · Opus 5.5 · high**. The level every agent on a program uses is stored in `xrayviewer.claude.extraArgs` (`--effort high`) or `xrayviewer.codex.extraArgs`.

A model or level picked for one agent is that agent's own, and the other agents keep theirs. In both steps, the first row, such as **Same as the other Claude Code agents**, drops it again. The level is saved as `effort` in `agents.yml`, and moving the agent to another program clears it. Claude Code Review uses the Claude Code level, and Codex Code Review uses the Codex level, not one agent's own.

On a review page, the picker is for that pull request only, so two pull requests can run on different models. **Use the default** drops that pull request's own choice, and **Change the default…** changes it for every other pull request.

A program that's missing says **Not installed** and gets an **Install** row under it. Picking the program or that row installs it, then you pick a model. One with a newer release says **Update** and the new version on its name, on a soft highlight, and the download button on the right of that row installs it. **Change installed version…** picks another installed copy of Claude Code or Codex.

## Change what the agents look for

The first run writes `~/.xrayviewer` (`XRAYVIEWER_HOME` moves it): `agents.yml` lists the agents, and `agents/<id>.md` holds each agent's instructions under **Look for** and **Leave alone**. **X-RayViewer: Customize Agents…** opens them, and changes apply on the next run. The ids are older than some names: the overview agent is `guide`, and the bugs agent is `correctness`.

To add an agent, run **X-RayViewer: New Agent…**, or add a block to `agents.yml` and a matching `agents/migrations.md`:

```yaml
agents:
  migrations:
    name: "Migration agent"
    focus: "Schema changes that lock tables or lose data"
    enabled: true
    max-findings: 3
    min-confidence: worth-asking
    skip: []
    runs-when: ["**/migrations/**"]
    harness: ""
    model: ""
    effort: ""
```

| Field | What it does |
|---|---|
| `focus` | One line on what it looks at. The agent reads it before its instructions. |
| `max-findings` | At most this many findings. |
| `min-confidence` | `minor` keeps all, `worth-asking` drops minor ones, `high` keeps only high confidence. |
| `skip` | Files the agent ignores, such as `"**/*.lock"`. |
| `runs-when` | Run only when a changed file matches. Empty means always. |
| `harness`, `model`, `effort` | `claude`, `codex`, or `cursor`, a model it knows, and a level such as `high`. Empty uses your picker choice. |

The same file says what **high**, **medium**, and **low** mean, and which parts a description needs for a feature or a fix. **X-RayViewer: Reset Agent Settings** restores the defaults.

## If something looks wrong

- **The sidebar is empty.** Run `gh auth status`, then `gh auth login`. Team requests and code owners also need `gh auth refresh -s read:org`.
- **An agent program isn't found.** **Choose Agent Harnesses…** says so, and picking it installs Claude Code, Codex, or Cursor Agent. Set `xrayviewer.claude.path`, `xrayviewer.codex.path`, or `xrayviewer.cursor.path` only when it lives somewhere unusual. Sign in by running the program once.
- **Cursor can't use a model.** Pick one by name in the picker instead of the first row.
- **Agents fail or find nothing.** **X-RayViewer: Show Agent Log** lists each agent's errors, tokens, and cost.
- **An agent's reply wasn't valid JSON.** X-RayViewer already sent it back once to be fixed. If the error says **even when asked to fix it**, run the agents again, or pick a specific model.
- **Agents are running in another window.** Stop them there, or wait.
- **A link does nothing.** Use `cursor://aliqaryan.xrayviewer/...` in Cursor and `vscode://aliqaryan.xrayviewer/...` in VS Code. Pasting the GitHub link into **Open a Pull Request…** works in either.

## What leaves this computer

Stays here: drafts, review marks, agent results, run logs, and `~/.xrayviewer`. The review page loads no remote images, fonts, or scripts. There is no telemetry.

Leaves:

- **GitHub**, through `gh` and `git`. The only write is **Post now**: your review, then any replies and thread resolutions you queued.
- **Your model provider**, through the program you picked. Agents send the diff, the title, the description, the review threads, and the files they read.

Agents never post by themselves. A pull request's own Cursor hooks, rules, and `AGENTS.md` don't run, though your own `~/.cursor` rules still apply. Before posting, X-RayViewer refuses a review that looks like it contains a private key or token. X-RayViewer adds no charge of its own: usage counts against the account of the program that ran.

## Reference

### Sidebar groups

A pull request appears in the first group it fits. The number on the activity bar icon counts open pull requests that request your review by name.

| Group | What is in it |
|---|---|
| Requested PRs | Your review is requested by name. Automatic runs use this group only. |
| Assigned PRs | You are an assignee. |
| Reviewed PRs | Still open, not yours, and you have reviewed it. |
| Code Owner PRs | It changes files you or a team of yours own. |
| Team Requested PRs | A review is requested from one of your teams. |
| Your PRs | You opened it. |
| Watched PRs | Open pull requests in repositories you list in `xrayviewer.watch.repositories`. |
| Opened Here | Opened from **Open a Pull Request…** or a link. |
| Other PRs | Up to 10 more open pull requests in those repositories. |
| Merged or Closed PRs | Ones you reviewed or wrote, for the last 3 days. |

The view's menu groups the list by relationship, repository, author, or review status instead, and **Filter…** narrows it by status and author.

### What a row says

| Row says | What it means |
|---|---|
| Reviewed & posted, 13 findings | X-RayViewer reviewed the latest commit, and you posted the review. |
| Reviewed, not posted, 13 findings | X-RayViewer reviewed the latest commit, and the review isn't on GitHub yet. |
| Reviewed, new commits | The review is of an older commit. **Rerun** reviews the latest. |
| Reviewing 2/5, Reviewing, queued | A review is running or waiting to start. |
| Review failed | The last review failed. The tooltip has the error. |
| Nothing | X-RayViewer hasn't reviewed it yet. |

### Commands

| Command | What it does |
|---|---|
| Open a Pull Request… | Open a review from a GitHub link, or `owner/name` and a number. |
| Choose Agent Harnesses… | Pick the program, model, and level for all agents or one. |
| Run Agents / Stop Agents | Start or stop the agents on the open pull request. |
| Show Agent Log | Each agent's errors, tokens, and cost. |
| Customize Agents… / New Agent… / Remove an Agent… | Edit, add, or remove agents. |
| Reset Agent Settings | Restore the default agents. |
| Copy Agent Review as Markdown | Copy the findings for another agent. It includes code. |
| Copy Link to This Review | Copy an `aliqaryan.xrayviewer` link. |
| Choose Theme… | **System**, **Light**, or **Dark** for review pages. |
| Show Review Metrics / Delete Review Metrics | A local log of the reviews you posted. It is never uploaded. |

### Settings

Claude Code, Codex, and Cursor Agent run the newest version installed on this machine. A path below is used only when the program has no installed version to choose from.

| Setting | Default | What it does |
|---|---|---|
| `xrayviewer.harness` | `claude` | Default program: `claude`, `codex`, or `cursor` |
| `xrayviewer.claude.path` / `.model` / `.extraArgs` | `claude` / `sonnet` / none | Claude Code |
| `xrayviewer.codex.path` / `.model` / `.extraArgs` | `codex` / empty / none | Codex. An empty model uses the CLI's default |
| `xrayviewer.cursor.path` / `.model` / `.extraArgs` | `cursor-agent` / empty / none | Cursor Agent |
| `xrayviewer.agents.autoRun` | on | Automatic runs when your review is requested by name |
| `xrayviewer.agents.enabled` | empty | Only these agent ids. Empty runs every enabled agent |
| `xrayviewer.agents.maxParallel` | 5 | Agent processes at once |
| `xrayviewer.agents.quietPeriodSeconds` | 120 | Wait after a push before an automatic run |
| `xrayviewer.agents.maxAutomaticRuns` | 5 | Automatic runs per pull request |
| `xrayviewer.agents.skipDrafts` | on | No automatic runs on drafts |
| `xrayviewer.agents.autoRunMaxFiles` / `autoRunMaxLines` | 100 / 5000 | Larger pull requests wait for **Run agents** |
| `xrayviewer.agents.approvedPullRequests` | `ask` | `ask`, `skip`, or `run` |
| `xrayviewer.agents.timeoutMinutes` | 20 | Stop an agent that runs longer. Claude Code Review and Codex Code Review get three times this while they keep working |
| `xrayviewer.watch.repositories` | none | Also list open pull requests in these `owner/name` repositories |
| `xrayviewer.watch.pollSeconds` | 60 | How often to check GitHub. At least 15 |
| `xrayviewer.watch.recentlyClosedDays` | 3 | How long merged or closed pull requests stay listed. 0 hides them |
| `xrayviewer.sidebar.groupBy` | `relationship` | `relationship`, `repository`, `author`, or `review` |
| `xrayviewer.sidebar.mine` | off | Only pull requests you opened |
| `xrayviewer.sidebar.author` | empty | GitHub logins to show. Empty shows everyone |
| `xrayviewer.sidebar.status` | empty | `open`, `draft`, `merged`, `closed`. Empty shows all of them |
| `xrayviewer.sidebar.sortBy` | `risk` | `risk`, `created`, or `updated` |
| `xrayviewer.theme` | `system` | Review pages: `system` follows the editor, `light` or `dark` keeps that theme |
| `xrayviewer.metrics.enabled` | on | Record the local metrics log |
| `xrayviewer.clones` | none | `"owner/name": "/path/to/clone"` |

The other `xrayviewer.watch.*` switches turn each sidebar group on or off. They are on by default.

Comments that span several lines, file-level comments, and editing a comment after it's posted aren't supported yet.

## License

MIT. Copyright (c) 2026 Ali Qaryan.
