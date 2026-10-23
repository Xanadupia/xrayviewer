/**
 * Edits to vendor/base/dist/extension.cjs that add the Cursor harness. Each `find` is text from the base
 * bundle and must appear exactly once, so a different bundle fails the build instead of being patched blindly.
 * The minified names are the base bundle's: Q runs a process, F is the harness error, Yn the base environment, Bi the
 * failure classifier, Qn the JSON parser, Fi the path relativizer, ve the log tail, Cu writes an agent's model to
 * agents.yml, C is the vscode module, t the log, and Yt reads the settings. _w picks the agents
 * a review runs, Qu gives an agent's harness, z is the guide's id and Jf runs Claude Code. In the review run, _u is the
 * reviewer schema, Hu turns a reviewer's output into findings, x is the diff index and xn matches skip patterns.
 */
import { activityGroups, activityHTML, activitySummary, activityTime } from "./activity-ui.mjs";
import { CHROME_NAMES, CHROME_PATCHES } from "./chrome-ui.mjs";
import { commentLevel, findingDrafts, readTag, tagBadge, withTag } from "./comment-tags.mjs";
import { modelSummary } from "./model-line.mjs";
import { NAV_NAMES, NAV_PATCHES } from "./nav-ui.mjs";
import { noticeFind, noticeReplace, noticeSource, toastFind } from "./notice-ui.mjs";
import { THEME_NAMES, THEME_PATCHES } from "./theme-ui.mjs";

/** The architecture agent's default instructions. They sit in a template literal in the bundle, so no backticks or `${`. */
const ARCHITECTURE_INSTRUCTIONS = `## Look for

Check that each change sits in the module that owns it and follows the patterns around it. Flag business logic in request handlers, modules that reach into another module's storage, helpers that duplicate existing ones, and new abstractions without a clear owner.

Check that each change follows the programming paradigm of the file it's in. For each file the pull request touches, first decide from the code that was already there whether it's object-oriented (classes that hold state and expose behavior through methods) or functional (pure functions that take data and return new data, with no shared mutable state). For a new file, go by the files next to it. Then flag new or changed code that brings the other paradigm into that file, such as:

- a class with its own state added to a file of pure functions
- functions that change module-level state or their inputs, in a functional file
- a function outside the class, in an object-oriented file. If it works on the class's data or only the class uses it, it should be a method of the class, private if nothing else needs it. If it isn't about the class, it belongs in a module of functions, such as an existing helper file. Name that file when there is one.

Say which paradigm the file uses, with a line that shows it, and how the new code would look in that paradigm. Rate a paradigm mismatch medium at most, unless it causes a real defect.

## Leave alone

Naming, formatting and style. Linters handle those.

Code the pull request didn't add or change. If a file already mixed both paradigms before this pull request, don't flag that. Only flag new code that goes against the part of the file it extends.

Which paradigm is better in general. Follow the one the file already uses.

Things that are normal in either paradigm: error classes, classes or decorators a framework requires, plain data types, and constants.
`;

