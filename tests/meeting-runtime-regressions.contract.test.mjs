import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const repoRoot = process.env.VPBUDDY_FRONTEND_ROOT
  ? path.resolve(process.env.VPBUDDY_FRONTEND_ROOT)
  : fileURLToPath(new URL("../", import.meta.url));
const mainSource = await readFile(path.join(repoRoot, "src", "main.js"), "utf8");

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

function namedFunction(name) {
  const startPattern = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`, "m");
  const startMatch = startPattern.exec(mainSource);
  assert.ok(startMatch, `missing function: ${name}`);
  const start = startMatch.index;
  const nextPattern = /\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g;
  nextPattern.lastIndex = start + startMatch[0].length;
  const nextMatch = nextPattern.exec(mainSource);
  return mainSource.slice(start, nextMatch?.index ?? mainSource.length);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

test("VPBuddy material upload is pinned to one meeting and invalidates stale detail snapshots", () => {
  const changeHandler = sourceBetween(
    mainSource,
    'document.addEventListener("change"',
    'document.addEventListener("keydown"'
  );
  const uploadStart = changeHandler.indexOf('if (!event.target.matches(".native-file-input")) return;');
  assert.notEqual(uploadStart, -1, "file upload handler must retain its native input boundary");
  const uploadSource = changeHandler.slice(uploadStart);

  const meetingCapture = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*state\.selectedMeetingId\s*;/.exec(uploadSource);
  assert.ok(meetingCapture, "file upload must capture selectedMeetingId before its first asynchronous request");
  const firstUploadAwait = uploadSource.indexOf("await api.uploadMaterial");
  assert.ok(meetingCapture.index < firstUploadAwait, "the meeting id must be pinned before material upload starts");
  const meetingIdName = escapeRegExp(meetingCapture[1]);
  assert.match(
    uploadSource,
    new RegExp(`api\\.uploadMaterial\\(\\s*${meetingIdName}\\s*,\\s*file\\s*\\)`),
    "VPBuddy material POST must use the captured meeting id"
  );
  assert.doesNotMatch(
    uploadSource,
    /api\.uploadMaterial\(\s*state\.selectedMeetingId\s*,/,
    "an in-flight material upload must never retarget itself to the currently selected meeting"
  );

  const revisionDeclaration = /\blet\s+([A-Za-z_$][\w$]*(?:material|materials)[\w$]*(?:revision|sequence|epoch|generation)|[A-Za-z_$][\w$]*(?:revision|sequence|epoch|generation)[\w$]*(?:material|materials)[\w$]*)\s*=\s*\d+\s*;/i.exec(mainSource);
  assert.ok(revisionDeclaration, "material state needs a monotonic revision/sequence guard");
  const revisionName = escapeRegExp(revisionDeclaration[1]);
  const revisionAdvance = new RegExp(`${revisionName}\\s*(?:\\+\\+|\\+=\\s*1|=\\s*${revisionName}\\s*\\+\\s*1)`).exec(uploadSource);
  assert.ok(revisionAdvance, "a successful material POST must advance the material revision");
  assert.ok(revisionAdvance.index > firstUploadAwait, "the material revision must advance only after the POST succeeds");

  const loadDetail = namedFunction("loadMeetingDetailFromBackend");
  const revisionCapture = new RegExp(`\\bconst\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${revisionName}\\s*;`).exec(loadDetail);
  assert.ok(revisionCapture, "meeting detail loading must snapshot the material revision before awaiting the backend");
  const awaitIndex = loadDetail.indexOf("await Promise.allSettled");
  assert.ok(revisionCapture.index < awaitIndex, "the material revision snapshot must be captured before backend requests settle");
  const capturedRevisionName = escapeRegExp(revisionCapture[1]);
  const revisionComparison = new RegExp(
    `(?:${revisionName}\\s*={2,3}\\s*${capturedRevisionName}|${capturedRevisionName}\\s*={2,3}\\s*${revisionName})`
  );
  const comparisonMatch = revisionComparison.exec(loadDetail);
  assert.ok(comparisonMatch, "meeting detail loading must reject a snapshot made stale by a material upload");

  const firstPostAwaitMaterialWrite = loadDetail.indexOf("replaceArray(materials", awaitIndex);
  assert.ok(firstPostAwaitMaterialWrite > comparisonMatch.index, "the stale-snapshot guard must run before any post-await material replacement");
});

test("uploaded POST results survive an empty GET and late callbacks cannot mutate another meeting", () => {
  const changeHandler = sourceBetween(
    mainSource,
    'document.addEventListener("change"',
    'document.addEventListener("keydown"'
  );
  const uploadSource = changeHandler.slice(changeHandler.indexOf('if (!event.target.matches(".native-file-input")) return;'));
  const meetingCapture = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*state\.selectedMeetingId\s*;/.exec(uploadSource);
  assert.ok(meetingCapture, "upload callbacks need a stable meeting id");
  const meetingIdName = escapeRegExp(meetingCapture[1]);

  assert.match(uploadSource, /const\s+uploadedMaterials\s*=\s*\[\s*\]/, "successful POST materials must be retained locally");
  assert.match(uploadSource, /uploadedMaterials\.push\(uploadedMaterial\)/, "each successful POST response must enter the retained result set");
  const explicitMerge = /const\s+refreshedMaterials\s*=\s*normalizeMaterialsResponse\([^)]+\)[\s\S]{0,700}?for\s*\(const\s+uploadedMaterial\s+of\s+uploadedMaterials\)[\s\S]{0,500}?refreshedMaterials\.(?:unshift|push)\(uploadedMaterial\)[\s\S]{0,300}?replaceArray\(materials,\s*refreshedMaterials\)/.test(uploadSource);
  const helperMerge = /(?:merge|reconcile)[A-Za-z_$]*Materials[A-Za-z_$]*\(\s*(?:refreshedMaterials|normalizeMaterialsResponse\([^)]+\))\s*,\s*uploadedMaterials\s*\)/i.test(uploadSource);
  assert.ok(explicitMerge || helperMerge, "GET results must be merged with POST results before replacing the meeting material list, including when GET is empty");
  for (const method of ["listMaterials", "listChatHistory"]) {
    assert.match(
      uploadSource,
      new RegExp(`api\\.${method}\\(\\s*${meetingIdName}\\s*\\)`),
      `${method} must use the captured meeting id`
    );
  }
  assert.doesNotMatch(
    uploadSource,
    /api\.(?:listMaterials|listChatHistory)\(\s*state\.selectedMeetingId\s*\)/,
    "post-upload refreshes must not follow a later meeting selection"
  );

  const asyncGuard = new RegExp(
    `if\\s*\\(\\s*(?:${meetingIdName}\\s*!={1,2}\\s*state\\.selectedMeetingId|state\\.selectedMeetingId\\s*!={1,2}\\s*${meetingIdName})\\s*\\)\\s*(?:return|\\{[\\s\\S]{0,180}?return)`
  );
  const guardMatch = asyncGuard.exec(uploadSource);
  assert.ok(guardMatch, "after awaiting upload/refresh, callbacks must stop when the user has switched meetings");
  const firstAwait = uploadSource.indexOf("await api.uploadMaterial");
  const lastMeetingUiWrite = Math.max(
    uploadSource.lastIndexOf("state.meetingLeftTab"),
    uploadSource.lastIndexOf("state.selectedMaterial"),
    uploadSource.lastIndexOf("replaceArray(materials")
  );
  assert.ok(guardMatch.index > firstAwait && guardMatch.index < lastMeetingUiWrite, "the meeting guard must protect asynchronous UI writes");
});

test("single-click material selection avoids a full render while double-click still presents", () => {
  const clickHandler = sourceBetween(
    mainSource,
    'document.addEventListener("click"',
    'document.addEventListener("dblclick"'
  );
  const selectionBranch = sourceBetween(
    clickHandler,
    'if (action === "select-material")',
    'if (action === "download-material")'
  );
  assert.match(selectionBranch, /state\.selectedMaterial\s*=/, "single click must update the selected material");
  assert.doesNotMatch(selectionBranch, /\brender\s*\(/, "single click must not replace the row DOM before the browser can emit dblclick");
  assert.match(selectionBranch, /\breturn\s*;/, "single-click selection must return before the shared click-handler render");

  const doubleClickHandler = sourceBetween(
    mainSource,
    'document.addEventListener("dblclick"',
    'document.addEventListener("input"'
  );
  assert.match(doubleClickHandler, /closest\(["']\.material-row\[data-id\]["']\)/, "double click must resolve the material row");
  assert.match(doubleClickHandler, /await\s+presentMaterial\(row\.dataset\.id\)/, "double click must still invoke material presentation");
});

// These frontend guards only prevent an in-session UI regression. They do not
// replace backend persistence of transcript_segments, which is required to
// restore meeting records after refresh, reconnect, process restart, or login.
test("refreshTranscript reconciles backend snapshots without erasing newer realtime records", () => {
  const refreshSource = namedFunction("refreshTranscript");
  assert.match(refreshSource, /if\s*\(meetingId\s*!==\s*state\.selectedMeetingId\)\s*return/, "a transcript refresh must stay scoped to its meeting");
  const normalized = /const\s+([A-Za-z_$][\w$]*)\s*=\s*normalizeTranscriptResponse\(payload\)\s*;/.exec(refreshSource);
  assert.ok(normalized, "refreshTranscript must name the normalized backend snapshot before applying it");
  const recordsName = escapeRegExp(normalized[1]);
  assert.match(
    refreshSource,
    new RegExp(`applyTranscriptSnapshot\\(\\s*${recordsName}\\s*,\\s*meetingId\\s*\\)`),
    "refreshTranscript must reconcile the snapshot with records already received in this page"
  );
  assert.doesNotMatch(
    refreshSource,
    /replaceArray\(meetingRecords/,
    "refreshTranscript must not directly replace current records with a possibly stale snapshot"
  );
});

test("meeting detail loading reconciles both transcript snapshots", () => {
  const loadDetail = namedFunction("loadMeetingDetailFromBackend");
  assert.match(loadDetail, /const\s+hasCachedDetail\s*=\s*state\.loadedMeetingDetailId\s*===\s*meetingId/, "detail loading must distinguish a new meeting from a same-meeting refresh");
  assert.match(loadDetail, /if\s*\(!hasCachedDetail\)\s*\{[\s\S]{0,120}?restoreTranscriptRecords\(meetingId\)/, "switching back to a meeting must restore its same-page records before backend requests settle");

  const normalized = /const\s+([A-Za-z_$][\w$]*)\s*=\s*normalizeTranscriptResponse\(transcript\.value\)\s*;/.exec(loadDetail);
  assert.ok(normalized, "detail loading must name the transcript endpoint snapshot before applying it");
  const recordsName = escapeRegExp(normalized[1]);
  assert.match(
    loadDetail,
    new RegExp(`applyTranscriptSnapshot\\(\\s*${recordsName}\\s*,\\s*meetingId\\s*\\)`),
    "the transcript endpoint snapshot must pass through reconciliation"
  );

  const postAwaitSource = loadDetail.slice(loadDetail.indexOf("await Promise.allSettled"));
  assert.doesNotMatch(
    postAwaitSource,
    /replaceArray\(meetingRecords,\s*\[\s*\]\s*\)/,
    "a failed or empty post-await transcript request must not erase already visible same-meeting records"
  );
  assert.doesNotMatch(postAwaitSource, /replaceArray\(meetingRecords,\s*(?:detailTranscripts|nextRecords)\)/, "detail snapshots must never bypass reconciliation");
});

test("meeting re-entry cache persists locally with account and meeting isolation", () => {
  assert.match(mainSource, /createTranscriptRecordStore\(\{[\s\S]{0,120}?storage:\s*window\.localStorage/, "transcript records need durable local storage");
  const authUserSource = namedFunction("applyAuthenticatedUser");
  assert.match(authUserSource, /transcriptRecordStore\.setOwner\(email\s*\|\|\s*profile\.user_id/, "local transcript storage must be scoped to the authenticated user");
  const resetSource = namedFunction("resetAuthenticatedSession");
  assert.match(resetSource, /transcriptRecordStore\.setOwner\(""\)/, "logout must detach the active account without deleting its durable transcript cache");
  const deleteSource = namedFunction("deleteMeetingById");
  assert.match(deleteSource, /transcriptRecordStore\.remove\(meetingId\)/, "deleting a meeting must delete its local transcript copy");
  const normalizeSource = namedFunction("normalizeTranscriptResponse");
  assert.doesNotMatch(normalizeSource, /payload\?*\.cleaned_text|payload\[\s*["']cleaned_text["']\s*\]/, "aggregate cleaned_text must not be presented as fake transcript segments");
});

test("realtime callbacks stay pinned to the recording meeting, including a late final segment", () => {
  const startSource = namedFunction("startRealtimeRecording");
  assert.match(startSource, /onTranscript:\s*\(message\)\s*=>\s*\{[\s\S]{0,180}?appendRealtimeTranscript\(message,\s*meetingId\)/, "late WS transcript callbacks must be archived under the recording meeting id");
  assert.match(startSource, /getAuthToken\(\)\s*!==\s*recordingAuthToken/, "late WS transcript callbacks from a previous login must be ignored");
  for (const callback of ["onStatus", "onComplete", "onError"]) {
    assert.match(startSource, new RegExp(`${callback}:[\\s\\S]{0,100}?meetingId\\s*!==\\s*state\\.selectedMeetingId`), `${callback} must be scoped to the recording meeting`);
  }
  assert.match(startSource, /onComplete:[\s\S]{0,260}?recordingStatus\s*!==\s*"stopping"[\s\S]{0,180}?realtimeAsrSession\s*=\s*null[\s\S]{0,120}?recordingStatus\s*=\s*"stopped"/, "a server-initiated completion must release the finished session without racing explicit stop");

  const clickSource = sourceBetween(mainSource, 'document.addEventListener("click"', 'document.addEventListener("dblclick"');
  const openMeetingSource = sourceBetween(clickSource, 'if (action === "open-meeting")', 'if (action === "open-summary")');
  const openSummarySource = sourceBetween(clickSource, 'if (action === "open-summary")', 'if (action === "toggle-recording")');
  assert.match(openMeetingSource, /preventActiveRecordingMeetingSwitch\(nextMeetingId\)/, "active recording must block a meeting switch before selection changes");
  assert.match(openSummarySource, /preventActiveRecordingMeetingSwitch\(nextMeetingId\)/, "summary navigation must not retarget an active recording");

  const appendSource = namedFunction("appendRealtimeTranscript");
  assert.match(appendSource, /meetingId\s*===\s*state\.selectedMeetingId[\s\S]{0,120}?transcriptRecordStore\.read\(meetingId\)/, "a late segment must use the original meeting cache instead of the visible meeting list");
  assert.match(appendSource, /cacheTranscriptRecords\(meetingId,\s*targetRecords,\s*\{\s*persist:\s*Boolean\(message\.is_sentence_end\)\s*\}\)/, "only final realtime segments should synchronously persist while interim text stays in memory");
});

test("stopping realtime recording performs one persisted transcript refresh", () => {
  const startSource = namedFunction("startRealtimeRecording");
  const stopSource = namedFunction("stopRealtimeRecording");
  assert.equal(
    countMatches(startSource, /\brefreshTranscript\s*\(/g),
    0,
    "the realtime onComplete callback must not race the explicit stop refresh"
  );
  assert.equal(
    countMatches(stopSource, /\brefreshTranscript\s*\(/g),
    1,
    "stopRealtimeRecording must refresh persisted segments exactly once"
  );
  assert.match(
    stopSource,
    /await\s+refreshTranscript\(meetingId,\s*\{\s*notify:\s*false\s*\}\)/,
    "the single stop refresh must stay pinned to the recording meeting id"
  );
});
