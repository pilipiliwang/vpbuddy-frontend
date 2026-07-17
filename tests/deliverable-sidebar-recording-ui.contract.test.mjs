import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const repoRoot = process.env.VPBUDDY_FRONTEND_ROOT
  ? path.resolve(process.env.VPBUDDY_FRONTEND_ROOT)
  : fileURLToPath(new URL("../", import.meta.url));
const mainSource = await readFile(path.join(repoRoot, "src", "main.js"), "utf8");
const stylesSource = await readFile(path.join(repoRoot, "src", "styles.css"), "utf8");

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

test("deliverable view owns a records/list sidebar without changing presentation tabs", () => {
  const leftPanelSource = sourceBetween(mainSource, "function renderMeetingLeftPanel()", "function isUploadInProgress()");
  const deliverablePanelSource = sourceBetween(mainSource, "function renderDeliverableListPanel()", "function renderMaterialsList()");

  assert.match(mainSource, /deliverableLeftTab:\s*["']deliverables["']/, "deliverables must be the default sidebar content");
  assert.match(leftPanelSource, /stageTab\s*===\s*["']deliverable["']\)\s*return\s+renderDeliverableListPanel\(\)/);
  assert.match(
    deliverablePanelSource,
    /data-action=["']deliverable-left-tab["'][^>]*data-tab=["']records["'][^>]*>会议记录<\/button>[\s\S]{0,320}?data-action=["']deliverable-left-tab["'][^>]*data-tab=["']deliverables["'][^>]*>交付物列表<\/button>/,
    "deliverable sidebar tabs must put records before the deliverable list"
  );
  assert.match(deliverablePanelSource, /tab\s*===\s*["']records["']\s*\?\s*renderMeetingRecords\(\)\s*:\s*renderDeliverableList\(\)/);
  assert.match(
    leftPanelSource,
    /data-action=["']left-tab["'][^>]*data-tab=["']records["'][^>]*>会议记录<\/button>[\s\S]{0,320}?data-action=["']left-tab["'][^>]*data-tab=["']materials["'][^>]*>会议资料<\/button>/,
    "presentation must retain its records/materials sidebar"
  );
});

test("sidebar switching preserves transcript data and refreshes whichever records tab is visible", () => {
  const visibilitySource = sourceBetween(mainSource, "function areMeetingRecordsVisible()", "function appendRealtimeTranscript");
  const appendSource = sourceBetween(mainSource, "function appendRealtimeTranscript", "async function startRealtimeRecording");
  const clickSource = sourceBetween(mainSource, 'document.addEventListener("click"', 'document.addEventListener("dblclick"');
  const sidebarSwitchSource = sourceBetween(clickSource, 'if (action === "stage-tab")', 'if (action === "knowledge-select")');

  assert.match(visibilitySource, /stageTab\s*===\s*["']deliverable["'][\s\S]{0,120}?deliverableLeftTab\s*===\s*["']records["'][\s\S]{0,120}?meetingLeftTab\s*===\s*["']records["']/);
  assert.match(appendSource, /cacheTranscriptRecords\([\s\S]{0,160}?areMeetingRecordsVisible\(\)\)\s*render\(\)/);
  assert.match(sidebarSwitchSource, /stageTab\s*===\s*["']deliverable["'][\s\S]{0,120}?deliverableLeftTab\s*=\s*["']deliverables["']/);
  assert.match(sidebarSwitchSource, /action\s*===\s*["']left-tab["'][^\n]*meetingLeftTab\s*=\s*target\.dataset\.tab/);
  assert.match(sidebarSwitchSource, /action\s*===\s*["']deliverable-left-tab["'][\s\S]{0,180}?deliverableLeftTab\s*=\s*target\.dataset\.tab\s*===\s*["']records["']/);
  assert.doesNotMatch(sidebarSwitchSource, /meetingRecords\s*=|replaceArray\(meetingRecords|resetRecordingState\(|cacheTranscriptRecords\(/, "tab changes must never reset or replace transcript state");
});

test("recording control stays in place and exposes stable, distinct interaction states", () => {
  const stageSource = sourceBetween(mainSource, "function renderMeetingStage()", "function renderMeetingLeftPanel()");
  const recordingRule = cssRule(".recording");

  assert.match(stageSource, /data-action=["']toggle-recording["'][\s\S]{0,500}?aria-pressed=["']\$\{recording\}["'][\s\S]{0,220}?aria-busy=["']\$\{recordingBusy\}["']/);
  assert.match(stageSource, /<i aria-hidden=["']true["']><\/i><span class=["']recording-label["']>\$\{recordingControlLabel\}<\/span><\/button>\s*<span class=["']timer["']/);
  assert.match(stageSource, /recording\s*\?\s*["']暂停录制["'][\s\S]{0,120}?paused[\s\S]{0,100}?["']继续录制["'][\s\S]{0,120}?["']开始录制["']/);

  assert.match(recordingRule, /height:\s*36px/);
  assert.match(recordingRule, /padding:\s*0\s+14px/);
  assert.match(recordingRule, /transition:[^;]*(?:background-color|border-color)[^;]*box-shadow/);
  assert.match(cssRule(".recording-label"), /width:\s*4em/, "state labels must reserve a stable width");
  assert.match(cssRule(".recording:hover:not(:disabled)"), /border-color:[^;]+;[\s\S]*background:/);
  assert.match(cssRule(".recording:focus-visible"), /box-shadow:/);
  assert.match(cssRule(".recording:disabled"), /cursor:\s*not-allowed[\s\S]*opacity:/);
  assert.match(cssRule(".recording.active"), /background:[\s\S]*color:/);
  assert.match(cssRule(".recording.paused"), /background:[\s\S]*color:\s*#ffd27d/);
  assert.match(cssRule(".recording.active i"), /animation:\s*recording-status-pulse/);
  assert.match(cssRule(".recording.paused i"), /linear-gradient\(90deg/);
  assert.match(stylesSource, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]{0,500}?\.recording\.active i[\s\S]{0,400}?animation:\s*none/);
});