export const PATCHES = [
  {
    id: "harness-list",
    find: 'var ji=["claude","codex","pi"]',
    replace: 'var ji=["claude","codex","cursor"]',
  },
  {
    id: "harness-label-and-loader",
    find: 'var Nt={claude:"Claude Code CLI",codex:"Codex CLI",pi:"Pi coding agent"};',
    replace:
      'var Nt={claude:"Claude Code CLI",codex:"Codex CLI",cursor:"Cursor Agent CLI"},xrvCursorHarness;' +
      'function xrvCursor(){return xrvCursorHarness??=require("./cursor-harness.cjs").createCursorHarness(' +
      "{run:Q,HarnessError:F,baseEnv:Yn,classifyFailure:Bi,parseJson:Qn,relativizePaths:Fi,tail:ve})}" +
      "function xrvReview(n,r){let p=xrvCursor().planCodeReview(_w(n.data,n.settings,n.enabled),n.settings,$=>Qu($,n.settings,n.harnesses).id,z,n.harnesses.claude,n.data.mergeBase?`${n.data.mergeBase}...${n.data.head.sha}`:null);return n.settings=r.settings=p.settings,p}",
  },
  {
    id: "code-review-plan",
    find: "{run:o,skipped:a}=_w(n.data,n.settings,n.enabled)",
    replace: "{run:o,skipped:a}=xrvReview(n,r)",
  },
  {
    id: "code-review-schema",
    find: "R($,Iu($,u($)),_u,n.timeoutMs)",
    replace: "R($,Iu($,u($)),xrvCursor().findingSchema($,n.settings,_u),n.timeoutMs)",
  },
  {
    id: "code-review-findings",
    find: '$===z?m=Wu(B,n.data,n.detail?.pr.body||"",x,n.settings,D):v.push(Hu($,B,x,n.settings,D)),w.push($)',
    replace:
      '$===z?(m=Wu(B,n.data,n.detail?.pr.body||"",x,n.settings,D),w.push($)):xrvCursor().codeReviewResults($,B,n.settings,(a,o)=>Hu(a,o,x,n.settings,D),(a,p)=>xn(x.resolvePath(p)??p,n.settings.agents[a].skip),D).forEach(([a,o])=>{v.push(o),w.push(a)})',
  },
  {
    id: "code-review-request",
    find: "model:ce||void 0,workDir:",
    replace: "model:ce||void 0,codeReview:n.settings.agents[$]?.codeReview,activity:xrvA.agent($),workDir:",
  },
  {
    id: "activity-log",
    find: "l={agents:{}},c=()=>n.onProgress?.({agents:{...l.agents}})",
    replace: "l={agents:{}},xrvA=xrvCursor().activityLog([n.repoPath,n.runDir],()=>c()),c=()=>n.onProgress?.({agents:{...l.agents},activity:xrvA.snapshot()})",
  },
  {
    id: "activity-covered",
    find: 'for(let $ of a)l.agents[$.id]={state:"skipped",error:$.why};',
    replace: 'for(let $ of a)l.agents[$.id]={state:"skipped",error:$.why,...$.by?{by:$.by,name:n.settings.agents[$.id]?.name}:{}};',
  },
  {
    id: "activity-started",
    find: 'l.agents[$]={state:"running",harness:j.id}',
    replace: 'l.agents[$]={state:"running",harness:j.id,startedAt:Date.now()}',
  },
  {
    id: "activity-claude-stream",
    find: '"-p","--output-format","json","--json-schema"',
    replace: '"-p","--output-format","stream-json","--verbose","--json-schema"',
  },
  {
    id: "activity-claude-result",
    find: "r=JSON.parse(i.stdout)",
    replace: "r=xrvCursor().claudeResult(i.stdout)",
  },
  {
    id: "activity-claude-feed",
    find: "input:e.prompt,timeoutMs:e.timeoutMs,signal:e.signal,onStderr:c=>e.onLog?.(c.trimEnd())}",
    replace: 'input:e.prompt,timeoutMs:e.timeoutMs,signal:e.signal,onStdout:e.activity?.stream("claude"),onStderr:c=>e.onLog?.(c.trimEnd())}',
  },
  {
    id: "activity-codex-feed",
    find: "env:Yn(),input:e.prompt,timeoutMs:e.timeoutMs,signal:e.signal,onStderr:d=>e.onLog?.(d.trimEnd())}",
    replace: 'env:Yn(),input:e.prompt,timeoutMs:e.timeoutMs,signal:e.signal,onStdout:e.activity?.stream("codex"),onStderr:d=>e.onLog?.(d.trimEnd())}',
  },
  {
    id: "dispatcher",
    find: 'case"claude":return await Jf(n,e);',
    replace: 'case"claude":return e.codeReview?await xrvCursor().codeReview(n,e,Jf):await Jf(n,e);',
  },
  {
    id: "dispatcher-cursor",
    find: 'case"pi":return await Qf(n,e)}',
    replace: 'case"cursor":return await xrvCursor().run(n,e)}',
  },
  {
    id: "settings",
    find: 'claude:e("claude"),codex:e("codex"),pi:e("pi")}}}function Pt(',
    replace:
      'claude:{...e("claude"),command:xrvCursor().latestCommand("claude",n.get("claude.path")||"claude")},codex:{...e("codex"),command:xrvCursor().latestCommand("codex",n.get("codex.path")||"codex")},cursor:{...e("cursor"),command:xrvCursor().latestCommand("cursor",n.get("cursor.path")||"cursor-agent")}}}}function Pt(',
  },
  {
    id: "agents-yml-validation",
    find: "ignored; use claude, codex or pi`",
    replace: "ignored; use claude, codex or cursor`",
  },
  {
    id: "agents-yml-template",
    find: '"# harness: claude, codex or pi runs this agent;',
    replace: '"# harness: claude, codex or cursor runs this agent;',
  },
  {
    id: "agents-yml-model-comment",
    find: '"# model: a model for this agent, a name its harness knows (sonnet for claude, for example; for pi, provider/id with","#   an optional :<thinking> suffix, such as openai/gpt-6.1-sol:high); empty uses that harness\'s model setting in",',
    replace: '"# model: a model for this agent, a name its harness knows (sonnet for claude, for example); empty uses that harness\'s model setting in",',
  },
  {
    id: "settings-no-pi-thinking",
    find: 'extraArgs:n.get(`${i}.extraArgs`)||[],...i==="pi"?{thinking:n.get("pi.thinking")||""}:{}',
    replace: 'extraArgs:n.get(`${i}.extraArgs`)||[]',
  },
  {
    id: "run-log-no-pi-thinking",
    find: 'return L.id==="pi"&&L.thinking&&!(B&&_e(B))?`, thinking ${L.thinking}`:""',
    replace: 'return ""',
  },
  {
    id: "prompt-empty-workdir",
    find: 'u=$=>d($).id==="pi"?{...r,checkout:n.repoPath}:r',
    replace: 'u=$=>d($).id==="cursor"?{...r,checkout:n.repoPath}:r',
  },
  {
    id: "drop-pi-runner",
    find: "function Vf(n,e){if(/no models available|no api key found/i.test(n))return new F(\"auth\",\"Pi isn't signed in to a model provider. Run pi in a terminal and use /login, or set the provider's API key, then run the agents again.\",ve(n));let t=/(model \"[^\"]*\" not found|unknown provider \"[^\"]*\")/i.exec(n);return t?new F(\"failed\",`Pi: ${t[1]}. Check xrayviewer.pi.model, or the agent's model in agents.yml; pi --list-models lists the ones you can use.`,ve(n)):Bi(n,e,\"Pi\")}async function Qf(n,e){if(n.thinking&&!Pa(n.thinking))throw new F(\"failed\",`xrayviewer.pi.thinking is \"${n.thinking}\". Use ${Zn.join(\", \")}, or leave it empty for Pi's default.`);let t=e.workDir??await(0,ae.mkdtemp)(Ke.default.join(zn.default.tmpdir(),\"xrayviewer-pi-\"));await(0,ae.rm)(t,{recursive:!0,force:!0}),await(0,ae.mkdir)(t,{recursive:!0});let s=`${e.prompt}\n\nReply with only a JSON object matching this JSON Schema:\n\n${JSON.stringify(e.schema)}\n`,i=Date.now();try{let r=await Q(n.command,Wf(n,e.model,await Hf(n)),{cwd:t,env:qi(),input:s,timeoutMs:e.timeoutMs,signal:e.signal,onStderr:f=>e.onLog?.(f.trimEnd())});if(r.killed)throw e.signal?.aborted?new F(\"cancelled\",\"Stopped.\"):new F(\"timeout\",\"The agent took too long and was stopped.\");if(r.code!==0)throw Vf(r.stderr||r.stdout,r.code);let o=Bf(r.stdout);if(!o)throw new F(\"badOutput\",\"Pi didn't reply.\",ve(r.stderr||r.stdout));if(o.stopReason===\"error\"||o.stopReason===\"aborted\"){let f=o.errorMessage||`the request ended (${o.stopReason})`;throw/login|auth|api key|401|credit|billing/i.test(f)?new F(\"auth\",`Pi: ${f.slice(0,300)}`,ve(r.stderr)):new F(\"failed\",`Pi: ${f.slice(0,300)}`,ve(r.stderr))}if(o.stopReason===\"length\")throw new F(\"badOutput\",\"Pi's reply was cut off before it finished.\",ve(o.text));let a=o.text.trim(),l=Qn(a)??Qn(a.slice(a.indexOf(\"{\"),a.lastIndexOf(\"}\")+1));if(l===void 0)throw new F(\"badOutput\",\"Pi didn't return JSON.\",ve(a||r.stdout));let c=[...new Set([Ke.default.resolve(e.cwd),await(0,ae.realpath)(e.cwd).catch(()=>Ke.default.resolve(e.cwd))])],{tokens:d,costUsd:u,model:h}=jf(r.stdout);return{output:Fi(l,c),costUsd:u,tokens:d,model:h||e.model||n.model||null,durationMs:Date.now()-i}}finally{await(0,ae.rm)(t,{recursive:!0,force:!0})}}function $a(n){let e=n.replace(/\\x1b\\[[0-9;]*m/g,\"\").split(/\\r?\\n/);if(e.some(d=>/^no models available/i.test(d.trim())))return[];let t=e.findIndex(d=>/^provider\\s+model\\s+context\\s+max-out\\s+thinking\\s+images\\s*$/.test(d.trim()));if(t<0)return null;let s=e[t],i=d=>s.search(new RegExp(`(?<=^|\\\\s)${d}(?=\\\\s|$)`)),[r,o,a,l]=[\"model\",\"context\",\"thinking\",\"images\"].map(i),c=[];for(let d of e.slice(t+1)){if(!d.trim())continue;let u=d.slice(0,r).trim(),h=d.slice(r,o).trim();!u||!h||/\\s/.test(u)||/\\s/.test(h)||c.push({provider:u,id:h,thinking:d.slice(a,l).trim()===\"yes\"})}return c}async function Ca(n){let e=await(0,ae.mkdtemp)(Ke.default.join(zn.default.tmpdir(),\"xrayviewer-pi-\"));try{let t=await Q(n.command,[\"--list-models\",\"--offline\",...Ea],{cwd:e,env:qi(),timeoutMs:3e4});return t.killed||t.code!==0?null:$a(t.stdout)??$a(t.stderr)}catch{return null}finally{await(0,ae.rm)(e,{recursive:!0,force:!0})}}",
    replace: "",
  },
  {
    id: "model-picker",
    find: "let P=async m=>{let v=Yt().harnesses.pi,A=m?`the ${Ue(m.name).toLowerCase()} agent`:\"agents on Pi\",E=`the other Pi agents' model (${v.model||\"Pi's default\"})`,M=(B=>_e(B)?B.replace(/:[a-z]+$/,\"\"):B)(m?m.model:v.model),J=await C.window.withProgress({location:C.ProgressLocation.Window,title:\"Listing Pi's models\"},()=>Ca(v)),_,$=!0;if(J===null){let B=await C.window.showInputBox({title:`Pi model for ${A}`,prompt:`Pi couldn't list its models. Type one as provider/id or a name Pi knows, with an optional :<thinking> suffix. Empty uses ${m?E:\"Pi's default\"}.`,placeHolder:\"anthropic/claude-sonnet-5-5\",value:m?m.model:v.model});if(B===void 0)return!1;_=B.trim()}else if(J.length){let B=[{label:m?\"Same as the other Pi agents\":\"Pi's default\",description:[m?v.model||\"Pi's default\":\"\",M?\"\":\"in use\"].filter(Boolean).join(\" \\xB7 \"),detail:m?\"Uses xrayviewer.pi.model.\":\"The model you set in Pi, else its first signed-in provider's.\",value:\"\",thinking:!0},...J.map(j=>{let ce=`${j.provider}/${j.id}`;return{label:j.id,description:[j.provider,j.thinking?\"\":\"no thinking\",ce===M?\"in use\":\"\"].filter(Boolean).join(\" \\xB7 \"),value:ce,thinking:j.thinking}})],se=await C.window.showQuickPick(B,{title:`Pi model for ${A}`,placeHolder:\"Models Pi is signed in to\",matchOnDescription:!0});if(!se)return!1;_=se.value,$=se.thinking}else return C.window.showWarningMessage(\"Pi has no models to use yet. Run pi in a terminal and use /login, or set a provider's API key, then choose again.\"),!1;let L=\"\";if($&&!_e(_)&&(_||!m)){let B=m?_e(m.model)||\"\":v.thinking||\"\",se=await C.window.showQuickPick([{label:m?\"Same as the other Pi agents\":\"Pi's default\",description:[m?v.thinking||\"Pi's default\":\"\",B?\"\":\"in use\"].filter(Boolean).join(\" \\xB7 \"),detail:m?\"Uses xrayviewer.pi.thinking.\":\"The level you set in Pi, else medium.\",value:\"\"},...Zn.map(j=>({label:j,description:j===B?\"in use\":\"\",value:j}))],{title:`Thinking for ${A}`,placeHolder:\"Pi lowers a level the model doesn't support\"});if(!se)return!1;L=se.value}if(m){let B=_&&L?`${_}:${L}`:_;await Cu(m.id,B),t(`${m.name} now runs on Pi with ${B||\"the other Pi agents' model\"}`)}else{let B=C.workspace.getConfiguration(\"xrayviewer\");await B.update(\"pi.model\",_,C.ConfigurationTarget.Global),await B.update(\"pi.thinking\",L,C.ConfigurationTarget.Global),t(`Pi agents now use ${_||\"Pi's default model\"}${L?`, thinking ${L}`:\"\"}`)}return!0},R=async()=>{let m=ji,",
    replace:
      'let xrvScope=key=>xrvCursor().modelScope({key,harnesses:()=>Yt().harnesses,settings:$t,setAgentHarness:Eu,setAgentModel:Cu,saveSetting:(k,x)=>C.workspace.getConfiguration("xrayviewer").update(k,x,C.ConfigurationTarget.Global)}),' +
      "xrvPick=(sc,m)=>xrvCursor().pickModel({vscode:C,readConfig:()=>sc.harnesses().cursor,setAgentModel:sc.setAgentModel,saveSetting:sc.saveSetting,log:t},m)," +
      'xrvClaude=(sc,m)=>xrvCursor().pickCli({vscode:C,log:t,currentPath:()=>Yt().harnesses.claude.command,currentModel:()=>m&&m.model||sc.harnesses().claude.model,currentExtraArgs:()=>sc.harnesses().claude.extraArgs,setAgentModel:sc.setAgentModel,saveSetting:sc.saveSetting},"claude",m),' +
      'xrvCodex=(sc,m)=>xrvCursor().pickCli({vscode:C,log:t,currentPath:()=>Yt().harnesses.codex.command,currentModel:()=>m&&m.model||sc.harnesses().codex.model,currentExtraArgs:()=>sc.harnesses().codex.extraArgs,setAgentModel:sc.setAgentModel,saveSetting:sc.saveSetting},"codex",m),' +
      'xrvModel=(sc,h,m)=>h==="cursor"?xrvPick(sc,m):h==="claude"?xrvClaude(sc,m):h==="codex"?xrvCodex(sc,m):Promise.resolve(!1),' +
      'xrvDone=async(sc,h,a)=>{o.notifyModel();let E=sc.harnesses(),{settings:O}=await sc.settings(),g=a?O.agents[a]:null;await xrvCursor().announceChoice({vscode:C,log:t},{harness:h,settings:E[h],agent:g?{name:Ue(g.name),model:g.model||""}:null,inUse:Object.values(O.agents).some(x=>x.enabled&&(x.harness||E.default)===h),agents:O.agents,harnesses:E,scope:sc.label})},' +
      'xrvMove=async(sc,h)=>{let E=sc.harnesses(),{settings:O}=await sc.settings(),w=[];E.default!==h&&await sc.saveSetting("harness",h);' +
      'for(let[d,x]of Object.entries(O.agents)){if(x.harness&&x.harness!==h){await sc.setAgentHarness(d,"");w.push(Ue(x.name))}else if(!x.harness&&x.model&&E.default!==h){await sc.setAgentModel(d,"");w.push(Ue(x.name))}}' +
      '(E.default!==h||w.length)&&t(`Every agent now runs on ${Nt[h]}${sc.label?" for "+sc.label:""}${w.length?`. ${w.join(", ")} no longer ${w.length>1?"have":"has"} a harness or model of ${w.length>1?"their":"its"} own`:""}`)},' +
      "R=async xrvKey=>{let xrvSc=xrvScope(xrvKey),m=ji,",
  },
  {
    id: "model-picker-default",
    find: 'j&&await C.workspace.getConfiguration("xrayviewer").update("harness",j.value,C.ConfigurationTarget.Global),j?.value==="pi"&&await P(null);continue}',
    replace:
      'if(j){await xrvSc.saveSetting("harness",j.value);if(await xrvModel(xrvSc,j.value,null)){await xrvDone(xrvSc,j.value,null);return}}continue}',
  },
  {
    id: "model-picker-agent",
    find: 'let _=J.agent,$=O.agents[_].harness,L=await C.window.showQuickPick([{label:`Use the default (${Nt[E.default]})`,description:$?"":"in use",value:""},...m.map(j=>A(j,$===j))],{title:`Harness for the ${Ue(O.agents[_].name).toLowerCase()} agent`});if(!L)continue;let B=null;L.value!==$&&({clearedModel:B}=await Eu(_,L.value),t(`${O.agents[_].name} now runs on ${L.value||`the default (${E.default})`}`));let se=L.value==="pi"&&await P({id:_,name:O.agents[_].name,model:L.value===$?O.agents[_].model:""});',
    replace:
      'let _=J.agent,ag=O.agents[_],nm=Ue(ag.name),own=ag.harness||"",cur=own||E.default,cv=v.get("cursor"),co=xrvCursor().installedSummary("codex"),cl=xrvCursor().installedSummary("claude"),' +
      'L=await C.window.showQuickPick([' +
      '{label:cv?"Cursor Agent "+cv:"Cursor Agent CLI",description:[cv?"":"Not found",cur==="cursor"?"in use":""].filter(Boolean).join(" \\u00b7 "),detail:cv?"Pick a model on your Cursor account. Then this agent runs on Cursor.":"Install it, or set xrayviewer.cursor.path to where it is.",value:"cursor"},' +
      '{label:co?"Codex "+co:"Install Codex\\u2026",description:[co?"":"Not installed",cur==="codex"?"in use":""].filter(Boolean).join(" \\u00b7 "),detail:co?"Pick a model and reasoning level. The run uses the newest Codex on this machine.":"Download the Codex CLI, then pick a model. Then this agent runs on Codex.",value:"codex"},' +
      '{label:cl?"Claude Code "+cl:"Install Claude Code\\u2026",description:[cl?"":"Not installed",cur==="claude"?"in use":""].filter(Boolean).join(" \\u00b7 "),detail:cl?"Pick a model and effort level. The run uses the newest Claude Code on this machine.":"Download Claude Code, then pick a model. Then this agent runs on Claude Code.",value:"claude"}' +
      '],{title:`Which CLI runs the ${nm.toLowerCase()} agent?`,placeHolder:`Only the ${nm.toLowerCase()} agent changes. The other agents keep theirs, and they all still run together.`});if(!L)continue;let B=null;L.value!==own&&({clearedModel:B}=await xrvSc.setAgentHarness(_,L.value),t(`${ag.name} now runs on ${Nt[L.value]}${xrvSc.label?" for "+xrvSc.label:""}`));let se=await xrvModel(xrvSc,L.value,{id:_,name:nm,model:L.value===own?ag.model:""});if(se){await xrvDone(xrvSc,L.value,_);return}',
  },
  {
    id: "harness-picker-rows",
    find:
      'M=[{label:"Default for all agents",description:Nt[E.default],detail:"Agents without a harness of their own use this one.",agent:"default"},{label:"Agents",kind:C.QuickPickItemKind.Separator},...Object.entries(O.agents).map(([j,ce])=>{let Me=ce.harness,q=Me||E.default,Le=ce.model||E[q].model||(q==="pi"?"Pi\'s default model":"the CLI\'s default model"),gt=q==="pi"&&E.pi.thinking&&!_e(ce.model)?`, thinking ${E.pi.thinking}`:"";return{label:Ue(ce.name),description:`${Nt[q]}${Me?"":" (default)"} \\xB7 ${Le}${gt}${ce.enabled?"":" \\xB7 off"}`,detail:j===z?"Also writes the briefing\'s opening line.":void 0,agent:j}})],J=await C.window.showQuickPick(M,{title:"Which CLI runs each agent?",placeHolder:"Pick the default or an agent to change it"});',
    replace:
      'xrvRows=await xrvCursor().harnessPicker(E,O.agents,{cursor:v.get("cursor")||"",codex:xrvCursor().installedSummary("codex"),claude:xrvCursor().installedSummary("claude")},z,xrvSc.picker),' +
      'M=xrvRows.rows.map(x=>x.separator?{label:x.label,kind:C.QuickPickItemKind.Separator}:{...x,...x.icon?{iconPath:new C.ThemeIcon(x.icon)}:{},...x.action?{buttons:[{iconPath:new C.ThemeIcon("cloud-download"),tooltip:x.action==="install"?"Install":"Install update"}]}:{}}),' +
      'J=await new Promise(res=>{let qp=C.window.createQuickPick(),done=!1,finish=v=>{if(done)return;done=!0;qp.hide();qp.dispose();res(v)};qp.title=xrvRows.title;qp.placeholder=xrvRows.placeHolder;qp.matchOnDescription=!0;qp.items=M;qp.onDidTriggerItemButton(e=>finish({agent:(e.item.action==="install"?"install-":"update-")+e.item.harness,button:!0}));qp.onDidAccept(()=>finish(qp.selectedItems[0]));qp.onDidHide(()=>finish());qp.show()});',
  },
  {
    id: "effort-record",
    find: 'a=i.id==="pi"?_e(o):null,l=s||(a?o.replace(/:[a-z]+$/,""):o)||null;return{harness:i.id,model:l,...i.id==="pi"?{thinking:r&&_e(r)||i.thinking||a||null}:{}',
    replace:
      'l=s||o||null;return{harness:i.id,model:l,...i.id==="codex"?{thinking:(()=>{let g=i.extraArgs||[];for(let q=0;q<g.length;q++)if(g[q]==="-c"&&String(g[q+1]||"").startsWith("model_reasoning_effort="))return String(g[q+1]).slice(24).replace(/^"|"$/g,"")})()}' +
      ':i.id==="claude"?{thinking:(()=>{let g=i.extraArgs||[];for(let q=0;q<g.length;q++){if(g[q]==="--effort")return g[q+1];if(String(g[q]).startsWith("--effort="))return String(g[q]).slice(9)}})()}:{}',
  },
  {
    id: "reload-fresh",
    find: "async reload(){this.current&&await this.show(this.current,{home:this.home,...this.view?{view:this.view}:{}})}",
    replace:
      "async reload(){this.current&&await this.show(this.current,{home:this.home,...this.view?{view:this.view}:{},fresh:!0})}",
  },
  {
    id: "show-fresh",
    find: "let u=this.service.hasCachedDetail(e),h={key:N(e),load:i,cached:u,staged:!1};",
    replace: "let u=!t.fresh&&this.service.hasCachedDetail(e),h={key:N(e),load:i,cached:u,staged:!1};",
  },
  {
    id: "refresh-uncached",
    find: 's==="/refresh"){this.details.delete(N(e).toLowerCase());let{data:r}=await this.loadData(e);return this.refresh().catch(()=>{}),{ok:!0,head:r.head.sha}}',
    replace:
      's==="/refresh"){this.details.delete(N(e).toLowerCase());let d=await this.detail(e,0),{data:r}=await this.loadData(e,d);return this.refresh().catch(()=>{}),{ok:!0,head:r.head.sha}}',
  },
  {
    id: "run-button-state",
    find: 'let l=this.record(e).run;return l.state==="held"&&l.note&&(o.runNote=l.note),',
    replace:
      'let l=this.record(e).run;return l.state==="held"&&l.note&&(o.runNote=l.note),o.agentsRunning=["running","queued","waiting","elsewhere"].includes(l.state),o.agentProgress=l.progress??null,o.runState=l.state,' +
      "o.modelPlan=await $t().then(c=>xrvCursor().modelPlan(Yt().harnesses,c.settings.agents,N(e))).catch(()=>null),",
  },
  {
    id: "run-button-notify",
    find: "noticeChange(e){",
    replace:
      'notifyRun(){for(let tab of this.xrvTabs.values()){if(!tab.panel||!tab.current)continue;let run=this.service.get(tab.current)?.run,s=run?.state||"idle",id=N(tab.current).toLowerCase(),auto=xrvCursor().wantsAutoPost(id);if(auto&&(s==="done"||s==="failed"||s==="cancelled"))xrvCursor().clearAutoPost(id);tab.panel.webview.postMessage({type:"host-run",running:s==="running"||s==="queued"||s==="waiting"||s==="elsewhere",state:s,automatic:!!run?.automatic,progress:run?.progress??null,autoPost:auto})}let slot=this.xrvSlot,cur=slot&&slot.current,active=cur?this.service.get(cur)?.run:null;xrvCursor().publishActivity(active?.progress??null,()=>$t().then(c=>xrvCursor().modelPlan(Yt().harnesses,c.settings.agents,cur?N(cur):"")).catch(()=>null))}' +
      'notifyTheme(){let m={type:"host-theme",theme:xrvCursor().themeChoice(ee)};for(let p of this.xrvPanels||[])p.webview.postMessage(m)}' +
      'notifyModel(){for(let tab of this.xrvTabs.values()){if(!tab.panel||!tab.current)continue;let panel=tab.panel,key=N(tab.current);$t().then(c=>xrvCursor().modelPlan(Yt().harnesses,c.settings.agents,key)).then(p=>panel.webview.postMessage({type:"host-model",plan:p}),()=>{})}}noticeChange(e){',
  },
  {
    id: "run-button-change",
    find: 'r.on("change",u),r.on("runFinished"',
    replace: 'r.on("change",()=>{u(),o.notifyRun()}),r.on("runFinished"',
  },
  {
    id: "run-button-shim",
    find: 'm.type === "host-view" || m.type === "host-list" || m.type === "host-pr-changed" || m.type === "host-data"',
    replace:
      'm.type === "host-view" || m.type === "host-list" || m.type === "host-pr-changed" || m.type === "host-data" || m.type === "host-run" || m.type === "host-model" || m.type === "host-notice" || m.type === "host-theme"',
  },
  {
    id: "harness-install-actions",
    find: 'if(!J?.agent)return;if(J.agent==="default"){',
    replace:
      'if(!J?.agent)return;if(J.button){let id=J.agent.slice(J.agent.startsWith("update-")?7:8),ok=J.agent.startsWith("update-")?await xrvCursor().updateCli({vscode:C,log:t},id):await xrvCursor().installCli({vscode:C,log:t},id);if(ok)o.notifyModel();continue}if(J.agent==="scope-reset"){let note=await xrvSc.reset();o.notifyModel();t(note);C.window.showInformationMessage(note);return}if(J.agent==="scope-global"){xrvSc=xrvScope();continue}' +
      'if(J.agent==="pick-cursor"||J.agent==="install-codex"||J.agent==="install-claude"){let h=J.agent.replace(/^(pick|install)-/,"");if(await xrvModel(xrvSc,h,null)){await xrvMove(xrvSc,h);await xrvDone(xrvSc,h,null);return}continue}if(J.agent==="default"){',
  },
  {
    id: "choose-model-host",
    find: 'runAgents() { vscode.postMessage({ type: "runAgents", key }); },',
    replace:
      'runAgents() { vscode.postMessage({ type: "runAgents", key }); },\n    chooseHarness() { vscode.postMessage({ type: "chooseHarness", key }); },\n    showActivity() { vscode.postMessage({ type: "showActivity", key }); },\n    setTheme(theme) { vscode.postMessage({ type: "setTheme", key, theme }); },',
  },
  {
    id: "choose-model-command",
    find: 'else if(e.type==="runAgents")ee.commands.executeCommand("xrayviewer.runAgents",N(t));',
    replace:
      'else if(e.type==="chooseHarness")ee.commands.executeCommand("xrayviewer.selectHarness",N(t));else if(e.type==="showActivity")ee.commands.executeCommand("xrayviewer.agentActivity.focus");else if(e.type==="setTheme")xrvCursor().saveTheme(ee,e.theme).catch(()=>{});else if(e.type==="runAgents")ee.commands.executeCommand("xrayviewer.runAgents",N(t));',
  },
  {
    id: "theme-page-tag",
    find: "return pf(this.template,{csp:a,",
    replace: 'return pf(this.template.replace(\'<html lang="en">\',()=>xrvCursor().themeTag(ee)),{csp:a,',
  },
  {
    id: "theme-setting-change",
    find: 'onDidChangeConfiguration(m=>{m.affectsConfiguration("xrayviewer.sidebar")&&',
    replace: 'onDidChangeConfiguration(m=>{m.affectsConfiguration("xrayviewer.theme")&&o.notifyTheme(),m.affectsConfiguration("xrayviewer.sidebar")&&',
  },
  {
    id: "sidebar-settings",
    find: 'function Ei(){let n=C.workspace.getConfiguration("xrayviewer.sidebar"),e=n.get("groupBy")==="repository"?"repository":"relationship",t=["risk","created","updated"].find(s=>s===n.get("sortBy"))||"risk";return{groupBy:e,sortBy:t,othersLimit:n.get("othersLimit",10)}}',
    replace:
      'function Ei(){let n=C.workspace.getConfiguration("xrayviewer.sidebar"),e=n.get("groupBy")==="repository"?"repository":n.get("groupBy")==="author"?"author":n.get("groupBy")==="review"?"review":"relationship",t=["risk","created","updated","title","size","number"].find(s=>s===n.get("sortBy"))||"risk",list=["open","draft","merged","closed"],raw=n.get("status"),st=Array.isArray(raw)?raw.filter(s=>list.includes(s)):list.includes(raw)?[raw]:list,who=n.get("author"),au=Array.isArray(who)?who.filter(s=>typeof s==="string"&&s):typeof who==="string"&&who?[who]:[];if(!st.length)st=list;return{groupBy:e,sortBy:t,othersLimit:n.get("othersLimit",10),author:au,status:st,mine:n.get("mine")===true}}',
  },
  {
    id: "sidebar-author-group",
    find: '}else for(let a of dd){',
    replace:
      '}else if(e.groupBy==="author"){let a=new Map;for(let l of i){let c=l.record.summary?.author?.login||"Unknown";a.set(c,[...a.get(c)||[],l])}for(let[l,c]of[...a].sort(([d],[u])=>d.localeCompare(u)))r.push({id:`author:${l.toLowerCase()}`,label:l,description:String(c.length),rows:c.sort(s)})}else if(e.groupBy==="review"){let order=[["ongoing","Reviewing PRs"],["never","Not Reviewed PRs"],["reviewed","Reviewed PRs"],["posted","Reviewed & Posted PRs"]],buckets={ongoing:[],never:[],reviewed:[],posted:[]};for(let l of i)buckets[xrvAgentState(l.record).flag].push(l);for(let[l,c]of order){let d=buckets[l];d.length&&r.push({id:`review:${l}`,label:c,description:String(d.length),rows:d.sort(s)})}}else for(let a of dd){',
  },
  {
    id: "sidebar-author-closed",
    find: 'rows:o}),e.groupBy!=="repository"){let a=i.filter(d=>fd(d.record))',
    replace: 'rows:o}),e.groupBy==="relationship"){let a=i.filter(d=>fd(d.record))',
  },
  {
    id: "sidebar-group-names",
    find: 'label:"Review requested from you"',
    replace: 'label:"Requested PRs"',
  },
  {
    id: "sidebar-group-assigned",
    find: 'label:"Assigned to you"',
    replace: 'label:"Assigned PRs"',
  },
  {
    id: "sidebar-group-reviewed",
    find: 'label:"You reviewed"',
    replace: 'label:"Reviewed PRs"',
  },
  {
    id: "sidebar-group-owner",
    find: 'label:"You\'re a code owner"',
    replace: 'label:"Code Owner PRs"',
  },
  {
    id: "sidebar-group-team",
    find: 'label:"Your teams\' requests"',
    replace: 'label:"Team Requested PRs"',
  },
  {
    id: "sidebar-group-authored",
    find: 'label:"Your pull requests"',
    replace: 'label:"Your PRs"',
  },
  {
    id: "sidebar-group-watched",
    find: 'label:"Watched"',
    replace: 'label:"Watched PRs"',
  },
  {
    id: "sidebar-group-pinned",
    find: 'label:"Opened here"',
    replace: 'label:"Opened Here"',
  },
  {
    id: "sidebar-group-others",
    find: 'label:"Others you could review"',
    replace: 'label:"Other PRs"',
  },
  {
    id: "sidebar-group-closed",
    find: 'label:"Recently merged or closed"',
    replace: 'label:"Merged or Closed PRs"',
  },
  {
    id: "sidebar-author-filter",
    find: "function pd(n,e,t={}){let s=cd(e.sortBy),i=n.filter(a=>!ld(a.record)&&(a.record.pinned||ud(a.record))),r=[];",
    replace:
      'function xrvStatus(rec){let s=rec.summary;return !s?"open":s.state==="MERGED"?"merged":s.state==="CLOSED"?"closed":s.isDraft?"draft":"open"}function pd(n,e,t={}){if(e.mine)n=n.filter(a=>a.record.summary?.own);let au=Array.isArray(e.author)?e.author:[e.author].filter(Boolean);if(au.length){let want=new Set(au.map(s=>String(s).toLowerCase()));n=n.filter(a=>want.has((a.record.summary?.author?.login||"").toLowerCase()))}let st=Array.isArray(e.status)?e.status:e.status&&e.status!=="all"?[e.status]:[];if(st.length&&st.length<4){let want=new Set(st);n=n.filter(a=>want.has(xrvStatus(a.record)))}let s=cd(e.sortBy),i=n.filter(a=>!ld(a.record)&&(a.record.pinned||ud(a.record))),r=[];',
  },
  {
    id: "sidebar-status-text",
    find: 'function bf(n,e,t=Date.now()){let s=n.summary,i=Ai(s),r=fa(n,t).text;return[e.tag||"",i?"":wf(s)[0]||"",i&&e.risk?`${e.risk.score} ${fi[e.risk.level].toLowerCase()}`:"",i||jv.has(n.run.state)?r:"",...i?wf(s):[],Fv(s,t),e.inRepoGroup?"":n.key.name].filter(Boolean).join(" \\xB7 ")}',
    replace:
      'function xrvAgentState(n,t=Date.now()){let run=n.run||{},a=jn(n.agent,n.summary),f=n.agent?n.agent.findings.length:0,fs=f+" finding"+(f===1?"":"s"),c=a.commit?a.commit.slice(0,7):"",pa=n.agent&&n.agent.postedAt,posted=pa?" Posted to GitHub "+ht(pa,t)+".":" Not posted to GitHub yet.",flag=["waiting","queued","running","elsewhere"].includes(run.state)?"ongoing":a.state==="current"||a.state==="behind"?pa?"posted":"reviewed":"never";' +
      'if(run.state==="waiting"||run.state==="queued")return{short:run.state==="queued"?"Reviewing, queued":"Reviewing",long:run.state==="queued"?"Review queued.":"Review starting soon.",color:"#4FA3FF",flag};' +
      'if(run.state==="running"){let p=Object.values(run.progress?.agents||{}),d=p.filter(g=>g&&(g.state==="done"||g.state==="failed")).length,all=p.filter(g=>g&&g.state!=="skipped").length,live=p.filter(g=>g&&g.state==="running").length,wait=p.filter(g=>g&&g.state==="queued").length;if(all&&!live&&wait)return{short:"Paused, waiting for an agent",long:"Paused until an agent finishes and is free.",color:"#E2C08D",flag};return{short:all?"Reviewing "+d+"/"+all:"Reviewing",long:all?"Reviewing now: "+d+" of "+all+" agents done.":"Review starting.",color:"#4FA3FF",flag}}' +
      'if(run.state==="elsewhere")return{short:"Reviewing in another window",long:"Reviewing in another window.",color:"#4FA3FF",flag};' +
      'if(run.state==="failed")return{short:"Review failed",long:"The last review failed."+(n.agent?" The one before found "+fs+".":""),color:"#F85149",flag};' +
      'let hold=run.state==="held"?run.hold==="approved-ask"?" Approved, so the agents wait for your choice.":run.hold==="approved-skip"?" Approved, so the agents skipped it.":" Large, so the agents wait for you to press Run.":"";' +
      'if(a.state==="none")return{short:"Not reviewed",long:"Not reviewed yet."+hold,color:"#9AA0A6",flag};' +
      'if(a.state==="behind")return{short:pa?"Reviewed & posted, new commits":"Reviewed, new commits",long:"Reviewed "+c+" "+ht(a.ranAt,t)+": "+fs+"."+posted+" New commits came after it."+hold,color:"#E2C08D",flag};' +
      'if(!pa)return{short:"Reviewed, not posted, "+fs,long:"Reviewed "+c+" "+ht(a.ranAt,t)+": "+fs+"."+posted+hold,color:"#E2C08D",flag};' +
      'return{short:"Reviewed & posted, "+fs,long:"Reviewed "+c+" "+ht(a.ranAt,t)+": "+fs+"."+posted+hold,color:"#3FB950",flag}}' +
      'function bf(n,e,t=Date.now()){let s=n.summary,i=Ai(s),state=!s?"":s.state==="MERGED"?"merged":s.state==="CLOSED"?"closed":s.isDraft?"draft":"",agent=xrvAgentState(n,t).short;return["#"+n.key.number,state,agent==="Not reviewed"?"":agent,e.tag||"",i&&yf(s)?"conflicts":"",Fv(s,t),e.inRepoGroup?"":n.key.name].filter(Boolean).join(" \\xB7 ")}',
  },
  {
    id: "agent-summary-posted",
    find: "sf=n=>n?{commit:n.commit,ranAt:n.ranAt,findings:",
    replace: "sf=n=>n?{commit:n.commit,ranAt:n.ranAt,postedAt:n.postedAt||null,findings:",
  },
  {
    id: "push-marks-posted",
    find: "c=await xd(e,l,o.viewer?.login||null,a,r);return r||this.details.delete(N(e).toLowerCase()),c}",
    replace:
      "c=await xd(e,l,o.viewer?.login||null,a,r);if(!r&&(c?.results||[]).some(x=>x&&x.ok)){let ag=await this.store.readAgent(e).catch(()=>null);if(ag){ag.postedAt=new Date().toISOString();await this.store.writeAgent(e,ag).catch(()=>{});this.record(e).agent=sf(ag);this.changed()}}return r||this.details.delete(N(e).toLowerCase()),c}",
  },
  {
    id: "sidebar-status-icon",
    find: 'let a=t.run.state==="running"||t.run.state==="queued"||t.run.state==="elsewhere",l=jn(t.agent,s),c=l.state==="current"?"pass-filled":l.state==="behind"?"pass":"circle-large-outline";r.iconPath=a?new oe.ThemeIcon("sync~spin"):t.run.state==="failed"?new oe.ThemeIcon("error",new oe.ThemeColor("list.errorForeground")):new oe.ThemeIcon(c,new oe.ThemeColor(e.risk?Bv[e.risk.level]:"disabledForeground"));let d=t.run.state==="elsewhere"?"elsewhere":a||t.run.state==="waiting"?"running":"idle";',
    replace:
      'let xrvSt=!s?"open":s.state==="MERGED"?"merged":s.state==="CLOSED"?"closed":s.isDraft?"draft":"open",xrvIcon=xrvSt==="merged"?"git-merge":xrvSt==="closed"?"git-pull-request-closed":xrvSt==="draft"?"git-pull-request-draft":"git-pull-request",xrvFlag=xrvAgentState(t).flag;r.resourceUri=oe.Uri.from({scheme:"xrayviewer",path:"/"+t.key.owner+"/"+t.key.name+"/"+t.key.number,query:xrvFlag});r.iconPath=new oe.ThemeIcon(xrvIcon,e.risk?.level==="high"?new oe.ThemeColor("charts.red"):e.risk?.level==="medium"?new oe.ThemeColor("charts.yellow"):void 0);let d=t.run.state==="elsewhere"?"elsewhere":t.run.state==="running"||t.run.state==="queued"||t.run.state==="waiting"?"running":"idle";',
  },
  {
    id: "review-tabs-state",
    find: "Ri=class{panel=null;current=null;home=!1;view;loadSeq=0;shownSeq=-1;template=null;shownPr=null;noticed=null;extensionUri;service;log;drawing=new Map;timings=[];",
    replace:
      'Ri=class{xrvTabs=new Map;xrvSlot=null;template=null;extensionUri;service;log;timings=[];xrvHold(){return this.xrvSlot||(this.xrvSlot={panel:null,current:null,home:!1,view:void 0,loadSeq:0,shownSeq:-1,shownPr:null,noticed:null,drawing:new Map})}get panel(){return this.xrvSlot?.panel??null}set panel(v){this.xrvHold().panel=v}get current(){return this.xrvSlot?.current??null}set current(v){this.xrvHold().current=v}get home(){return this.xrvSlot?.home??!1}set home(v){this.xrvHold().home=v}get view(){return this.xrvSlot?.view}set view(v){this.xrvHold().view=v}get loadSeq(){return this.xrvSlot?.loadSeq??0}set loadSeq(v){this.xrvHold().loadSeq=v}get shownSeq(){return this.xrvSlot?.shownSeq??-1}set shownSeq(v){this.xrvHold().shownSeq=v}get shownPr(){return this.xrvSlot?.shownPr??null}set shownPr(v){this.xrvHold().shownPr=v}get noticed(){return this.xrvSlot?.noticed??null}set noticed(v){this.xrvHold().noticed=v}get drawing(){return this.xrvHold().drawing}',
  },
  {
    id: "review-tabs-panel",
    find: 'ensurePanel(){if(this.panel)return this.panel;let e=ee.window.createWebviewPanel("xrayviewer.review","X-RayViewer",ee.ViewColumn.Active,{enableScripts:!0,retainContextWhenHidden:!0,localResourceRoots:[this.ui()]});return e.iconPath=ee.Uri.joinPath(this.extensionUri,"media","xrayviewer.svg"),e.onDidDispose(()=>{this.panel=null,this.current=null,this.shownSeq=-1,this.shownPr=null}),e.webview.onDidReceiveMessage(t=>{this.onMessage(t)}),this.panel=e,e}',
    replace:
      'ensurePanel(pr){let id=pr?N(pr).toLowerCase():"";if(id){let tab=this.xrvTabs.get(id);if(tab?.panel)return this.xrvSlot=tab,tab.panel}else if(this.panel)return this.panel;let e=ee.window.createWebviewPanel("xrayviewer.review",pr?`#${pr.number}`:"X-RayViewer",ee.ViewColumn.Active,{enableScripts:!0,retainContextWhenHidden:!0,localResourceRoots:[this.ui()]});let tab={panel:e,current:pr||null,home:!1,view:void 0,loadSeq:0,shownSeq:-1,shownPr:null,noticed:null,drawing:new Map};id&&this.xrvTabs.set(id,tab);this.xrvSlot=tab;(this.xrvPanels??=new Set).add(e);e.iconPath=ee.Uri.joinPath(this.extensionUri,"media","xrayviewer.svg");e.onDidDispose(()=>{id&&this.xrvTabs.delete(id);this.xrvPanels.delete(e);this.xrvSlot===tab&&(xrvCursor().cancelNotices(),this.xrvSlot=null)});e.onDidChangeViewState(v=>{if(v.webviewPanel.active)this.xrvSlot=tab,this.notifyRun()});e.webview.onDidReceiveMessage(t=>{this.xrvSlot=tab;if(t&&t.type==="notice-answer")xrvCursor().answerNotice(t);this.onMessage(t)});xrvCursor().bindNotice(m=>{let p=this.panel;if(!p||!String(p.webview.html||"").includes("host-notice"))return!1;p.webview.postMessage(m);return!0});return e}',
  },
  {
    id: "review-tabs-show",
    find: "async show(e,t={}){let s=this.ensurePanel();s.reveal(s.viewColumn??ee.ViewColumn.Active,!1);let i=++this.loadSeq,r=()=>i!==this.loadSeq||this.panel!==s;this.current=e,this.home=!!t.home,this.view=t.view;let o=this.home,a=this.view,",
    replace:
      "async show(e,t={}){let s=this.ensurePanel(e),slot=this.xrvSlot;s.reveal(s.viewColumn??ee.ViewColumn.Active,!1);let i=++slot.loadSeq,r=()=>i!==slot.loadSeq||slot.panel!==s;slot.current=e,slot.home=!!t.home,slot.view=t.view;let o=slot.home,a=slot.view,",
  },
  {
    id: "review-tabs-shown",
    find: 's.webview.html=P,this.shownSeq=i,this.shown(g.live.pr);',
    replace: 'xrvCursor().cancelNotices(),this.xrvSlot=slot,s.webview.html=P,slot.shownSeq=i,slot.shownPr=g.live.pr?{state:g.live.pr.state??null,headRefOid:g.live.pr.headRefOid??null,updatedAt:g.live.pr.updatedAt??null}:null,slot.noticed=null,this.notifyRun();',
  },
  {
    id: "review-tabs-drawn-page",
    find: 'let R=this.drawn(i,"page")',
    replace: 'let R=(this.xrvSlot=slot,this.drawn(i,"page"))',
  },
  {
    id: "review-tabs-drawn-changes",
    find: 'let A=this.drawn(i,"changes")',
    replace: 'let A=(this.xrvSlot=slot,this.drawn(i,"changes"))',
  },
  {
    id: "review-tabs-refresh",
    find: "s.webview.html=w,this.shown(x.live.pr),this.log(`Updated ${N(e)} with the latest from GitHub`)",
    replace: "xrvCursor().cancelNotices(),s.webview.html=w,slot.shownPr=x.live.pr?{state:x.live.pr.state??null,headRefOid:x.live.pr.headRefOid??null,updatedAt:x.live.pr.updatedAt??null}:null,slot.noticed=null,this.log(`Updated ${N(e)} with the latest from GitHub`)",
  },
  {
    id: "review-tabs-show-error",
    find: "if(this.log(`Couldn't open ${N(e)}: ${h}`),r()||this.shownSeq===i)return;",
    replace: "if(this.log(`Couldn't open ${N(e)}: ${h}`),r()||slot.shownSeq===i)return;",
  },
  {
    id: "review-decoration",
    find: 'l=C.window.createTreeView("xrayviewer.pullRequests",{treeDataProvider:a,showCollapseAll:!0});n.subscriptions.push(l,a,{dispose:()=>r.dispose()},{dispose:()=>o.dispose()});',
    replace:
      'l=C.window.createTreeView("xrayviewer.pullRequests",{treeDataProvider:a,showCollapseAll:!0,canSelectMany:!0});l.onDidChangeCheckboxState(ev=>{let blocked="";for(let [item,state] of ev.items||[]){if(!item||item.kind!=="pr"||!item.record?.key)continue;let res=xrvCursor().setChecked(N(item.record.key),state===1);if(!res.ok)blocked=res.reason||"Five is the most you can select."}blocked&&(xrvCursor().offerNotice(blocked,[],"warning")||C.window.showInformationMessage(blocked));a.refresh()});n.subscriptions.push(l,a,{dispose:()=>r.dispose()},{dispose:()=>o.dispose()},C.window.registerFileDecorationProvider({provideFileDecoration(u){if(u.scheme!=="xrayviewer")return;let f=u.query;return f==="ongoing"?{badge:"\\u25cf",tooltip:"Reviewing"}:f==="posted"?{badge:"\\u2713",tooltip:"Reviewed and posted by X-RayViewer"}:f==="reviewed"?{badge:"\\u2713",tooltip:"Reviewed by X-RayViewer, not posted yet"}:void 0}}));' +
      'xrvCursor().bindRunningView({vscode:C,records:()=>r.all(),onChange:f=>r.on("change",f),subscriptions:n.subscriptions});',
  },
  {
    id: "sidebar-group-author",
    find: '{label:"By repository",description:m==="repository"?"current":"",detail:"One group per repository; each row says why it\'s listed",value:"repository"}]',
    replace:
      '{label:"By repository",description:m==="repository"?"current":"",detail:"One group per repository; each row says why it\'s listed",value:"repository"},{label:"By author",description:m==="author"?"current":"",detail:"One group per pull request author",value:"author"},{label:"By X-RayViewer review",description:m==="review"?"current":"",detail:"Reviewing PRs, Not Reviewed PRs, Reviewed PRs, or Reviewed & Posted PRs",value:"review"}]',
  },
  {
    id: "sidebar-tooltip",
    find: "tooltip(e,t){let s=e.record,i=s.summary,r=new oe.MarkdownString;r.appendMarkdown(\"**\"),r.appendText(i?.title||N(s.key)),r.appendMarkdown(`**  \n`),r.appendText(`${N(s.key)}${i?.author?.login?` by ${i.author.login}`:\"\"}`),r.appendMarkdown(`  \n`);let o=(i?.reasons||[]).map(c=>hd[c]).filter(Boolean);if(o.length&&r.appendMarkdown(`Listed because ${o.join(\", \")}.  \n`),i&&r.appendMarkdown(`+${i.additions} \\u2212${i.deletions} in ${i.changedFiles} files${i.checks.failed?` \\xB7 ${i.checks.failed} checks failing`:i.checks.running?` \\xB7 ${i.checks.running} checks running`:\"\"}  \n`),i){r.appendMarkdown(`\n`);for(let c of[Sf(i),kf(i),...Rf(i)])r.appendText(c),r.appendMarkdown(`  \n`)}if(e.risk){r.appendMarkdown(`\n**${fi[e.risk.level]} risk, ${e.risk.score}/100**  \n`);for(let c of e.risk.factors.slice(0,4))r.appendMarkdown(\"- \"),r.appendText(`${c.label}${c.detail?`: ${c.detail}`:\"\"} (+${c.points})`),r.appendMarkdown(`\n`)}if([\"waiting\",\"queued\",\"running\",\"elsewhere\",\"held\",\"failed\"].includes(s.run.state)&&t&&r.appendMarkdown(`\nAgents: ${t}  \n`),$f(s).forEach((c,d)=>{r.appendMarkdown(d?`  \n`:`\n`),r.appendText(c)}),s.run.state===\"done\"&&(s.run.tokens||s.run.costUsd!=null)){let c=[s.run.tokens?wt(s.run.tokens):\"\",s.run.costUsd!=null?`$${s.run.costUsd.toFixed(2)}${s.run.tokens?\" for the agents that report one\":\"\"}`:\"\"];r.appendMarkdown(`  \nLast run: ${c.filter(Boolean).join(\", \")}`)}return s.run.note&&(r.appendMarkdown(`  \n`),r.appendText(s.run.note)),s.run.error&&(r.appendMarkdown(`  \n`),r.appendText(s.run.error.slice(0,300))),r}};",
    replace: "tooltip(e,t){let s=e.record,i=s.summary,r=new oe.MarkdownString,num=n=>Number(n||0).toLocaleString(\"en-US\"),paint=(c,x)=>{r.appendMarkdown('<span style=\"color:'+c+';\">'),r.appendText(String(x)),r.appendMarkdown(\"</span>\")};r.supportHtml=!0;r.appendMarkdown(\"**\"),r.appendText(i?.title||N(s.key)),r.appendMarkdown(\"**\\n\\n\"),r.appendText([N(s.key),i?.author?.login].filter(Boolean).join(\" · \")),r.appendMarkdown(\"\\n\\n\");if(i){let state=i.state===\"MERGED\"?\"Merged\":i.state===\"CLOSED\"?\"Closed\":i.isDraft?\"Draft\":\"Open\",stateCls=state===\"Merged\"?\"#B180D7\":state===\"Closed\"?\"#F14C4C\":state===\"Draft\"?\"#9AA0A6\":\"#3FB950\",review=kf(i);review===\"No approvals yet\"&&(review=\"no approvals yet\");paint(stateCls,state),r.appendMarkdown(\" · \"),r.appendText(review),r.appendMarkdown(\"\\n\\n\"),paint(\"#3FB950\",\"+\"+num(i.additions)),r.appendMarkdown(\" \"),paint(\"#F85149\",\"−\"+num(i.deletions)),r.appendMarkdown(\" in \"+num(i.changedFiles)+\" files\");i.checks?.failed?(r.appendMarkdown(\" · \"),paint(\"#F85149\",num(i.checks.failed)+\" checks failing\")):i.checks?.running&&(r.appendMarkdown(\" · \"),paint(\"#E2C08D\",num(i.checks.running)+\" checks running\"));r.appendMarkdown(\"\\n\\n\");for(let line of Rf(i))r.appendText(line),r.appendMarkdown(\"\\n\\n\")}if(e.risk){let cls=e.risk.level===\"high\"?\"#F85149\":e.risk.level===\"medium\"?\"#E2C08D\":\"#3FB950\";r.appendMarkdown(\"<b>\"),paint(cls,fi[e.risk.level]+\" risk · \"+e.risk.score),r.appendMarkdown(\"</b>\\n\\n\");for(let c of e.risk.factors.slice(0,3))r.appendText(c.label),r.appendMarkdown(\"\\n\\n\")}let xs=xrvAgentState(s);r.appendMarkdown(\"<b>X-RayViewer</b> · \"),paint(xs.color,xs.long),r.appendMarkdown(\"\\n\\n\");if(s.run.state===\"done\"&&(s.run.tokens||s.run.costUsd!=null)){let c=[s.run.tokens?wt(s.run.tokens):\"\",s.run.costUsd!=null?\"$\"+s.run.costUsd.toFixed(2):\"\"].filter(Boolean);c.length&&(r.appendText(c.join(\" · \")),r.appendMarkdown(\"\\n\\n\"))}return s.run.note&&(r.appendText(s.run.note),r.appendMarkdown(\"\\n\\n\")),s.run.error&&r.appendText(s.run.error.slice(0,300)),r}};",
  },
  {
        id: "sidebar-view-label",
    find: 'let c=()=>{let{groupBy:m,sortBy:v}=Ei();l.description=`${m==="repository"?"by repository":"by relationship"} \\xB7 ${md[v]}`}',
    replace:
      'let c=()=>{let{groupBy:m,sortBy:v,author:au,status:st,mine}=Ei(),by=m==="repository"?"by repository":m==="author"?"by author":m==="review"?"by review":"",shown=Array.isArray(st)&&st.length&&st.length<4?st.join(", "):"",who=Array.isArray(au)?au.join(", "):au||"";l.description=[by,mine?"mine":"",shown,who,v==="risk"?"":md[v]].filter(Boolean).join(" · ")}',
  },
  {
    id: "sidebar-filter-author",
    find: 'k("xrayviewer.sortBy",async()=>{',
    replace:
      'k("xrayviewer.filter",()=>{let cur=Ei(),authors=[...new Set(r.all().map(E=>E.summary?.author?.login).filter(Boolean))].sort((E,O)=>E.localeCompare(O)),mine={label:"My pull requests",pick:"mine",value:"mine"},allSt={label:"All",pick:"all-status",value:"all"},statuses=[["Open","open"],["Draft","draft"],["Merged","merged"],["Closed","closed"]].map(([label,value])=>({label,pick:"status",value})),allAu={label:"All authors",pick:"all-author",value:"all"},people=authors.map(E=>({label:E,pick:"author",value:E})),qp=C.window.createQuickPick();qp.canSelectMany=!0;qp.title="Filter pull requests";qp.placeholder="Check any, then press Return. All shows every item in that group.";qp.items=[mine,{label:"Status",kind:C.QuickPickItemKind.Separator},allSt,...statuses,{label:"Author",kind:C.QuickPickItemKind.Separator},allAu,...people];let stAll=!cur.status.length||cur.status.length>=4,auAll=!cur.author.length,on=new Set(cur.status),who=new Set(cur.author.map(E=>String(E).toLowerCase()));qp.selectedItems=qp.items.filter(E=>E.pick==="mine"?cur.mine:E.pick==="all-status"?stAll:E.pick==="status"?!stAll&&on.has(E.value):E.pick==="all-author"?auAll:E.pick==="author"&&!auAll&&who.has(String(E.value).toLowerCase()));let lock=0;qp.onDidChangeSelection(items=>{if(lock)return;let sel=items.filter(E=>E.pick),prev=qp._prev||[],added=sel.filter(E=>!prev.includes(E)),keep=sel.filter(E=>E.pick==="mine"),st=sel.filter(E=>E.pick==="status"||E.pick==="all-status"),au=sel.filter(E=>E.pick==="author"||E.pick==="all-author");if(added.some(E=>E.pick==="all-status"))st=[allSt];else if(added.some(E=>E.pick==="status"))st=st.filter(E=>E.pick==="status");else if(!st.some(E=>E.pick==="status")&&!st.some(E=>E.pick==="all-status"))st=[allSt];if(added.some(E=>E.pick==="all-author"))au=[allAu];else if(added.some(E=>E.pick==="author"))au=au.filter(E=>E.pick==="author");else if(!au.some(E=>E.pick==="author")&&!au.some(E=>E.pick==="all-author"))au=[allAu];let next=[...keep,...st,...au];qp._prev=next;if(next.length!==sel.length||next.some(E=>!sel.includes(E))){lock=1;qp.selectedItems=next;lock=0}});qp._prev=[...qp.selectedItems];qp.onDidAccept(async()=>{let chosen=qp.selectedItems.filter(E=>E.pick),st=chosen.some(E=>E.pick==="all-status")?[]:chosen.filter(E=>E.pick==="status").map(E=>E.value),au=chosen.some(E=>E.pick==="all-author")?[]:chosen.filter(E=>E.pick==="author").map(E=>E.value),cfg=C.workspace.getConfiguration("xrayviewer.sidebar");await cfg.update("mine",chosen.some(E=>E.pick==="mine"),C.ConfigurationTarget.Global);await cfg.update("status",st,C.ConfigurationTarget.Global);await cfg.update("author",au,C.ConfigurationTarget.Global);qp.hide()});qp.onDidHide(()=>qp.dispose());qp.show()}),k("xrayviewer.sortBy",async()=>{',
  },
  {
    id: "page-notices",
    find: 'async function Uv(n){let e=C.window.createOutputChannel("X-RayViewer",{log:!0})',
    replace:
      'function xrvInstallNotices(){if(C.window.__xrvNotices)return;C.window.__xrvNotices=1;let w=C.window,info=w.showInformationMessage.bind(w),warn=w.showWarningMessage.bind(w),err=w.showErrorMessage.bind(w),prog=w.withProgress.bind(w),buttons=a=>a.filter(x=>typeof x==="string"),ask=(fallback,tone,message,...rest)=>{let choice=xrvCursor().offerNotice(String(message??""),buttons(rest),tone);return choice||fallback(message,...rest)};w.showInformationMessage=(m,...r)=>ask(info,"info",m,...r);w.showWarningMessage=(m,...r)=>ask(warn,"warning",m,...r);w.showErrorMessage=(m,...r)=>ask(err,"error",m,...r);w.withProgress=(o,task)=>{if(o&&o.location===C.ProgressLocation.Notification){let g=xrvCursor().holdNotice(String(o.title||"Working…"));if(g)return Promise.resolve(task({report(){}})).finally(()=>xrvCursor().clearNotice(g))}return prog(o,task)}}async function Uv(n){xrvInstallNotices();xrvCursor().bindModelStore(n.globalState);let xrvGo=async run=>{let note=run?"Check up to 5 pull requests, then Review all selected and post.":"Check up to 5 pull requests, then Open selected PRs.";let sent=xrvCursor().offerNotice(note,[],"warning");sent||C.window.showInformationMessage(note)};n.subscriptions.push(C.commands.registerCommand("xrayviewer.openSelected",()=>xrvGo(!1)),C.commands.registerCommand("xrayviewer.runSelected",()=>xrvGo(!0)),C.commands.registerCommand("xrayviewer.chooseTheme",()=>xrvCursor().chooseTheme(C)),C.window.registerWebviewViewProvider("xrayviewer.selectionButtons",{resolveWebviewView(view){view.webview.options={enableCommandUris:["xrayviewer.openSelected","xrayviewer.runSelected"]};xrvCursor().bindSelectionBar(view)}}),C.window.registerWebviewViewProvider("xrayviewer.agentActivity",{resolveWebviewView(view){let nonce=Math.random().toString(36).slice(2);view.webview.options={enableScripts:!0,localResourceRoots:[n.extensionUri]};let css=view.webview.asWebviewUri(C.Uri.joinPath(n.extensionUri,"media","ui","styles.css"));view.webview.html=xrvCursor().activityPanelHTML(view.webview.cspSource,nonce,String(css));xrvCursor().bindActivity(view.webview);view.webview.onDidReceiveMessage(m=>xrvCursor().onActivityMessage(m))}}));let e=C.window.createOutputChannel("X-RayViewer",{log:!0})',
  },
  {
    id: "page-notice-answer",
    find: 'rendered(o) { vscode.postMessage({ type: "rendered", key, load, stage: o && o.stage, ms: o && o.ms, error: o && o.error ? String(o.error).slice(0, 300) : undefined }); },',
    replace:
      'rendered(o) { vscode.postMessage({ type: "rendered", key, load, stage: o && o.stage, ms: o && o.ms, error: o && o.error ? String(o.error).slice(0, 300) : undefined }); },\n    notice(id, value) { vscode.postMessage({ type: "notice-answer", key, id: id, value: value }); },',
  },
  {
    id: "sidebar-sort-compare",
    find: 'function cd(n){let e=(t,s)=>(s.record.summary?.updatedAt||"").localeCompare(t.record.summary?.updatedAt||"");return n==="created"?(t,s)=>(s.record.summary?.createdAt||"").localeCompare(t.record.summary?.createdAt||"")||e(t,s):n==="updated"?e:(t,s)=>(s.risk?.score??-1)-(t.risk?.score??-1)||e(t,s)}',
    replace: "function cd(n){return xrvCursor().comparePullRequests(n)}",
  },
  {
    id: "sidebar-sort-closed",
    find: '.sort(cd("updated"))',
    replace: ".sort(s)",
  },
  {
    id: "sidebar-sort-labels",
    find: 'var md={risk:"riskiest first",created:"newest first",updated:"recently updated"}',
    replace: 'var md={risk:"riskiest first",created:"newest first",updated:"recently updated",title:"by title",size:"largest first",number:"highest number"}',
  },
  {
    id: "sidebar-open-selected",
    find: 'k("xrayviewer.sortBy",async()=>{let m=Ei().sortBy,v=[{label:"Risk",detail:"Riskiest first",value:"risk"},{label:"Newest",detail:"Most recently created first",value:"created"},{label:"Recently updated",detail:"Most recent activity first",value:"updated"}].map(E=>({...E,description:E.value===m?"current":""})),A=await C.window.showQuickPick(v,{title:"Sort pull requests"});A&&await C.workspace.getConfiguration("xrayviewer.sidebar").update("sortBy",A.value,C.ConfigurationTarget.Global)}),k("xrayviewer.selectHarness"',
    replace:
      'k("xrayviewer.sortBy",async()=>{let m=Ei().sortBy,v=[{label:"Risk",detail:"Riskiest first, inside every group",value:"risk"},{label:"Recently updated",detail:"Most recent activity first, inside every group",value:"updated"},{label:"Newest",detail:"Most recently created first, inside every group",value:"created"},{label:"Title",detail:"A to Z, inside every group",value:"title"},{label:"Size",detail:"Largest diff first, inside every group",value:"size"},{label:"Number",detail:"Highest pull request number first, inside every group",value:"number"}].map(E=>({...E,description:E.value===m?"current":""})),A=await C.window.showQuickPick(v,{title:"Sort within each group"});A&&await C.workspace.getConfiguration("xrayviewer.sidebar").update("sortBy",A.value,C.ConfigurationTarget.Global)}),' +
      '(xrvGo=async run=>{try{let marked=xrvCursor().checkedKeys().map(id=>r.all().find(rec=>N(rec.key).toLowerCase()===id)).filter(Boolean).map(rec=>({kind:"pr",record:rec})),pick=xrvCursor().chosenPullRequests(marked.length?marked:[...l.selection]);if(!pick.chosen.length){let note="Check up to 5 pull requests first.";let sent=xrvCursor().offerNotice(note,[],"warning");sent||C.window.showInformationMessage(note);return}xrvCursor().clearChecked();a.refresh();for(let row of pick.chosen)await o.show(row.record.key);if(run)for(let row of pick.chosen)xrvCursor().armAutoPost(N(row.record.key)),r.runAgents(row.record.key)}catch(err){let note=`X-RayViewer could not ${run?"run":"open"} the selected pull requests. ${err&&err.message||err}`;let sent=xrvCursor().offerNotice(note,[],"error");sent||C.window.showErrorMessage(note)}}),k("xrayviewer.selectHarness"',
  },
  {
    id: "agent-pause",
    find: '}catch(q){let Le=n.signal?.aborted||q instanceof F&&q.kind==="cancelled",gt=q instanceof F?q.message:String(q?.message||q);return l.agents[$]={state:Le?"cancelled":"failed"',
    replace:
      '}catch(q){let Le=n.signal?.aborted||q instanceof F&&q.kind==="cancelled",gt=q instanceof F?q.message:String(q?.message||q);if(!Le&&xrvCursor().agentUnavailable(q)&&((R.tries??={})[$]=(R.tries[$]||0)+1)<4){l.agents[$]={state:"queued",harness:j.id},c(),t(`${$} is paused on ${j.id} until an agent is free. ${gt}`),await new Promise(res=>{let timer=setTimeout(res,2000);n.signal?.addEventListener("abort",()=>{clearTimeout(timer),res()},{once:!0})});if(n.signal?.aborted)return l.agents[$]={state:"cancelled",harness:j.id},c(),null;return R($,L,B,se)}return l.agents[$]={state:Le?"cancelled":"failed"',
  },
  {
    id: "sidebar-actions",
    find: 'async getChildren(e){return e?e.kind==="group"?e.rows:[]:(await this.service.groups()).map(s=>({kind:"group",...s,rows:s.rows.map(i=>({kind:"pr",...i}))}))}',
    replace: 'async getChildren(e){if(e)return e.kind==="group"?e.rows:[];let groups=await this.service.groups();C.commands.executeCommand("setContext","xrayviewer.hasPullRequests",groups.some(s=>(s.rows||[]).length>0));return groups.map(s=>({kind:"group",...s,rows:s.rows.map(i=>({kind:"pr",...i}))}))}',
  },
  {
    id: "sidebar-check-command",
    find: 'return r.contextValue=`pr.${d}${t.agent?".agent":""}${t.pinned?".pinned":""}`,r.command={command:"xrayviewer.open",title:"Open Review",arguments:[i]}',
    replace: 'r.checkboxState=xrvCursor().isChecked(i)?1:0;return r.contextValue=`pr.${d}${t.agent?".agent":""}${xrvCursor().isChecked(i)?".on":""}${t.pinned?".pinned":""}`,r.command={command:"xrayviewer.open",title:"Open Review",arguments:[i]}',
  },
  {
    id: "sidebar-title-first",
    find: "i=N(t.key),r=new oe.TreeItem(`#${t.key.number} ${s?.title??i}`,oe.TreeItemCollapsibleState.None);",
    replace: "i=N(t.key),r=new oe.TreeItem(s?.title??i,oe.TreeItemCollapsibleState.None);",
  },
  {
    id: "sidebar-repo-icon",
    find: "u.contextValue=\"group\",u.id=`group:${e.id}`,u}",
    replace: "u.contextValue=\"group\",u.id=`group:${e.id}`,String(e.id).startsWith(\"repo:\")&&(u.iconPath=new oe.ThemeIcon(\"repo\")),u}",
  },
  {
    id: "sidebar-badge",
    find: "l.badge=m?{value:m,tooltip:`${m} agent run${m===1?\"\":\"s\"} in progress`}:void 0",
    replace: "l.badge=xrvCursor().sidebarBadge(r.all(),m)",
  },
  {
    id: "model-scope-loop",
    find: "for(;;){await ut();let E=Yt().harnesses,{settings:O}=await $t(),",
    replace: "for(;;){await ut();let E=xrvSc.harnesses(),{settings:O}=await xrvSc.settings(),",
  },
  {
    id: "model-scope-command",
    find: "()=>R());let D=async()=>{",
    replace: "m=>R(m));let D=async()=>{",
  },
  {
    id: "run-pr-models",
    find: "harnesses:o.harnesses,settings:b,enabled:o.agents.enabled",
    replace: "...xrvCursor().withModelChoice(N(e),o.harnesses,b),enabled:o.agents.enabled",
  },
  {
    id: "architecture-instructions",
    find: "architecture:`## Look for\n\nCheck that each change sits in the module that owns it and follows the patterns around it. Flag business logic in request handlers, modules that reach into another module's storage, helpers that duplicate existing ones, and new abstractions without a clear owner.\n\n## Leave alone\n\nNaming, formatting and style. Linters handle those.\n`,correctness:`",
    replace: "architecture:`" + ARCHITECTURE_INSTRUCTIONS + "`,correctness:`",
  },
];

