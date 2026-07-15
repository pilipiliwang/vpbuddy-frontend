import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const repoRoot = process.env.VPBUDDY_FRONTEND_ROOT
  ? path.resolve(process.env.VPBUDDY_FRONTEND_ROOT)
  : fileURLToPath(new URL("../", import.meta.url));
const mainSource = await readFile(path.join(repoRoot, "src", "main.js"), "utf8");
const clientSource = await readFile(path.join(repoRoot, "src", "api", "client.js"), "utf8");
const stylesSource = await readFile(path.join(repoRoot, "src", "styles.css"), "utf8");

function assertSourceIncludes(source, pattern, message) {
  assert.ok(pattern.test(source), message);
}

function assertSourceExcludes(source, pattern, message) {
  assert.ok(!pattern.test(source), message);
}

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

function cssRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`).exec(stylesSource);
  assert.ok(match, `missing CSS rule: ${selector}`);
  return match[1];
}

test("the formal login is email/password auth, not phone OTP or invite auth", () => {
  const forbiddenUiMarkers = [
    "手机号",
    "短信验证码",
    "发送验证码",
    "邀请码",
    "one-time-code"
  ];

  for (const marker of forbiddenUiMarkers) {
    assert.ok(!mainSource.includes(marker), `formal login still contains obsolete auth marker: ${marker}`);
  }

  assertSourceExcludes(mainSource, /inputmode\s*=\s*["']tel["']/i, "formal login must not render a telephone input");
  assertSourceExcludes(clientSource, /\/api\/auth\/(?:sms|otp|invite|phone)(?:\/|["'`])/i, "API client must not call phone/OTP/invite auth routes");
  assertSourceExcludes(clientSource, /\b(?:smsCode|otp|inviteCode|phoneNumber|phone_number)\b/i, "API client must not send phone/OTP/invite auth fields");
  assertSourceIncludes(mainSource, /(?:type|autocomplete)\s*=\s*["']email["']/i, "formal login must include an email field");
  assertSourceIncludes(mainSource, /type\s*=\s*["']password["']/i, "formal login must include a password field");
  assertSourceIncludes(mainSource, /\bapi\.login\s*\(/, "formal login must call api.login");
});

test("the production client wires persisted JWT state into createVpbuddyApi", () => {
  assertSourceIncludes(mainSource, /createVpbuddyApi\s*\(\s*\{[\s\S]*?\bgetToken\s*:/, "createVpbuddyApi must receive getToken");
  assertSourceIncludes(mainSource, /\b(?:accessToken|access_token|authToken|auth_token|token)\b/, "production flow must retain the backend JWT token");
  assertSourceIncludes(mainSource, /(?:localStorage|sessionStorage)/, "JWT state must use browser storage");
  assertSourceIncludes(mainSource, /\.setItem\s*\(/, "successful auth must persist the JWT");
  assertSourceIncludes(mainSource, /\.removeItem\s*\(/, "logout/invalid auth must clear the JWT");
  assertSourceExcludes(mainSource, /\bnew\s+EventSource\s*\(/, "protected meeting events must use a Bearer-capable transport, not native EventSource");
});

test("production-backed collections do not boot from embedded mock records", () => {
  const remoteCollections = [
    "meetings",
    "timeline",
    "meetingRecords",
    "materials",
    "aiFollowupQuestions",
    "deliverables",
    "demoVersions",
    "conceptSources",
    "explanationFindings",
    "knowledgeDocs",
    "todoItems"
  ];

  for (const name of remoteCollections) {
    const emptyDeclaration = new RegExp(`\\b(?:const|let)\\s+${name}\\s*=\\s*\\[\\s*\\]\\s*;`);
    assert.ok(emptyDeclaration.test(mainSource), `${name} must start empty and be populated only from the backend`);
  }
});

test("production request failures never switch to mock data or local substitutes", () => {
  const forbiddenFallbackMarkers = [
    "shouldUseDemoData",
    "createLocalMeeting",
    "后端未连接，使用演示数据",
    "消息已保存到本地记录",
    "新会议已在本地开启",
    "知识文档保留在本地选择记录",
    "会议材料已加入本地列表"
  ];

  for (const marker of forbiddenFallbackMarkers) {
    assert.ok(!mainSource.includes(marker), `production fallback marker must be removed: ${marker}`);
  }

  assertSourceExcludes(mainSource, /["']mock["']/, "production state must not include a mock API status");
  assertSourceExcludes(mainSource, /setApiStatus\([\s\S]{0,120}?\?\s*["']connected["']\s*:\s*["']mock["']/, "request failures must not select mock mode");
});

test("meeting cards do not treat a missing backend lifecycle as active", () => {
  assertSourceIncludes(mainSource, /function\s+normalizeStatus\s*\(value,\s*fallback\s*=\s*["']已结束["']\)/, "missing meeting status must default to ended, not active");
  assertSourceIncludes(mainSource, /const\s+rememberedStatus\s*=\s*getRememberedMeetingStatus\(id\)/, "meeting normalization must read the locally remembered lifecycle");
  assertSourceIncludes(mainSource, /normalizeStatus\(explicitStatus,\s*rememberedStatus\s*\|\|\s*["']已结束["']\)/, "meeting normalization must use the remembered lifecycle before the safe historical fallback");
  assertSourceIncludes(mainSource, /api\.createMeeting\s*\([\s\S]{0,500}?status:\s*["']进行中["'][\s\S]{0,150}?rememberMeetingStatus\(meeting\.id,\s*meeting\.status\)/, "newly created meetings must remain active in the current account");
  assertSourceIncludes(mainSource, /api\.archiveMeeting\(meeting\.id\)[\s\S]{0,180}?meeting\.status\s*=\s*["']已结束["'][\s\S]{0,120}?rememberMeetingStatus/, "ending a meeting must persist its local lifecycle");
  assertSourceIncludes(mainSource, /api\.deleteMeeting\(meetingId\)[\s\S]{0,250}?forgetMeetingStatus\(meetingId\)/, "deleting a meeting must clear its remembered lifecycle");
});

test("meeting title supports inline rename persisted through the backend", () => {
  assertSourceIncludes(mainSource, /class=["']stage-meeting-title["'][^>]*data-role=["']meeting-title["']/, "the meeting title must expose the inline-edit target");
  assertSourceIncludes(mainSource, /addEventListener\(["']dblclick["'][\s\S]{0,500}?beginMeetingTitleEdit\(\)/, "double-clicking the title must enter edit mode");
  assertSourceIncludes(mainSource, /api\.updateMeeting\(meeting\.id,\s*\{\s*project_name:\s*nextTitle\s*\}\)/, "renaming must use the backend project_name contract");
  assertSourceIncludes(mainSource, /event\.key\s*===\s*["']Enter["'][\s\S]{0,180}?saveMeetingTitle\(\)/, "Enter must save the edited title");
  assertSourceIncludes(mainSource, /event\.key\s*===\s*["']Escape["'][\s\S]{0,180}?cancelMeetingTitleEdit\(\)/, "Escape must cancel the edited title");
  assertSourceIncludes(stylesSource, /\.stage-title-editor\s*\{[\s\S]{0,300}?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+34px\s+34px/, "the title editor must reserve stable space for save and cancel controls");
});

test("only Demo exposes backend version switching", () => {
  const canvasSource = sourceBetween(mainSource, "function renderDeliverableCanvas()", "function renderVpbuddyComposer()");
  assertSourceIncludes(mainSource, /\bapi\.listDemoVersions\s*\(/, "meeting loading must request the backend Demo version manifest");
  assertSourceIncludes(mainSource, /class=["']demo-version-select["']/, "Demo must expose its backend version selector");
  assertSourceIncludes(mainSource, /matches\(["']\.demo-version-select["']\)[\s\S]{0,260}?selectedDemoVersion/, "changing the Demo selector must update the selected Demo version");
  assertSourceIncludes(canvasSource, /getSelectedDemoVersion\(\)\s*\|\|\s*demoVersions\[0\]/, "a pinned Demo version must win over the latest manifest fallback");
  assertSourceIncludes(canvasSource, /selectedDemo\?\.file\s*\|\|\s*["']demo_latest\.html["']/, "the Demo iframe must use the selected manifest file with a latest fallback");
  assertSourceExcludes(mainSource, /class=["']deliverable-version-select["']/, "the five text deliverables must not expose a shared version selector");
  assertSourceExcludes(mainSource, /renderUnifiedDeliverableVersionControl/, "the obsolete six-document unified version control must be removed");
});

test("the five text deliverables use text-only headers", () => {
  const listSource = sourceBetween(mainSource, "function renderDeliverableListPanel()", "function renderMaterialsList()");
  const canvasSource = sourceBetween(mainSource, "function renderDeliverableCanvas()", "function renderVpbuddyComposer()");
  assertSourceIncludes(mainSource, /\["req",\s*"arch",\s*"tasks",\s*"api",\s*"risk"\]\.includes\(deliverableKind\)/, "requirements, architecture, tasks, API, and risk must share the text-only header mode");
  assertSourceIncludes(canvasSource, /isTextOnlyDeliverable\s*\?\s*["']["']\s*:\s*docBadge\(current\.type\)/, "text deliverables must omit their left file-type icon");
  assertSourceIncludes(canvasSource, /isDemoDeliverable\s*\|\|\s*isTextOnlyDeliverable\s*\?\s*["']["']\s*:\s*`<span>\$\{escapeHtml\(displayedVersion\)\}<\/span>`/, "text deliverable headers must omit their static version badge");
  assertSourceExcludes(listSource, /<small>\$\{escapeHtml\(item\.version\)\}<\/small>/, "the deliverable list must not render an unconditional version for all six rows");
  assertSourceIncludes(listSource, /(?:canonicalDeliverableKind\(item\.kind\)|item\.kind)\s*===\s*["']demo["'][\s\S]{0,220}?item\.version/, "only the Demo list row may show version information");
  assertSourceIncludes(stylesSource, /\.deliverable-doc header\.text-only-deliverable-header\s*\{[\s\S]{0,120}?grid-template-columns:\s*minmax\(0,\s*1fr\)/, "the remaining title text must use the full header width");
});

test("deliverables download the current file or all six real backend files as ZIP", () => {
  assertSourceIncludes(mainSource, /const\s+deliverableArchiveSpecs\s*=\s*\[[\s\S]{0,800}?kind:\s*["']req["'][\s\S]{0,800}?kind:\s*["']arch["'][\s\S]{0,800}?kind:\s*["']tasks["'][\s\S]{0,800}?kind:\s*["']api["'][\s\S]{0,800}?kind:\s*["']risk["'][\s\S]{0,800}?kind:\s*["']demo["']/, "the archive must contain exactly the six product deliverables");
  assertSourceIncludes(mainSource, /data-action=["']download-current-deliverable["']/, "the download menu must offer the current file");
  assertSourceIncludes(mainSource, /data-action=["']download-all-deliverables["']/, "the download menu must offer all deliverables");
  assertSourceIncludes(mainSource, /Promise\.all\(deliverableArchiveSpecs\.map[\s\S]{0,1200}?api\.downloadDeliverable/, "ZIP export must fetch all six backend files");
  assertSourceIncludes(mainSource, /createZipBlob\(results\.map/, "the six real backend files must be packed into a ZIP");
  assertSourceIncludes(mainSource, /\.zip[`"']/, "the full deliverable download must use a ZIP filename");
  assertSourceIncludes(stylesSource, /\.deliverable-download-menu\s*\{[\s\S]{0,350}?position:\s*absolute/, "the download choices must open as a top-right dropdown");
});

test("deliverable content renders once and stays above the VPBuddy composer", () => {
  const normalizerStart = mainSource.indexOf("function normalizeDeliverable(raw");
  const normalizerEnd = mainSource.indexOf("function normalizeDeliverablesResponse", normalizerStart);
  const normalizerSource = mainSource.slice(normalizerStart, normalizerEnd);
  assertSourceExcludes(normalizerSource, /desc:[^\n]*raw\.content/, "deliverable body content must not be reused as its header description");
  assertSourceIncludes(mainSource, /const\s+bodyContent\s*=\s*String\(current\.content\s*\|\|\s*["']["']\)\.trim\(\)/, "the renderer must compare header metadata with the body");
  assertSourceIncludes(mainSource, /\.find\(\(value\)\s*=>\s*value\s*&&\s*value\s*!==\s*bodyContent\)/, "a body-identical header description must be skipped");
  assertSourceIncludes(mainSource, /isTextOnlyDeliverable[\s\S]{0,120}?<article class=["']deliverable-content markdown-content["']>\$\{renderMarkdown\(current\.content\)\}<\/article>/, "the five text deliverables must render one structured Markdown body");
  assertSourceIncludes(stylesSource, /\.center-card\s*\{[\s\S]{0,220}?overflow:\s*hidden/, "the center card must contain long deliverable content");
  assertSourceIncludes(stylesSource, /\.deliverable-doc\s*\{[\s\S]{0,260}?display:\s*flex[\s\S]{0,120}?overflow:\s*hidden/, "the deliverable document must establish a contained column layout");
  assertSourceIncludes(stylesSource, /\.deliverable-content\s*\{[\s\S]{0,220}?flex:\s*1\s+1\s+auto[\s\S]{0,180}?overflow-y:\s*auto/, "long multiline content must scroll inside the document instead of covering the composer");
  assertSourceIncludes(stylesSource, /\.markdown-content\s*\{[\s\S]{0,180}?font-size:\s*17px[\s\S]{0,100}?line-height:\s*1\.82/, "Markdown body text must be larger and easier to read");
});

test("meeting workspace opens with records before materials", () => {
  assertSourceIncludes(mainSource, /meetingLeftTab\s*:\s*["']records["']/, "meeting records must be the initial left-panel tab");
  assertSourceIncludes(mainSource, /action\s*===\s*["']open-meeting["'][\s\S]{0,850}?meetingLeftTab\s*=\s*["']records["']/, "re-entering a meeting must reset the left panel to records");
  assertSourceIncludes(mainSource, /data-tab=["']records["'][^>]*>会议记录<\/button>[\s\S]{0,300}?data-tab=["']materials["'][^>]*>会议资料<\/button>/, "meeting records must render before meeting materials");
});

test("recording controls pause locally and persist records through the backend ASR flow", () => {
  const recordsSource = sourceBetween(mainSource, "function renderMeetingRecords()", "function renderUnderstanding()");
  assertSourceIncludes(mainSource, /recording\s*\?\s*["']暂停录制["'][\s\S]{0,120}?paused[\s\S]{0,80}?["']继续录制["']/, "the active recording control must pause and resume instead of finalizing the meeting");
  assertSourceIncludes(mainSource, /action\s*===\s*["']toggle-recording["'][\s\S]{0,260}?pauseRealtimeRecording\(\)[\s\S]{0,220}?resumeRealtimeRecording\(\)[\s\S]{0,180}?startRealtimeRecording\(\)/, "the recording button must implement start, pause, and resume states");
  assertSourceIncludes(mainSource, /async function\s+stopRealtimeRecording[\s\S]{0,900}?realtimeAsrSession\.stop\(\)[\s\S]{0,900}?refreshTranscript\(meetingId,\s*\{\s*notify:\s*false\s*\}\)/, "final stop must send the realtime ASR stop control and then reload persisted transcript segments");
  assertSourceIncludes(mainSource, /async function\s+endCurrentMeeting[\s\S]{0,1000}?stopRealtimeRecording\(\)[\s\S]{0,700}?if\s*\(!finalizedByRealtime\)\s*await\s+api\.archiveMeeting\(meeting\.id\)/, "ending a live meeting must avoid a duplicate close request after WebSocket stop already finalized it");
  assertSourceIncludes(mainSource, /const\s+preserveActiveRecording\s*=\s*nextMeetingId\s*===\s*state\.selectedMeetingId[\s\S]{0,260}?Boolean\(realtimeAsrSession\)/, "returning to the same meeting must detect its active ASR session");
  assertSourceIncludes(mainSource, /if\s*\(!preserveActiveRecording\)\s*resetRecordingState\(\)/, "an active same-meeting ASR session and elapsed time must not be reset");
  assertSourceIncludes(recordsSource, /meetingRecords\.map[\s\S]{0,260}?item\.time[\s\S]{0,180}?item\.text/, "meeting records must display backend time and transcript content");
  assertSourceExcludes(recordsSource, /item\.(?:speaker|role)/, "speaker and role labels must stay hidden from the simplified transcript cards");
  assertSourceIncludes(stylesSource, /\.record-item\s*\{[\s\S]{0,220}?grid-template-columns:\s*58px\s+minmax\(0,\s*1fr\)/, "transcript cards must reserve a compact time column and a flexible text column");
  assertSourceIncludes(stylesSource, /\.recording\.paused\s*\{[\s\S]{0,180}?color:\s*#ffd27d/, "the paused state must be visibly distinct from active recording");
});

test("deliverable view opens with Demo first and selected", () => {
  assertSourceIncludes(mainSource, /function\s+getOrderedDeliverables\s*\([\s\S]{0,500}?\[["']demo["'],\s*["']req["'],\s*["']arch["'],\s*["']tasks["'],\s*["']api["'],\s*["']risk["']\]/, "the deliverable list must use the explicit Demo-first product order");
  assertSourceIncludes(mainSource, /function\s+getDefaultDeliverable\s*\([\s\S]{0,250}?find\(\(item\)\s*=>\s*item\.kind\s*===\s*["']demo["']\)/, "Demo must be the default deliverable");
  assertSourceIncludes(mainSource, /action\s*===\s*["']stage-tab["'][\s\S]{0,300}?stageTab\s*===\s*["']deliverable["'][\s\S]{0,150}?getDefaultDeliverable\(\)/, "opening the deliverable tab must reset selection to Demo");
});

test("meeting summary renders only deliverables with Demo first", () => {
  const summarySource = sourceBetween(mainSource, "function renderSummaryDeliverable", "function renderKnowledge()");
  assertSourceExcludes(summarySource, /会议结论|会议纪要摘要|待办事项|引用材料/, "the four obsolete summary modules must be hidden");
  assertSourceExcludes(summarySource, /(?:icon\(["']share["']\)|>\s*分享\s*<)/, "the summary must not expose sharing");
  assertSourceExcludes(summarySource, /class=["']summary-grid["']/, "the summary body must no longer reserve the four-module grid");
  assertSourceIncludes(summarySource, /const\s+\w*[Dd]eliverables\s*=\s*getOrderedDeliverables\(\)/, "the summary must consume the Demo-first deliverable ordering");
  assertSourceIncludes(summarySource, /data-action=["']download-all-deliverables["'][\s\S]{0,180}?>[\s\S]{0,220}?下载/, "the summary Download action must request the complete six-file archive");
  assertSourceIncludes(summarySource, /class=["'][^"']*delivery-strip[^"']*["']/, "deliverables must be the only summary content section");
  assertSourceIncludes(summarySource, /const\s+isDemo\s*=\s*kind\s*===\s*["']demo["'][\s\S]{0,700}?if\s*\(isDemo\)[\s\S]{0,700}?renderDemoVersionControl\(\)/, "only the Demo summary branch may expose version switching");
  assertSourceExcludes(summarySource, /<label>\s*版本：[\s\S]{0,120}?item\.version/, "text summary cards must not render static versions");
});

test("meeting summary renders backend bodies and a full-width Demo preview", () => {
  const summarySource = sourceBetween(mainSource, "function renderSummaryDeliverable", "function renderKnowledge()");
  assertSourceIncludes(summarySource, /const\s+content\s*=\s*String\(item\.content\s*\|\|\s*["']["']\)\.trim\(\)/, "summary rendering must read each backend deliverable body");
  assertSourceIncludes(summarySource, /class=["']summary-doc-content markdown-content["']>\$\{renderMarkdown\(content\)\}/, "text deliverables must render their backend Markdown body");
  assertSourceIncludes(summarySource, /class=["']summary-demo-preview["'][\s\S]{0,220}?data-stable-demo-frame=["']summary-demo["']/, "the Demo summary must expose an actual stable iframe preview");
  assertSourceIncludes(stylesSource, /\.delivery-strip\s*>\s*\.summary-deliverable-list\s*\{[\s\S]{0,180}?grid-template-columns:\s*minmax\(0,\s*1fr\)/, "summary deliverables must use a readable single-column flow instead of five compressed columns");
  assertSourceIncludes(stylesSource, /\.summary-demo-preview\s*\{[\s\S]{0,240}?min-height:\s*480px/, "the top Demo preview must receive useful viewport height");
});

test("summary loading uses isolated responsive skeleton cards", () => {
  const loadingSource = sourceBetween(mainSource, "function renderSummaryLoading", "function renderSummaryDeliverable");
  assertSourceIncludes(loadingSource, /class=["']panel summary-detail-loading["']/, "summary loading must not inherit the deliverable card grid");
  assertSourceIncludes(loadingSource, /class=["']summary-loading-grid["']/, "summary loading must use a dedicated skeleton grid");
  assertSourceExcludes(loadingSource, /<article[^>]*summary-loading-panel/, "loading status must not be styled as the first Demo article");
  assertSourceIncludes(stylesSource, /\.summary-loading-grid\s*\{[\s\S]{0,160}?repeat\(3,\s*minmax\(0,\s*1fr\)\)/, "desktop loading cards must stay in stable columns");
  assertSourceIncludes(stylesSource, /@media\s*\(max-width:\s*980px\)[\s\S]*?\.summary-loading-grid\s*\{[\s\S]{0,100}?grid-template-columns:\s*minmax\(0,\s*1fr\)/, "narrow summary loading must collapse to one column");
});

test("text deliverable details omit redundant metadata headers when a body exists", () => {
  const canvasSource = sourceBetween(mainSource, "function renderDeliverableCanvas()", "function renderVpbuddyComposer()");
  assertSourceIncludes(canvasSource, /const\s+hasTextBody\s*=\s*isTextOnlyDeliverable\s*&&\s*Boolean\(bodyContent\)/, "text deliverables must detect a real backend body");
  assertSourceIncludes(canvasSource, /\$\{hasTextBody\s*\?\s*["']["']\s*:\s*`[\s\S]{0,300}?<header/, "a real body must suppress the redundant fixed document header");
  assertSourceIncludes(canvasSource, /isTextOnlyDeliverable[\s\S]{0,180}?<article class=["']deliverable-content markdown-content["']>\$\{renderMarkdown\(current\.content\)\}/, "the backend Markdown body must remain visible after suppressing the header");
});

test("Demo iframe is reused for unrelated renders and replaced only when src changes", () => {
  assertSourceIncludes(mainSource, /function\s+updateAppMarkup[\s\S]{0,900}?iframe\[data-stable-demo-frame\]/, "the app renderer must detect stable Demo frames");
  assertSourceIncludes(mainSource, /current\.getAttribute\(["']src["']\)\s*===\s*next\.getAttribute\(["']src["']\)/, "a Demo frame may be reused only when its src is unchanged");
  assertSourceIncludes(mainSource, /canPreserveFrame[\s\S]{0,180}?patchDomChildren\(app,\s*template\.content\)/, "unrelated state updates must patch the existing DOM instead of rebuilding the iframe");
  assertSourceIncludes(mainSource, /data-stable-demo-frame=["']meeting-demo["']/, "the meeting Demo iframe must opt into stable reuse");
});

test("long account names stay inside the sidebar card", () => {
  assertSourceIncludes(mainSource, /class=["']user-card-copy["'][\s\S]{0,150}?<strong\s+title=/, "the account name must expose its full value as a tooltip");
  assertSourceIncludes(stylesSource, /\.user-card\s*\{[\s\S]{0,350}?grid-template-columns:\s*50px\s+minmax\(0,\s*1fr\)\s+20px/, "the account name grid column must be allowed to shrink");
  assertSourceIncludes(stylesSource, /\.user-card-copy\s*\{[\s\S]{0,150}?min-width:\s*0[\s\S]{0,150}?overflow:\s*hidden/, "the account text wrapper must contain long names");
  assertSourceIncludes(stylesSource, /\.user-card strong\s*\{[\s\S]{0,250}?text-overflow:\s*ellipsis[\s\S]{0,150}?white-space:\s*nowrap/, "long account names must render as a single-line ellipsis");
});

test("the personal account menu downloads a redacted client log", () => {
  assertSourceIncludes(mainSource, /class=["']user-card["'][^>]*data-action=["']toggle-account-menu["']/, "the account card must open a menu instead of logging out immediately");
  assertSourceIncludes(mainSource, /data-action=["']download-log["'][\s\S]{0,120}?>[\s\S]{0,120}?下载 Log/, "the account menu must expose the log download action");
  assertSourceIncludes(mainSource, /function\s+downloadClientLog\s*\([\s\S]{0,1800}?new\s+Blob[\s\S]{0,500}?\.download\s*=\s*`VPBuddy-client-\$\{stamp\}\.log`/, "the log action must produce a local .log file");
  assertSourceIncludes(mainSource, /authorization\|password\|token\|api\[_-\]\?key\|secret[\s\S]{0,120}?\[REDACTED\]/i, "sensitive diagnostic fields must be redacted");
  assertSourceIncludes(stylesSource, /\.account-menu\s*\{[\s\S]{0,250}?position:\s*absolute[\s\S]{0,250}?bottom:\s*calc\(100%\s*\+\s*10px\)/, "the account menu must open above the sidebar account card");
});

test("AI follow-up content sits directly below the AI collaboration heading", () => {
  const aiPanelSource = sourceBetween(mainSource, "function renderAIPanel()", "function renderTimeline()");
  assertSourceIncludes(mainSource, /class=["']ai-panel-head["'][\s\S]{0,180}?<h2>AI 协同<\/h2>[\s\S]{0,180}?data-action=["']refresh-collab["']/, "AI collaboration must own the refresh action in its heading");
  assertSourceIncludes(mainSource, /<\/header>\s*<div class=["']followup-list["']>/, "AI follow-up content must render directly below the AI collaboration heading");
  assertSourceIncludes(mainSource, /followups\.map\(\(item\)\s*=>/, "the AI collaboration stream must render every follow-up");
  assertSourceExcludes(mainSource, /followups\.slice\(/, "the AI collaboration stream must not truncate the follow-up list");
  assertSourceExcludes(mainSource, /查看全部 AI 反问|all-followups/, "the redundant all-follow-ups action and modal must be removed");
  assertSourceExcludes(mainSource, /class=["']ai-box["']/, "AI follow-ups must not be wrapped in a separately named module card");
  assertSourceExcludes(mainSource, /<strong>AI反问<\/strong>/, "the redundant AI follow-up module title must be removed");
  assertSourceIncludes(stylesSource, /\.ai-panel\s*\{[\s\S]{0,180}?grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)[\s\S]{0,120}?overflow:\s*hidden/, "the AI panel heading must stay fixed above its stream");
  assertSourceIncludes(stylesSource, /\.followup-list\s*\{[\s\S]{0,160}?grid-auto-rows:\s*max-content[\s\S]{0,240}?overflow-y:\s*auto/, "the full follow-up stream must keep content-sized cards and scroll vertically inside the panel");
  assertSourceIncludes(stylesSource, /\.followup-row\s*\{[\s\S]{0,120}?min-height:\s*max-content/, "follow-up cards must not be compressed below their content height");
  assertSourceIncludes(stylesSource, /\.followup-row strong\s*\{[\s\S]{0,160}?display:\s*block/, "follow-up cards must grow with their question text");
  assertSourceIncludes(aiPanelSource, /实时展示 Agent 协调内容[\s\S]{0,120}?自主提出会议问题/, "the empty AI stream must use a concise title and a distinct supporting line");
  assertSourceExcludes(aiPanelSource, /自主提出会议问题[\s\S]{0,120}?自主提出会议问题/, "the AI empty state must not repeat the same message");
  assertSourceExcludes(aiPanelSource, /暂无\s*AI\s*反问|当前会议的后端协同问答列表中没有待回答问题/, "the obsolete no-follow-up copy must be removed");
});

test("AI collaboration cards and details safely render Markdown without reasoning tags", () => {
  const aiPanelSource = sourceBetween(mainSource, "function renderAIPanel()", "function renderTimeline()");
  const modalSource = sourceBetween(mainSource, 'if (state.modal === "followup-detail")', 'if (state.modal === "all-explanations")');
  assertSourceIncludes(mainSource, /function\s+normalizeCollabQuestions[\s\S]{0,700}?stripAssistantReasoning\(item\.question/, "collaboration DTOs must remove model reasoning before display");
  assertSourceIncludes(aiPanelSource, /renderMarkdown\(stripAssistantReasoning\(item\.question\)\)/, "AI collaboration cards must use the safe Markdown renderer");
  assertSourceIncludes(aiPanelSource, /class=["']followup-markdown markdown-content["']/, "AI collaboration cards must expose structured Markdown styling");
  assertSourceIncludes(modalSource, /<h2>内容详情<\/h2>/, "the follow-up modal must use the neutral content-detail title");
  assertSourceIncludes(modalSource, /renderMarkdown\(stripAssistantReasoning\(selectedFollowup\?\.question\)\)/, "the modal body must use the safe Markdown renderer");
  assertSourceIncludes(modalSource, /renderMarkdown\(stripAssistantReasoning\(selectedFollowup\?\.reason\)\)/, "the modal reason must use the safe Markdown renderer");
  assertSourceIncludes(stylesSource, /\.followup-detail-modal\s*\{[\s\S]{0,180}?overflow-x:\s*hidden[\s\S]{0,100}?overscroll-behavior:\s*contain/, "the detail modal must scroll vertically without a horizontal scrollbar");
  assertSourceIncludes(stylesSource, /\.followup-detail-modal \.modal-markdown\s*\{[\s\S]{0,220}?font-size:\s*17px[\s\S]{0,100}?overflow-wrap:\s*anywhere/, "modal Markdown must be larger and break long paths safely");
});

test("Demo version controls show only compact canonical labels", () => {
  const versionSource = sourceBetween(mainSource, "function renderDemoVersionControl()", "function renderDeliverableDownloadMenu");
  assertSourceIncludes(versionSource, /<option value=[\s\S]{0,180}?\$\{escapeHtml\(item\.label\)\}<\/option>/, "Demo options must show the canonical V-number label");
  assertSourceExcludes(versionSource, /item\.summary/, "long Demo summaries must not enter the compact selector");
  assertSourceIncludes(stylesSource, /\.deliverable-version-control\s*\{[\s\S]{0,220}?width:\s*178px[\s\S]{0,180}?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+58px/, "the version control must reserve stable label and selector columns");
  assertSourceIncludes(stylesSource, /\.deliverable-version-control select\s*\{[\s\S]{0,160}?width:\s*58px[\s\S]{0,100}?max-width:\s*58px/, "the V-number selector must not expand into adjacent actions");
});

test("deliverable rows stay inside the sidebar at narrow widths", () => {
  assertSourceIncludes(mainSource, /class=["']deliverable-row \$\{canonicalDeliverableKind\(item\.kind\) === ["']demo["'] \? ["']is-demo["']/, "Demo rows must opt into their three-column layout explicitly");
  assertSourceIncludes(stylesSource, /\.deliverable-stack\s*\{[\s\S]{0,140}?width:\s*100%[\s\S]{0,100}?max-width:\s*100%/, "the deliverable stack must stay within the sidebar width");
  assertSourceIncludes(stylesSource, /\.deliverable-row\s*\{[\s\S]{0,220}?box-sizing:\s*border-box[\s\S]{0,160}?max-width:\s*100%[\s\S]{0,220}?grid-template-columns:\s*42px\s+minmax\(0,\s*1fr\)/, "deliverable rows must use contained flexible columns");
  assertSourceIncludes(stylesSource, /\.deliverable-row\s*>\s*span\s*\{[\s\S]{0,140}?min-width:\s*0[\s\S]{0,120}?overflow:\s*hidden/, "long titles and timestamps must shrink within the text column");
  assertSourceIncludes(stylesSource, /@media\s*\(max-width:\s*980px\)[\s\S]*?\.deliverable-row,[\s\S]{0,100}?\.deliverable-row\.is-demo\s*\{[\s\S]{0,120}?padding-inline:\s*10px/, "narrow layouts must retain internal padding without widening the active border");
});

test("sending VPBuddy materials exposes progress in the composer", () => {
  const composerSource = sourceBetween(mainSource, "function renderVpbuddyComposer()", "function renderAIPanel()");
  assertSourceIncludes(mainSource, /renderUploadProgress\(["']vpbuddy-material["']\)/, "the VPBuddy composer must render attachment progress");
  assertSourceIncludes(mainSource, /data-action=["']send-vpbuddy-material["'][^>]*\$\{materialSending\s*\?\s*["']disabled["']/, "the material button must disable while sending");
  assertSourceIncludes(mainSource, /const\s+progressContext\s*=\s*context\s*;/, "chat attachment progress must keep its own context instead of rendering in meeting materials");
  assertSourceIncludes(mainSource, /const\s+meetingId\s*=\s*state\.selectedMeetingId[\s\S]{0,1800}?api\.uploadMaterial\(meetingId,\s*file\)/, "material sending must persist through the canonical meeting material API pinned to its meeting");
  assertSourceIncludes(mainSource, /context\s*===\s*["']vpbuddy-material["']\s*&&\s*succeeded[\s\S]{0,500}?api\.listMaterials\(meetingId\)[\s\S]{0,180}?api\.listChatHistory\(meetingId\)/, "a successful send must refresh both meeting materials and VPBuddy history for the pinned meeting");
  assertSourceIncludes(mainSource, /state\.meetingLeftTab\s*=\s*["']materials["'][\s\S]{0,200}?state\.showComposerHistory\s*=\s*true/, "a successful send must reveal the material list and upload conversation record");
  assertSourceExcludes(mainSource, /context\s*===\s*["']vpbuddy-material["'][\s\S]{0,500}?api\.sendChatAttachment\s*\(/, "material sending must not upload the same file through a second chat endpoint");
  assertSourceIncludes(mainSource, /messageSource\s*===\s*["']material-upload["']\s*\?\s*["']material["']/, "backend material-upload history must render as an upload record");
  assertSourceIncludes(stylesSource, /\.composer-history article\.material\s*\{[\s\S]{0,220}?align-self:\s*flex-end[\s\S]{0,220}?(?:border-color|background):/, "upload records must remain visually distinguishable as outgoing conversation bubbles");
  assertSourceIncludes(stylesSource, /\.composer-history\s*\{[\s\S]{0,260}?display:\s*flex\s*!important[\s\S]{0,100}?flex-direction:\s*column/, "conversation history must use a vertical non-stretching message flow");
  assertSourceIncludes(stylesSource, /\.composer-history article\s*\{[\s\S]{0,260}?flex:\s*0\s+0\s+auto/, "short conversation entries must keep their content height");
  assertSourceIncludes(stylesSource, /\.upload-progress\.indeterminate[\s\S]{0,180}?animation:\s*upload-progress-sweep/, "an in-flight material request must show animated progress");
  assertSourceIncludes(mainSource, /isSending\s*\?\s*["']vpbuddy-send-progress["']/, "material sending must receive a dedicated prominent presentation");
  assertSourceIncludes(stylesSource, /\.vpbuddy-send-progress\s*\{[\s\S]{0,180}?min-height:\s*86px[\s\S]{0,300}?border:/, "material progress must render as a prominent status band");
  assertSourceIncludes(stylesSource, /\.vpbuddy-send-progress \.upload-progress-track\s*\{[\s\S]{0,160}?height:\s*9px/, "material progress track must remain clearly visible");
  assert.ok(composerSource.indexOf('<div class="composer-row">') < composerSource.indexOf('renderUploadProgress("vpbuddy-material")'), "upload progress must follow the input row in normal document flow");
  const sendProgressRule = cssRule(".vpbuddy-send-progress");
  assertSourceExcludes(sendProgressRule, /position:\s*(?:absolute|fixed)|transform:\s*translate|margin-(?:top|bottom):\s*-/, "material progress must not overlay the input with absolute positioning or negative offsets");
  assertSourceIncludes(stylesSource, /\.center-send-box\.has-material-progress(?:\:not\(\.is-expanded\))?\s*\{[\s\S]{0,180}?(?:height:\s*auto|min-height:\s*(?:3[2-9]\d|[4-9]\d\d)px)/, "the collapsed composer must grow enough to contain upload progress below the input");
});

test("stage screenshots are persisted as meeting materials", () => {
  const captureStart = mainSource.indexOf("async function captureStageScreenshot()");
  const captureEnd = mainSource.indexOf('document.addEventListener("click"', captureStart);
  const captureSource = mainSource.slice(captureStart, captureEnd);
  assert.notEqual(captureStart, -1, "the stage screenshot handler must exist");
  assertSourceIncludes(captureSource, /const\s+meetingId\s*=\s*state\.selectedMeetingId[\s\S]{0,1800}?api\.uploadMaterial\(meetingId,\s*file\)/, "the screenshot PNG must use the meeting material upload API pinned to its meeting");
  assertSourceIncludes(captureSource, /api\.listMaterials\(meetingId\)/, "the pinned meeting material list must refresh after screenshot upload");
  assertSourceIncludes(captureSource, /context:\s*["']material["'][\s\S]{0,120}?status:\s*["']uploading["']/, "screenshot upload must expose truthful material progress");
  assertSourceExcludes(captureSource, /api\.sendChatAttachment\s*\(/, "a screenshot must not be sent only as a chat attachment");
});

test("octet-stream material downloads infer preview MIME from trusted file metadata", () => {
  const normalizerSource = sourceBetween(mainSource, "function normalizeMaterial(raw", "function normalizeMaterialsResponse");
  const previewSource = sourceBetween(mainSource, "async function loadMaterialPreview", "async function presentMaterial");
  assertSourceIncludes(normalizerSource, /content(?:Type|_type):\s*raw\.(?:content_type|contentType)/, "material normalization must retain the backend content_type");
  assertSourceIncludes(mainSource, /(?:png:\s*["']image\/png["'][\s\S]{0,500}?pdf:\s*["']application\/pdf["']|pdf:\s*["']application\/pdf["'][\s\S]{0,500}?png:\s*["']image\/png["'])/, "preview MIME resolution must map trusted image and PDF extensions");
  assertSourceIncludes(mainSource, /const\s+extension\s*=[\s\S]{0,260}?materialPreviewMimeByExtension\[extension\]/, "an unrecognized response MIME such as octet-stream must fall back to the file extension");
  assertSourceIncludes(previewSource, /material\.(?:name|type|contentType|content_type)[\s\S]{0,700}?(?:resolvedMime|previewMime|presentationMime)/, "preview type resolution must use normalized material metadata or its extension");
  assertSourceIncludes(previewSource, /download\.blob\.(?:slice|stream)\([\s\S]{0,180}?(?:resolvedMime|previewMime|presentationMime)|new\s+Blob\([\s\S]{0,220}?(?:resolvedMime|previewMime|presentationMime)/, "an octet-stream Blob must be retyped before creating its preview URL");
  assertSourceIncludes(previewSource, /URL\.createObjectURL\(/, "supported images and PDFs must still use an object URL for local preview");
});

test("meeting material selection clears when the user clicks elsewhere", () => {
  assertSourceExcludes(mainSource, /if\s*\(materials\.length\s*&&\s*!state\.selectedMaterial\)\s*state\.selectedMaterial\s*=\s*materials\[0\]\.id/, "detail refresh must not silently reselect the first material");
  assertSourceIncludes(mainSource, /action\s*===\s*["']select-material["'][\s\S]{0,160}?state\.selectedMaterial\s*=\s*target\.dataset\.id/, "clicking a material row must select it");
  assertSourceIncludes(mainSource, /(?:event\.target|target)\.closest\(["']\.material-row(?:\[data-id\])?["']\)[\s\S]{0,260}?state\.selectedMaterial\s*=\s*["']["']/, "clicking outside the material list must clear the visual selection");
});

test("knowledge uploads render a prominent truthful progress panel", () => {
  assertSourceIncludes(mainSource, /isKnowledge\s*=\s*context\s*===\s*["']knowledge["']/, "knowledge uploads must receive a dedicated progress presentation");
  assertSourceIncludes(mainSource, /isSending\s*\?\s*["']正在发送材料["']\s*:\s*["']正在上传知识文档["']/, "knowledge progress must identify the active upload clearly");
  assertSourceIncludes(mainSource, /progress\.status\s*===\s*["']uploading["']\s*\?\s*`\$\{isSending\s*\?\s*["']正在发送["']\s*:\s*["']正在处理["']\}第/, "in-flight uploads must describe item progress without inventing byte percentages");
  assertSourceIncludes(stylesSource, /\.knowledge-upload-progress\s*\{[\s\S]{0,260}?min-height:\s*94px[\s\S]{0,260}?border:/, "knowledge progress must render as a prominent status band");
  assertSourceIncludes(stylesSource, /\.knowledge-upload-progress \.upload-progress-track\s*\{[\s\S]{0,160}?height:\s*10px/, "the knowledge progress track must be clearly visible");
});

test("knowledge documents expose confirmed backend deletion", () => {
  assertSourceIncludes(mainSource, /class=["']kb-delete-button["'][^>]*data-action=["']delete-knowledge["'][^>]*data-id=/, "each knowledge row must expose a delete action");
  assertSourceIncludes(mainSource, /const\s+response\s*=\s*await\s+api\.deleteKnowledgeDocument\(doc\.id\)/, "knowledge deletion must await the backend DELETE response");
  assertSourceIncludes(mainSource, /Number\(response\.status\)\s*!==\s*200/, "the UI must reject a non-success backend deletion status");
  assertSourceIncludes(mainSource, /response\?\.doc_id[\s\S]{0,180}?String\(response\.doc_id\)\s*!==\s*String\(doc\.id\)/, "the returned backend document id must match the requested document");
  assertSourceIncludes(mainSource, /knowledgeDocs\.splice\(index,\s*1\)/, "the local row may be removed only after backend confirmation");
  assertSourceIncludes(stylesSource, /\.kb-delete-button\s*\{[\s\S]{0,120}?width:\s*34px/, "the delete control must remain compact");
  assertSourceIncludes(stylesSource, /\.kb-delete-button\s*\{[\s\S]{0,520}?color:\s*#ff8b9a/, "the delete control must remain visibly destructive");
});

test("the VPBuddy composer always shows role-aware conversation history and a stable input row", () => {
  const composerSource = sourceBetween(mainSource, "function renderVpbuddyComposer()", "function renderAIPanel()");
  assertSourceIncludes(mainSource, /center-send-box panel \$\{state\.showComposerHistory\s*\?\s*["']is-expanded["']\s*:\s*["']is-collapsed["']\}/, "the composer must expose explicit collapsed and expanded layout states");
  assertSourceIncludes(composerSource, /<div class=["']composer-history["'][^>]*>/, "conversation history must remain in the DOM in both layout states");
  assertSourceExcludes(composerSource, /\$\{state\.showComposerHistory\s*\?\s*`[\s\S]{0,160}?composer-history/, "collapsed mode must not remove conversation history");
  assertSourceIncludes(composerSource, /class=["']message-meta["'][\s\S]{0,100}?<strong>\$\{(?:item\.sender|sender|senderLabel|messageSender)\}<\/strong>/, "each conversation entry must render a sender label");
  assertSourceIncludes(composerSource, /(?:item\.type|type)\s*===\s*["']answer["'][\s\S]{0,260}?renderMarkdown\((?:item\.text|text)\)/, "assistant responses must render backend Markdown as one structured message");
  assertSourceIncludes(composerSource, /(?:VPBuddy|系统)[\s\S]{0,240}?(?:我|用户)|(?:我|用户)[\s\S]{0,240}?(?:VPBuddy|系统)/, "conversation sender mapping must distinguish the user from VPBuddy");
  assertSourceIncludes(stylesSource, /\.center-send-box\s*\{[\s\S]{0,220}?height:\s*236px[\s\S]{0,120}?min-height:\s*236px/, "the collapsed composer must retain its current overall footprint");
  assertSourceIncludes(stylesSource, /\.center-send-box\.is-expanded\s*\{[\s\S]{0,180}?height:\s*50vh/, "the expanded composer must rise to half the viewport");
  assertSourceIncludes(stylesSource, /\.center-send-box \.composer-row\s*\{[\s\S]{0,220}?min-height:\s*76px[\s\S]{0,180}?flex:\s*0\s+0\s+76px/, "collapsed and expanded modes must share the same fixed input-row height");
  assertSourceIncludes(stylesSource, /\.center-send-box textarea\s*\{[\s\S]{0,160}?height:\s*76px[\s\S]{0,120}?min-height:\s*76px/, "the textarea must not grow when history is collapsed");
  assertSourceIncludes(stylesSource, /\.composer-history\s*\{[\s\S]{0,180}?flex:\s*1\s+1\s+auto[\s\S]{0,260}?overflow-y:\s*auto/, "collapsed history must consume the space above the fixed input and scroll through recent messages");
  assertSourceIncludes(stylesSource, /\.composer-history article\.question\s*\{[\s\S]{0,180}?align-self:\s*flex-end/, "user questions must align as outgoing chat bubbles");
  assertSourceIncludes(stylesSource, /\.composer-history article\.answer\s*\{[\s\S]{0,180}?align-self:\s*flex-start/, "VPBuddy answers must align as incoming chat bubbles");
});

test("Demo preview exposes fullscreen from its top-right actions", () => {
  assertSourceIncludes(mainSource, /demoPreviewUrl\s*\?\s*`<button[^>]*class=["']ghost small demo-fullscreen-button["'][^>]*data-action=["']toggle-fullscreen["']/, "a ready Demo must render the fullscreen action");
  assertSourceIncludes(mainSource, /\btarget\.requestFullscreen\(\)/, "the Demo fullscreen action must use the browser fullscreen API");
  assertSourceIncludes(mainSource, /stageFullscreen\s*=\s*true[\s\S]{0,180}?stage-fullscreen-active/, "fullscreen must fall back to a viewport overlay when the native API is unavailable");
  assertSourceIncludes(stylesSource, /\.center-card\.is-fullscreen\s*\{[\s\S]{0,250}?position:\s*fixed[\s\S]{0,250}?width:\s*100vw[\s\S]{0,150}?height:\s*100vh/, "the fallback Demo fullscreen view must cover the viewport");
  assertSourceIncludes(stylesSource, /\.center-card\.is-fullscreen \.demo-deliverable-doc\s*\{[\s\S]{0,150}?flex:\s*1\s+1\s+auto/, "the Demo preview must fill the fullscreen center card");
});

test("meeting details render a stable loading layout and retain same-meeting cache", () => {
  assertSourceIncludes(mainSource, /meetingDetailLoading:\s*false/, "meeting detail loading state must be explicit");
  assertSourceIncludes(mainSource, /action\s*===\s*["']open-meeting["'][\s\S]{0,1100}?meetingDetailLoading\s*=\s*state\.loadedMeetingDetailId\s*!==\s*state\.selectedMeetingId[\s\S]{0,120}?render\(\)/, "meeting navigation must render loading state before awaiting APIs");
  assertSourceIncludes(mainSource, /function\s+renderMeetingLoadingColumns[\s\S]{0,1800}?正在加载会议内容/, "the meeting workspace must render structural loading columns instead of an empty page");
  assertSourceIncludes(mainSource, /meetingDetailLoading\s*\?\s*renderMeetingLoadingColumns\(\)/, "the stage must select the loading columns while details are pending");
  assertSourceIncludes(mainSource, /function\s+renderSummaryLoading[\s\S]{0,1800}?正在加载交付物/, "ended-meeting summaries must retain a stable deliverable loading view");
  assertSourceIncludes(mainSource, /const\s+hasCachedDetail\s*=\s*state\.loadedMeetingDetailId\s*===\s*meetingId[\s\S]{0,120}?meetingDetailLoading\s*=\s*!hasCachedDetail/, "re-entering the same meeting must keep cached detail visible while refreshing");
  assertSourceIncludes(mainSource, /loadSequence\s*!==\s*meetingDetailLoadSequence/, "late detail responses must be ignored after navigation");
  assertSourceIncludes(stylesSource, /@keyframes\s+meeting-loading-pulse/, "the structural loading state must have visible progress feedback");
});