/** Names the patches add; the original bundle must not use them already. */
export const ADDED_NAMES = ["xrvCursorHarness", "xrvCursor", "xrvReview", "xrvA", "xrvPick", "xrvClaude", "xrvCodex", "xrvModel", "xrvDone", "xrvRows", "xrvMove", "xrvSt", "xrvIcon", "xrvStatus", "xrvAgentState", "xrvTabs", "xrvSlot", "xrvHold", "xrvInstallNotices", "xrvScope", "xrvSc", "xrvKey"];

const modelBit = '${modelSummary(AGENTS).line ? ` · ${esc(modelSummary(AGENTS).line)} <button type="button" class="link" data-act="choose-model">Change</button>` : ""}';

/**
 * The Agent activity sheet on the review page. It redraws when the host posts new progress and keeps the rows the
 * reader opened, their scroll position and focus. Between posts, a timer updates only the running clocks.
 */
const ACTIVITY_PAGE = `${activityTime}
${activityGroups}
${activitySummary}
${activityHTML}
let agentProgress = (LIVE && LIVE.agentProgress) || null;
const activityOpen = new Map();
let activityTimer = 0;
let activityShown = "";
let activityDetail = "";
const activityBodyHTML = () => activityHTML(agentProgress, LIVE && LIVE.modelPlan, { esc, icon, avatar: agentAv("xs"), now: Date.now(), open: activityOpen, detail: activityDetail });
function openActivity() {
  runMenu(false);
  activityDetail = "";
  activityShown = JSON.stringify(agentProgress);
  openSheet("activity", sheetHead("activity", "Agent activity") + '<div class="sheet-body" id="activity-body">' + activityBodyHTML() + "</div>", "side activity-sheet");
  clearInterval(activityTimer);
  activityTimer = setInterval(() => {
    if (!S.sheet || S.sheet.id !== "activity") { clearInterval(activityTimer); return; }
    const now = Date.now();
    for (const el of document.querySelectorAll("#activity-body [data-since]")) el.textContent = activityTime(now - Number(el.dataset.since));
  }, 1000);
}
function refreshActivity() {
  const body = S.sheet && S.sheet.id === "activity" ? $("#activity-body") : null;
  if (!body) return;
  const shown = JSON.stringify(agentProgress);
  if (shown === activityShown) return;
  activityShown = shown;
  const atEnd = body.scrollHeight - body.scrollTop - body.clientHeight < 24;
  const top = body.scrollTop;
  const focused = document.activeElement && body.contains(document.activeElement) ? document.activeElement : null;
  const button = focused && focused.dataset.act ? focused : null;
  const holder = focused && !button ? focused.closest("[data-key]") : null;
  const key = holder ? holder.dataset.key : "";
  body.innerHTML = activityBodyHTML();
  body.scrollTop = atEnd ? body.scrollHeight : top;
  if (button) { const again = [...body.querySelectorAll("[data-act]")].find((el) => el.dataset.act === button.dataset.act && el.dataset.id === button.dataset.id && el.className === button.className); if (again) again.focus({ preventScroll: true }); }
  if (key) { const again = [...body.querySelectorAll("[data-key]")].find((el) => el.dataset.key === key); if (again) again.querySelector("summary").focus({ preventScroll: true }); }
}
function showActivity(id) {
  const body = S.sheet && S.sheet.id === "activity" ? $("#activity-body") : null;
  if (!body) return;
  const from = activityDetail;
  activityDetail = id;
  activityShown = JSON.stringify(agentProgress);
  body.innerHTML = activityBodyHTML();
  body.scrollTop = 0;
  const target = id ? body.querySelector('[data-act="activity-back"]') : [...body.querySelectorAll(".check-name")].find((el) => el.dataset.id === from);
  if (target) target.focus();
}
document.addEventListener("toggle", (e) => {
  const el = e.target;
  if (!(el instanceof HTMLDetailsElement) || !el.dataset.key || !el.closest("#activity-body")) return;
  if (el.open === (el.dataset.was === "1")) return;
  el.dataset.was = el.open ? "1" : "0";
  activityOpen.set(el.dataset.key, el.open);
}, true);`;

/** Edits to the review page so a finished run shows the harness and model, or each combination. */
export const UI_PATCHES = [
  {
    id: "brand-mark",
    find: 'const LOGO = `<svg class="logo" viewBox="0 0 30 16" aria-hidden="true"><path d="M1.5 8h27" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" fill="none"/><circle cx="15" cy="8" r="5" fill="var(--sheet)" stroke="currentColor" stroke-width="2.6"/></svg>`;',
    replace:
      'const LOGO = `<svg class="logo" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;',
  },
  {
    id: "comment-tags",
    find: "const LABEL_PREFIX = /^\\s*\\**(nit|question|blocking|suggestion|praise)\\**\\s*(?:\\([^)]*\\))?\\s*:\\s*/i;",
    replace: [tagBadge, commentLevel, readTag, withTag, findingDrafts].map(String).join("\n"),
  },
  {
    id: "adopt-all-button",
    find: '${FIND.length ? `<ol class="brief-list">${items}</ol>` : ""}',
    replace: '${FIND.length ? `<ol class="brief-list">${items}</ol>${adoptAllHTML()}` : ""}',
  },
  {
    id: "adopt-all",
    find: "function adoptFinding(id) {",
    replace: `let lastAdopted = [];
const adoptAllHTML = () => {
  const n = openFindings().length;
  return n > 1 ? \`<div class="brief-bulk"><button type="button" class="btn sm agent" data-act="adopt-all">\${icon("plus")}Add all \${n} to my review</button><span>Each finding becomes its suggested comment on its line, at its level. Edit or remove any of them before you post.</span></div>\` : "";
};
function adoptAll(quiet) {
  const open = openFindings();
  if (!open.length) { if (!quiet) toast("Every finding is already decided."); return; }
  if (S.composer && S.composer.fromFinding && open.some((x) => x.id === S.composer.fromFinding)) closeComposer();
  const { drafts, decisions } = findingDrafts(open.map((x) => ({ ...x, verbatim: verbatimOf(x) })), { newId: uid, lineText, at: nowISO(), run: AGENT_RUN_AT });
  S.drafts.push(...drafts);
  Object.assign(S.findings, decisions);
  lastAdopted = drafts.map((d) => d.id);
  save();
  sendMetrics(open.map((x) => ({ kind: "finding", action: "added", finding: x.id })));
  new Set(open.map((x) => x.f)).forEach((f) => refreshFile(f));
  refreshChrome();
  refreshFlow();
  if (!quiet) toast(\`Added \${plural(open.length, "finding")} to your review. They post when you finish.\`, { act: "adopt-all-undo", label: "Undo" });
}
function adoptAllCardHTML() {
  const n = openFindings().length;
  return n > 1 ? \`<button type="button" class="btn sm ghost" data-act="adopt-all" data-n="\${n}" title="Add every open finding to your review, each as its suggested comment">\${icon("plus")}Add all \${n}</button>\` : "";
}
function syncAdoptAll() {
  const html = adoptAllCardHTML();
  const n = String(openFindings().length);
  $$(".finding-foot").forEach((foot) => {
    const all = foot.querySelector('[data-act="adopt-all"]');
    if (all && all.dataset.n === n) return;
    if (all) all.remove();
    const add = foot.querySelector('[data-act="finding-adopt"]');
    if (add && html) add.insertAdjacentHTML("afterend", html);
  });
}
function undoAdoptAll() {
  const ids = new Set(lastAdopted);
  lastAdopted = [];
  const undone = S.drafts.filter((d) => ids.has(d.id));
  if (!undone.length) return;
  S.drafts = S.drafts.filter((d) => !ids.has(d.id));
  for (const d of undone) if (S.findings[d.fromFinding] && S.findings[d.fromFinding].draft === d.id) delete S.findings[d.fromFinding];
  save();
  sendMetrics(undone.map((d) => ({ kind: "finding", action: "undone", finding: d.fromFinding, reason: "added" })));
  new Set(undone.map((d) => d.f)).forEach((f) => refreshFile(f));
  refreshChrome();
  refreshFlow();
  toast(\`Took \${plural(undone.length, "comment")} back out of your review.\`);
}
function adoptFinding(id) {`,
  },
  {
    id: "xray-pill",
    find: "function prHeadHTML() {",
    replace: `function xrayState() {
  const agents = agentProgress && agentProgress.agents ? Object.values(agentProgress.agents).filter((a) => a && a.state !== "skipped") : [];
  if (agentsRunning) {
    const done = agents.filter((a) => a.state === "done" || a.state === "failed").length;
    return { kind: "running", label: "X-RayViewer reviewing", sub: agents.length ? \`\${done}/\${agents.length}\` : "", title: "X-RayViewer's agents are reviewing this pull request. Click to watch them." };
  }
  if (!AG) {
    if (agents.some((a) => a.state === "failed")) return { kind: "failed", label: "X-RayViewer review failed", sub: "", title: "The last X-RayViewer review failed. Click to see what happened." };
    return { kind: "none", label: "Not reviewed by X-RayViewer", sub: "", title: "X-RayViewer's agents haven't reviewed this pull request yet. Run agents starts a review." };
  }
  const when = AGENT_RUN_AT ? \` \${ago(AGENT_RUN_AT)}\` : "";
  const commit = String(AG.commit || "").slice(0, 7);
  const found = plural(FINDINGS.length, "finding");
  if (agentsBehind()) return { kind: "behind", label: "X-RayViewer reviewed an older push", sub: found, title: \`X-RayViewer reviewed \${commit}\${when}. New commits came after it, and Rerun reviews the latest.\` };
  if (AG.postedAt) return { kind: "posted", label: "X-RayViewer reviewed & posted", sub: found, title: \`X-RayViewer reviewed \${commit}\${when}: \${found}. Posted to GitHub \${ago(AG.postedAt)}.\` };
  return { kind: "current", label: "X-RayViewer reviewed", sub: found, title: \`X-RayViewer reviewed \${commit}\${when}: \${found}. Not posted to GitHub yet.\` };
}
function xrayPillHTML() {
  const s = xrayState();
  const marks = { running: '<span class="spin" aria-hidden="true"></span>', failed: icon("x-circle"), none: icon("circle"), behind: icon("clock"), current: icon("check-circle"), posted: icon("check-circle") };
  return \`<button type="button" class="xray-pill is-\${s.kind}" id="xray-pill" data-act="agent-activity" title="\${esc(s.title)}">\${marks[s.kind]}<span>\${esc(s.label)}</span>\${s.sub ? \`<span class="xray-sub">\${esc(s.sub)}</span>\` : ""}</button>\`;
}
function applyXrayPill() {
  const el = document.getElementById("xray-pill");
  if (!el) return;
  const focused = document.activeElement === el;
  el.outerHTML = xrayPillHTML();
  if (focused) document.getElementById("xray-pill").focus({ preventScroll: true });
}
function prHeadHTML() {`,
  },
  {
    id: "xray-pill-head",
    find: '${PENDING ? "" : riskPillHTML(currentRisk())}<span class="mono dim">',
    replace: '${PENDING ? "" : riskPillHTML(currentRisk())}${xrayPillHTML()}<span class="mono dim">',
  },
  {
    id: "adopt-all-card",
    find: '${icon("plus")}Add to my review</button>',
    replace: '${icon("plus")}Add to my review</button>${adoptAllCardHTML()}',
  },
  {
    id: "adopt-all-sync",
    find: 'function refreshChrome() {\n  if (S.view !== "pr") return;',
    replace: 'function refreshChrome() {\n  if (S.view !== "pr") return;\n  syncAdoptAll();',
  },
  {
    id: "adopt-all-actions",
    find: '"finding-adopt": (el) => adoptFinding(el.dataset.id),',
    replace: '"finding-adopt": (el) => adoptFinding(el.dataset.id),\n  "adopt-all": () => adoptAll(),\n  "adopt-all-undo": () => undoAdoptAll(),',
  },
  {
    id: "comment-tags-read",
    find:
      "    const m = bodies[0].match(LABEL_PREFIX);\n" +
      "    return {\n" +
      '      id: t.id, gh: true, f: f.i, k, label: m ? m[1].toLowerCase() : "", outdated: t.outdated,',
    replace:
      "    const m = readTag(bodies[0]);\n" +
      "    return {\n" +
      '      id: t.id, gh: true, f: f.i, k, label: m ? m.label : "", level: m ? m.level : "", outdated: t.outdated,',
  },
  {
    id: "comment-tags-body",
    find: "body: i === 0 && m ? bodies[0].slice(m[0].length) : bodies[i]",
    replace: "body: i === 0 && m ? bodies[0].slice(m.length) : bodies[i]",
  },
  {
    id: "comment-levels",
    find: 'const withLabel = (label, body) => (label && !new RegExp(`^\\\\s*\\\\**${label}\\\\b`, "i").test(body) ? `${label}: ${body}` : body);',
    replace: [
      "function draftLevel(d) { return commentLevel(d, d.fromFinding ? findingById(d.fromFinding) : null); }",
      'function levelChip(level) { return SEV[level] ? `<span class="sev sev-${level}">${SEV[level]}</span>` : ""; }',
      "function levelRowHTML(c) {",
      "  const now = draftLevel(c);",
      '  return `<div class="labels levels" role="radiogroup" aria-label="Level"><span class="levels-name">Level</span>${Object.entries(SEV).map(([v, l]) => `<button type="button" role="radio" class="lab lv-${v}" aria-checked="${now === v}" data-act="level" data-v="${v}">${l}</button>`).join("")}</div>`;',
      "}",
      "function setLevel(value) {",
      "  const c = S.composer;",
      "  if (!c) return;",
      '  const ta = $("#composer-text");',
      "  if (ta) c.text = ta.value;",
      "  c.level = value;",
      '  replaceHTML("#composer", composerHTML());',
      '  const next = $("#composer-text");',
      "  if (next) { next.focus({ preventScroll: true }); next.setSelectionRange(next.value.length, next.value.length); }",
      "}",
    ].join("\n"),
  },
  {
    id: "comment-levels-post",
    find: "body: withLabel(d.label, d.body)",
    replace: "body: withTag(draftLevel(d), d.body)",
  },
  {
    id: "comment-levels-composer",
    find: '    f: fi, k, label: opts.label ?? "", text: opts.text ?? "",',
    replace: '    f: fi, k, label: opts.label ?? "", level: opts.level ?? "", text: opts.text ?? "",',
  },
  {
    id: "comment-levels-row",
    find: 'data-act="label" data-v="${v}">${l}</button>`).join("")}</div>`}',
    replace: 'data-act="label" data-v="${v}">${l}</button>`).join("")}</div>${levelRowHTML(c)}`}',
  },
  {
    id: "comment-levels-action",
    find: "  label: (el) => setLabel(el.dataset.v),",
    replace: "  label: (el) => setLabel(el.dataset.v),\n  level: (el) => setLevel(el.dataset.v),",
  },
  {
    id: "comment-levels-save",
    find:
      "    if (d) { d.body = text; if (!c.replyTo) d.label = c.label; }\n" +
      "  } else if (c.replyTo) {\n" +
      "    S.drafts.push({ id: uid(), replyTo: c.replyTo, body: text });\n" +
      "  } else {\n" +
      "    const id = uid();\n" +
      "    S.drafts.push({ id, f: c.f, k: c.k, lineText: lineText(c.f, c.k), label: c.label, body: text,",
    replace:
      "    if (d) { d.body = text; if (!c.replyTo) { d.label = c.label; d.level = draftLevel({ ...c, fromFinding: d.fromFinding }); } }\n" +
      "  } else if (c.replyTo) {\n" +
      "    S.drafts.push({ id: uid(), replyTo: c.replyTo, body: text });\n" +
      "  } else {\n" +
      "    const id = uid();\n" +
      "    S.drafts.push({ id, f: c.f, k: c.k, lineText: lineText(c.f, c.k), label: c.label, level: draftLevel(c), body: text,",
  },
  {
    id: "comment-levels-edit",
    find: '{ label: d.label || "", text: d.body, editing: d.id, replyTo: d.replyTo || null }',
    replace: '{ label: d.label || "", level: d.level || "", text: d.body, editing: d.id, replyTo: d.replyTo || null }',
  },
  {
    id: "comment-levels-chip",
    find: '<header class="cmt-head"><b>${esc(nameOf(c.by))}</b>${label ?',
    replace: '<header class="cmt-head"><b>${esc(nameOf(c.by))}</b>${levelChip(c.level)}${label ?',
  },
  {
    id: "comment-levels-draft",
    find: 'commentHTML({ by: "you", body: d.body, draft: d.id, via: d.fromFinding, verbatim: d.verbatim }, d.label, d)',
    replace: 'commentHTML({ by: "you", body: d.body, draft: d.id, via: d.fromFinding, verbatim: d.verbatim, level: draftLevel(d) }, d.label, d)',
  },
  {
    id: "comment-levels-thread",
    find: '${t.comments.map((c, i) => commentHTML(c, i === 0 ? t.label : "", t)).join("")}',
    replace: '${t.comments.map((c, i) => commentHTML(i === 0 ? { ...c, level: t.level } : c, i === 0 ? t.label : "", t)).join("")}',
  },
  {
    id: "comment-levels-list",
    find: '<span class="titem-top">${t.label ? `<span class="label l-${t.label}">${t.label}</span>` : ""}',
    replace: '<span class="titem-top">${levelChip(t.level)}${t.label ? `<span class="label l-${t.label}">${t.label}</span>` : ""}',
  },
  {
    id: "comment-levels-list-detached",
    find: '<span class="label l-draft">draft</span>${d.label ?',
    replace: '<span class="label l-draft">draft</span>${levelChip(draftLevel(d))}${d.label ?',
  },
  {
    id: "comment-levels-list-draft",
    find: '<span class="label l-draft">${t ? "reply" : "draft"}</span>${d.label ?',
    replace: '<span class="label l-draft">${t ? "reply" : "draft"}</span>${t ? "" : levelChip(draftLevel(d))}${d.label ?',
  },
  {
    id: "model-summary",
    find: "const agentsBehind = () => !!(AG && AG.commit && D.head && AG.commit !== D.head.sha);",
    replace:
      "const agentsBehind = () => !!(AG && AG.commit && D.head && AG.commit !== D.head.sha);\n" +
      modelSummary.toString(),
  },
  {
    id: "briefing-model",
    find: '${decided ? `, ${decided} decided` : ""}${agentsBehind() ? ` · <b>an older push than the one you\'re reviewing</b>` : ""}</p>',
    replace:
      '${decided ? `, ${decided} decided` : ""}${agentsBehind() ? ` · <b>an older push than the one you\'re reviewing</b>` : ""}' +
      modelBit +
      "</p>",
  },
  {
    id: "pending-briefing-model",
    find: '${FINDINGS.length ? ", listed with the changes" : ""}${agentsBehind() ? ` · <b>an older push than the one you\'re reviewing</b>` : ""}</p>',
    replace:
      '${FINDINGS.length ? ", listed with the changes" : ""}${agentsBehind() ? ` · <b>an older push than the one you\'re reviewing</b>` : ""}' +
      modelBit +
      "</p>",
  },
  {
    id: "workflow-model",
    find:
      'out.push({ id: "agents", name: "Agent review", short: "Agents", st: "done", note: STAGE_NOTE_AGENTS,\n' +
      "      gates: AGENTS.map((a) => {\n" +
      "        const n = found.filter((x) => x.agent === a.id).length;\n" +
      '        return { id: `agent-${a.id}`, agent: true, name: a.name, role: a.focus, st: "passed",\n' +
      '          detail: a.id === "guide" ? `Drafted ${plural((PR.plan || []).length, "chapter")}` : n ? plural(n, "finding") : "Nothing to flag" };\n' +
      "      }),\n" +
      '      caption: found.length ? `${plural(found.length, "finding")}${high ? `, ${high} high` : ""}` : "Nothing flagged" });',
    replace:
      "const models = modelSummary(AGENTS);\n" +
      '    out.push({ id: "agents", name: "Agent review", short: "Agents", st: "done", note: STAGE_NOTE_AGENTS + (models.line ? ` ${models.line}.` : ""),\n' +
      "      gates: AGENTS.map((a) => {\n" +
      "        const n = found.filter((x) => x.agent === a.id).length;\n" +
      '        return { id: `agent-${a.id}`, agent: true, name: a.name, role: a.focus, st: "passed",\n' +
      '          detail: (a.id === "guide" ? `Drafted ${plural((PR.plan || []).length, "chapter")}` : n ? plural(n, "finding") : "Nothing to flag") + models.detail(a) };\n' +
      "      }),\n" +
      '      caption: (found.length ? `${plural(found.length, "finding")}${high ? `, ${high} high` : ""}` : "Nothing flagged") + models.caption });',
  },
  {
    id: "run-button",
    find: 'const hostRunHTML = (label) => `<button type="button" class="btn sm ghost" data-act="host-run-agents">${icon("play")}${label}</button>`;',
    replace:
      "let agentsRunning = !!(LIVE && LIVE.agentsRunning);\n" +
      "let runState = (LIVE && LIVE.runState) || \"\";\n" +
      "let runButtonLabel = \"Rerun\";\n" +
      "const runMainHTML = (label) => agentsRunning\n" +
      "  ? `<button type=\"button\" class=\"btn sm ghost\" id=\"host-run\" data-act=\"agent-activity\" title=\"See what each agent is doing\"><span class=\"spin\" aria-hidden=\"true\"></span>Agents are running</button>`\n" +
      "  : `<button type=\"button\" class=\"btn sm ghost\" id=\"host-run\" data-act=\"host-run-agents\">${icon(\"play\")}${label}</button>`;\n" +
      "// Choose model stays in the run menu even while the agents run.\n" +
      "const hostRunHTML = (label) => {\n" +
      "  runButtonLabel = label;\n" +
      "  return `<div class=\"run-tools\"><div class=\"split-btn\" id=\"host-run-wrap\">${runMainHTML(label)}\n" +
      "      <button type=\"button\" class=\"btn sm ghost sb-caret\" data-act=\"run-menu\" aria-haspopup=\"menu\" aria-expanded=\"false\" aria-controls=\"run-menu\" aria-label=\"Choose the model the agents run on\">${icon(\"chev\")}</button>\n" +
      "      <div class=\"menu\" id=\"run-menu\" role=\"menu\" aria-label=\"Agent runs\" hidden>${chooseModelHTML()}</div></div>${postAllHTML()}</div>`;\n" +
      "};\n" +
      "const applyRunButton = () => { const btn = document.getElementById(\"host-run\"); if (btn) btn.outerHTML = runMainHTML(runButtonLabel); applyXrayPill(); };\n" +
      "const modelNow = () => {\n" +
      "  const line = LIVE && LIVE.modelPlan && LIVE.modelPlan.length ? modelSummary(LIVE.modelPlan).line : \"\";\n" +
      "  if (!line) return { text: \"\", title: \"Choose model\" };\n" +
      "  return line.startsWith(\"Model: \") ? { text: line.slice(7), title: line } : { text: \"Mixed models\", title: line };\n" +
      "};\n" +
      "const chooseModelHTML = () => {\n" +
      "  const now = modelNow();\n" +
      "  return `<button type=\"button\" role=\"menuitem\" class=\"menu-item\" id=\"choose-model\" data-act=\"choose-model\" title=\"${esc(now.title)}\"><b>Choose model…</b><span>${esc(now.text || \"The CLI and model the agents run on\")}</span></button>`;\n" +
      "};\n" +
      "const applyModelNow = () => { const item = document.getElementById(\"choose-model\"); if (item) item.outerHTML = chooseModelHTML(); };\n" +
      "const runMenuOpen = () => { const m = $(\"#run-menu\"); return !!(m && !m.hidden); };\n" +
      "function runMenu(open) {\n" +
      "  const menu = $(\"#run-menu\"), caret = $(\"#host-run-wrap .sb-caret\");\n" +
      "  if (!menu || !caret) return;\n" +
      "  menu.hidden = !open;\n" +
      "  caret.setAttribute(\"aria-expanded\", String(open));\n" +
      "  if (open) { const first = menu.querySelector(\".menu-item\"); if (first) first.focus(); }\n" +
      "}\n" +
      "function postAllKey() { return PR.repo + \"#\" + PR.number; }\n" +
      "function postAllOn() { try { return localStorage.getItem(\"xrv:postAll\") === \"1\"; } catch { return false; } }\n" +
      "function postAllArmed() { try { return localStorage.getItem(\"xrv:postAllFor\") === postAllKey(); } catch { return false; } }\n" +
      "function armPostAll() { try { localStorage.setItem(\"xrv:postAllFor\", postAllKey()); } catch { /* the run still starts */ } }\n" +
      "function disarmPostAll() { try { localStorage.removeItem(\"xrv:postAllFor\"); } catch { /* optional */ } }\n" +
      "function setPostAll(on) {\n" +
      "  try { localStorage.setItem(\"xrv:postAll\", on ? \"1\" : \"0\"); } catch { /* optional */ }\n" +
      "  const live = [\"queued\", \"running\", \"waiting\", \"elsewhere\"].includes(runState);\n" +
      "  if (on && agentsRunning && live) armPostAll();\n" +
      "  else if (!on) disarmPostAll();\n" +
      "}\n" +
      "function postAllHTML() {\n" +
      "  return `<label class=\"post-all\" title=\"After you run the agents, every open finding is added and posted to the pull request.\"><input type=\"checkbox\" id=\"post-all\"${postAllOn() ? \" checked\" : \"\"}><span>Post all findings when finished</span></label>`;\n" +
      "}\n" +
      "let postingAll = false;\n" +
      "function onHostRun(m) {\n" +
      "  const was = agentsRunning;\n" +
      "  agentsRunning = !!m.running;\n" +
      "  if (m.state) runState = m.state;\n" +
      "  if (m.progress) agentProgress = m.progress;\n" +
      "  applyRunButton();\n" +
      "  refreshActivity();\n" +
      "  if (m.autoPost) armPostAll();\n" +
      "  if (postAllOn() && agentsRunning && !m.automatic) armPostAll();\n" +
      "  if (!postAllArmed()) return;\n" +
      "  if (was && !agentsRunning && m.state === \"done\" && typeof HOST.reload === \"function\") HOST.reload();\n" +
      "  if (was && !agentsRunning && (m.state === \"failed\" || m.state === \"cancelled\")) {\n" +
      "    disarmPostAll();\n" +
      "    toast(m.state === \"cancelled\" ? \"The agents stopped, so the review was not posted.\" : \"The agents failed, so the review was not posted.\");\n" +
      "  }\n" +
      "}\n" +
      "async function postFinishedReview() {\n" +
      "  if (postingAll || PENDING || S.view !== \"pr\") return;\n" +
      "  postingAll = true;\n" +
      "  disarmPostAll();\n" +
      "  try {\n" +
      "    const open = openFindings();\n" +
      "    if (!open.length && !S.drafts.length) {\n" +
      "      toast(FINDINGS.length ? \"The agents finished, but no finding landed on a line to post.\" : \"The agents finished with nothing to post.\");\n" +
      "      return;\n" +
      "    }\n" +
      "    if (!LIVE.github) { toast(\"The agents finished. Sign in with gh auth login, then post the review.\"); return; }\n" +
      "    if (open.length) adoptAll(true);\n" +
      "    if (!S.drafts.length) { toast(\"The agents finished with nothing to post.\"); return; }\n" +
      "    S.pushDecision = \"comment\";\n" +
      "    openFinish();\n" +
      "    S.pushConfirm = true;\n" +
      "    refreshPushFoot();\n" +
      "    await postPush();\n" +
      "  } finally { postingAll = false; }\n" +
      "}\n" +
      "function maybePostAll() {\n" +
      "  if (!postAllArmed() || agentsRunning || runState !== \"done\") return;\n" +
      "  void postFinishedReview();\n" +
      "}\n" +
      ACTIVITY_PAGE,
  },
  {
    id: "run-button-click",
    find: '"host-run-agents": () => {\n    HOST.runAgents();\n    toast("The agents are running. X-RayViewer tells you when they finish.");\n  },',
    replace:
      '"host-run-agents": () => {\n' +
      "    if (agentsRunning) return;\n" +
      "    agentsRunning = true;\n" +
      "    applyRunButton();\n" +
      "    HOST.runAgents();\n" +
      "  },\n" +
      '  "run-menu": () => runMenu(!runMenuOpen()),\n' +
      '  "agent-activity": () => { runMenu(false); if (typeof HOST.showActivity === "function") HOST.showActivity(); else openActivity(); },\n  "activity-detail": (el) => showActivity(el.dataset.id),\n  "activity-back": () => showActivity(""),\n' +
      '  "choose-model": () => { runMenu(false); if (typeof HOST.chooseHarness === "function") HOST.chooseHarness(); },',
  },
  {
    id: "run-menu-close",
    find: '  if (agentMenuOpen() && !e.target.closest("#agent-copy")) agentMenu(false);',
    replace:
      '  if (agentMenuOpen() && !e.target.closest("#agent-copy")) agentMenu(false);\n' +
      '  if (runMenuOpen() && !e.target.closest("#host-run-wrap")) runMenu(false);',
  },
  {
    id: "run-menu-keys",
    find: '  if (agentMenuOpen() && t.closest("#agent-copy")) {',
    replace:
      '  if (runMenuOpen() && t.closest("#host-run-wrap")) {\n' +
      '    if (e.key === "Escape") { e.preventDefault(); runMenu(false); const c = $("#host-run-wrap .sb-caret"); if (c) c.focus(); return; }\n' +
      '    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {\n' +
      "      e.preventDefault();\n" +
      '      const items = [...document.querySelectorAll("#run-menu .menu-item")], at = items.indexOf(document.activeElement);\n' +
      '      const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : at < 0 ? 0 : (at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;\n' +
      "      if (items[next]) items[next].focus();\n" +
      "      return;\n" +
      "    }\n" +
      '    if (e.key === "Tab") runMenu(false);\n' +
      "    return;\n" +
      "  }\n" +
      '  if (agentMenuOpen() && t.closest("#agent-copy")) {',
  },
  {
    id: "post-review-button",
    find: `function finishBtnHTML(where) {
  const badge = S.drafts.length ? \`<i class="badge">\${S.drafts.length}</i>\` : "";
  return \`<button type="button" class="btn primary finish finish-\${where}" data-act="finish">Finish review\${badge}</button>\`;
}`,
    replace: `function finishBtnHTML(where) {
  const posted = !S.drafts.length && !!MY_REVIEW;
  const label = posted ? "Update review" : "Post review";
  const badge = S.drafts.length ? \`<i class="badge">\${S.drafts.length}</i>\` : "";
  const tip = posted ? "You already posted a review. This sends another one." : "Post your review to GitHub";
  return \`<button type="button" class="btn\${posted ? "" : " primary"} finish finish-\${where}" data-act="finish" title="\${tip}">\${label}\${badge}</button>\`;
}`,
  },
  {
    id: "post-review-gate",
    find: 'const gate = { id: "you", who: "you", name: "You", mine: true, action: { act: "finish", label: "Finish review" } };',
    replace:
      'const gate = { id: "you", who: "you", name: "You", mine: true, action: { act: "finish", label: S.drafts.length || !MY_REVIEW ? "Post review" : "Update review" } };',
  },
  {
    id: "state-pill-colors",
    find: `function prState() {
  const p = LIVE.pr || {};
  if (p.state === "MERGED") return { label: "Merged", cls: "s-ok" };
  if (p.state === "CLOSED") return { label: "Closed", cls: "s-bad" };
  if (p.isDraft) return { label: "Draft", cls: "s-blue" };
  const verdict = reviewVerdict();
  if (verdict === "CHANGES_REQUESTED") return { label: "Changes requested", cls: "s-bad" };
  if (verdict === "APPROVED") return { label: "Approved", cls: "s-ok" };
  return { label: "In review", cls: "s-blue" };`,
    replace: `function prState() {
  const p = LIVE.pr || {};
  if (p.state === "MERGED") return { label: "Merged", cls: "s-merged" };
  if (p.state === "CLOSED") return { label: "Closed", cls: "s-bad" };
  if (p.isDraft) return { label: "Draft", cls: "s-draft" };
  const verdict = reviewVerdict();
  if (verdict === "CHANGES_REQUESTED") return { label: "Changes requested", cls: "s-bad" };
  if (verdict === "APPROVED") return { label: "Approved", cls: "s-ok" };
  return { label: "In review", cls: "s-open" };`,
  },
  {
    id: "brand-word",
    find: '<span class="brand-word">xrayviewer</span>',
    replace: '<span class="brand-word">X-RayViewer</span>',
  },
  {
    id: "post-still-reloads",
    find: 'showPushPanel(`<p class="push-ok">${icon("check-circle")}<span>Posted to GitHub.${review && review.url ? ` <a class="link" href="${esc(review.url)}" target="_blank" rel="noopener">Open the review</a>.` : ""} Reloading with the latest from GitHub…</span></p>`);\n    await api("POST", "/refresh");\n    reloadPage();',
    replace:
      'showPushPanel(`<p class="push-ok">${icon("check-circle")}<span>Posted to GitHub.${review && review.url ? ` <a class="link" href="${esc(review.url)}" target="_blank" rel="noopener">Open the review</a>.` : ""} Reloading with the latest from GitHub…</span></p>`);\n' +
      "    notePosted(p.body.event, p.body.comments.length, review && review.url);\n" +
      "    try { await api(\"POST\", \"/refresh\"); } catch { /* reload fetches GitHub again */ }\n" +
      "    reloadPage();",
  },
  {
    id: "your-review-on-top",
    find: `function statusLine() {
  const p = LIVE.pr || {};
  if (p.state === "MERGED") return { tone: "merged", icon: "merge", html: esc(endedLine(p)) };
  if (p.state === "CLOSED") return { tone: "closed", icon: "x-circle", html: esc(endedLine(p)) };
  if (ownPR() || !LIVE.viewer) return null;
  if (!MY_REVIEW) return { tone: "todo", icon: "eye", html: REQUESTED ? "Your review is requested · you haven't reviewed this yet" : "You haven't reviewed this yet" };
  const at = \`\${timeAgo(MY_REVIEW.at)}\${MY_REVIEW.commit ? \` at <code>\${esc(MY_REVIEW.commit.slice(0, 7))}</code>\` : ""}\`;
  const did = myDid();
  const lead = MY_REVIEW.state === "DISMISSED" ? \`your review from \${at} was dismissed\` : \`you \${did}\${did === "approved" ? " this" : ""} \${at}\`;
  const tone = MY_REVIEW.state === "DISMISSED" ? "todo" : MY_OPINION === "APPROVED" ? "ok" : MY_OPINION === "CHANGES_REQUESTED" ? "bad" : "info";
  const ic = tone === "ok" ? "check-circle" : tone === "bad" ? "x-circle" : tone === "info" ? "message" : "eye";
  return { tone, icon: ic, html: cap(\`\${REQUESTED ? "your review is requested again · " : ""}\${lead} · \${sinceWords()}\`) };
}

function statusLineHTML() {
  const st = statusLine();
  return st ? \`<p class="pr-status ps-\${st.tone}" id="pr-status">\${icon(st.icon)}<span>\${st.html}</span></p>\` : "";
}`,
    replace: `function yourReviewLine() {
  if (ownPR() || !LIVE.viewer) return null;
  if (!MY_REVIEW) return { tone: "todo", icon: "eye", html: REQUESTED ? "Your review is requested · you haven't reviewed this yet" : "You haven't reviewed this yet" };
  const at = \`\${timeAgo(MY_REVIEW.at)}\${MY_REVIEW.commit ? \` at <code>\${esc(MY_REVIEW.commit.slice(0, 7))}</code>\` : ""}\`;
  const did = myDid();
  const lead = MY_REVIEW.state === "DISMISSED" ? \`your review from \${at} was dismissed\` : \`you \${did}\${did === "approved" ? " this" : ""} \${at}\`;
  const tone = MY_REVIEW.state === "DISMISSED" ? "todo" : MY_OPINION === "APPROVED" ? "ok" : MY_OPINION === "CHANGES_REQUESTED" ? "bad" : "info";
  const ic = tone === "ok" ? "check-circle" : tone === "bad" ? "x-circle" : tone === "info" ? "message" : "eye";
  return { tone, icon: ic, html: cap(\`\${REQUESTED ? "your review is requested again · " : ""}\${lead} · \${sinceWords()}\`) };
}

function statusLine() {
  const p = LIVE.pr || {};
  if (p.state === "MERGED") return { tone: "merged", icon: "merge", html: esc(endedLine(p)) };
  if (p.state === "CLOSED") return { tone: "closed", icon: "x-circle", html: esc(endedLine(p)) };
  return yourReviewLine();
}

function statusLineHTML() {
  const p = LIVE.pr || {};
  const ended = p.state === "MERGED" || p.state === "CLOSED";
  const lines = [ended ? yourReviewLine() : null, statusLine()].filter(Boolean);
  return lines.map((st, i) => \`<p class="pr-status ps-\${st.tone}"\${i ? "" : \` id="pr-status"\`}>\${icon(st.icon)}<span>\${st.html}</span></p>\`).join("");
}`,
  },
  {
    id: "run-button-message",
    find: 'if (m.type === "host-pr-changed") { showChange(m); return; }',
    replace:
      'if (m.type === "host-run") { onHostRun(m); return; }\n' +
      '  if (m.type === "host-model") { if (LIVE) LIVE.modelPlan = m.plan; applyModelNow(); return; }\n' +
      '  if (m.type === "host-notice") { showHostNotice(m); return; }\n' +
      '  if (m.type === "host-pr-changed") { showChange(m); return; }',
  },
  {
    id: "post-all-checkbox",
    find:
      'document.addEventListener("change", (e) => {\n' +
      "  const t = e.target;\n" +
      "  if (t.dataset && t.dataset.planFile && S.planDraft) movePlanFile(t.dataset.planFile, t.value);\n" +
      '  if (t.name === "decision") S.pushDecision = t.value;\n' +
      "}, { signal });",
    replace:
      'document.addEventListener("change", (e) => {\n' +
      "  const t = e.target;\n" +
      '  if (t.id === "post-all") setPostAll(!!t.checked);\n' +
      "  if (t.dataset && t.dataset.planFile && S.planDraft) movePlanFile(t.dataset.planFile, t.value);\n" +
      '  if (t.name === "decision") S.pushDecision = t.value;\n' +
      "}, { signal });",
  },
  {
    id: "post-all-after-load",
    find: "render();\nwatchActivity();\n// Starting again ends this start:",
    replace: "render();\nwatchActivity();\nmaybePostAll();\nshowPostedNotice();\n// Starting again ends this start:",
  },
  {
    id: "notice-banner",
    find: toastFind,
    replace: noticeSource(),
  },
  {
    id: "notice-mark",
    find: noticeFind,
    replace: noticeReplace,
  },
  {
    id: "notice-dismiss",
    find: '"notice-close": () => { S.noticeHidden = true; const el = $("#notice"); if (el) el.innerHTML = ""; },',
    replace:
      '"notice-close": () => {\n' +
      '    const box = document.querySelector("#notice .notice, #toasts .notice");\n' +
      '    const pin = !!(box && box.dataset.pin === "1");\n' +
      "    const ask = box && box.dataset.ask;\n" +
      '    if (ask && HOST && HOST.notice) HOST.notice(ask, "");\n' +
      '    if (pin) { S.noticeHidden = true; bannerPin = ""; }\n' +
      "    dropBanner(pin);\n" +
      "  },\n" +
      '  "notice-pick": (el) => {\n' +
      "    if (HOST && HOST.notice) HOST.notice(el.dataset.nid, el.dataset.value || \"\");\n" +
      "    dropBanner(false);\n" +
      "  },",
  },
  {
    id: "notice-release",
    find: 'if (fn) { if (el.tagName === "A") e.preventDefault(); fn(el, e); return; }',
    replace: 'if (fn) { if (el.tagName === "A") e.preventDefault(); if (el.closest(".notice")) releaseBanner(el); fn(el, e); return; }',
  },
  ...THEME_PATCHES,
  ...CHROME_PATCHES,
  ...NAV_PATCHES,
];

export const UI_ADDED_NAMES = [
  "modelSummary", "runMainHTML", "modelNow", "chooseModelHTML", "applyModelNow", "runMenuOpen", "runMenu",
  "tagBadge", "commentLevel", "readTag", "withTag", "draftLevel", "levelChip", "levelRowHTML", "setLevel",
  "activityTime", "activityGroups", "activitySummary", "activityHTML", "agentProgress", "activityOpen", "activityTimer",
  "activityShown", "activityBodyHTML", "openActivity", "refreshActivity", "activityDetail", "showActivity",
  "findingDrafts", "lastAdopted", "adoptAllHTML", "adoptAll", "undoAdoptAll", "adoptAllCardHTML", "syncAdoptAll", "xrayState", "xrayPillHTML", "applyXrayPill",
  "postAllKey", "postAllOn", "postAllArmed", "armPostAll", "disarmPostAll", "setPostAll", "postAllHTML", "postingAll", "onHostRun", "postFinishedReview", "maybePostAll", "runState",
  "TONE_ICONS", "toneOf", "toneHTML", "notePosted", "showPostedNotice", "bannerTimer", "bannerPin", "bannerNow", "bannerStay", "bannerHost", "bannerHTML", "paintBanner", "dropBanner", "releaseBanner", "showPinnedNotice", "showHostNotice",
  ...THEME_NAMES,
  ...CHROME_NAMES,
  ...NAV_NAMES,
];

export function countOccurrences(text, needle) {
  let count = 0;
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + needle.length)) count++;
  return count;
}

export function applyPatches(source, patches = PATCHES, addedNames = ADDED_NAMES) {
  for (const name of addedNames) {
    if (new RegExp(`\\b${name}\\b`).test(source)) throw new Error(`The bundle already uses the name ${name}.`);
  }
  let text = source;
  for (const patch of patches) {
    const count = countOccurrences(text, patch.find);
    if (count !== 1) throw new Error(`Patch "${patch.id}": expected its anchor once, found it ${count} times.`);
    text = text.replace(patch.find, () => patch.replace);
  }
  return text;
}
