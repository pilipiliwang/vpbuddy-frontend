import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const repoRoot = process.env.VPBUDDY_FRONTEND_ROOT
  ? path.resolve(process.env.VPBUDDY_FRONTEND_ROOT)
  : fileURLToPath(new URL("../", import.meta.url));
const mainSource = await readFile(path.join(repoRoot, "src", "main.js"), "utf8");

function sourceBetween(startMarker, endMarker) {
  const start = mainSource.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = mainSource.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return mainSource.slice(start, end);
}

const pickerSource = sourceBetween("function renderFilePicker", "function nowTime");
const progressSource = sourceBetween("function startUploadProgress", "function renderDemoVersionControl");
const materialsSource = sourceBetween("function renderMaterialsList", "function renderMeetingRecords");
const presentationSource = sourceBetween("function renderPresentationCanvas", "function renderDeliverableCanvas");
const composerSource = sourceBetween("function renderVpbuddyComposer", "function renderAIPanel");
const captureSource = sourceBetween("async function captureStageScreenshot", 'document.addEventListener("click"');
const clickSource = sourceBetween('document.addEventListener("click"', 'document.addEventListener("dblclick"');
const changeSource = sourceBetween('document.addEventListener("change"', 'document.addEventListener("keydown"');

test("file picker is stable across render and resets before every open", () => {
  assert.match(pickerSource, /data-stable-file-picker/, "the picker must live outside rerendered app markup");
  assert.match(pickerSource, /document\.body\.appendChild\(input\)/, "the picker must survive stage tab renders");
  assert.match(pickerSource, /input\.value\s*=\s*["']{2}/, "the same file must trigger a fresh change event");
  assert.match(clickSource, /send-vpbuddy-material[\s\S]{0,180}?openFilePicker\(/, "send materials must use the stable picker");
  assert.match(clickSource, /retry-upload[\s\S]{0,420}?state\.uploadProgress\s*=\s*null[\s\S]{0,240}?openFilePicker\(/, "failed uploads must reset and retry through the picker");
});

test("material upload reports transport success before asynchronous parsing", () => {
  assert.match(progressSource, /status:\s*["']uploading["'][\s\S]{0,100}?materialIds:\s*\[\]/, "progress tracks uploaded material ids");
  assert.match(progressSource, /progress\.status\s*!==\s*["']parsing["']/, "only parsing uploads react to backend completion");
  assert.match(progressSource, /phase\s*===\s*["']parsed["']\s*\?\s*["']complete["']\s*:\s*["']error["']/, "backend parse outcome drives the terminal state");
  assert.match(captureSource, /await api\.uploadMaterial\(meetingId, file\)[\s\S]{0,1600}?progress\.status\s*=\s*["']parsing["']/, "screenshot upload enters parsing immediately after the canonical API succeeds");
  assert.match(changeSource, /api\.uploadMaterial\(meetingId, file\)[\s\S]{0,1600}?progress\.materialIds\.push\(uploadedMaterial\.id\)[\s\S]{0,260}?progress\.status\s*=\s*["']parsing["']/, "manual sends enter parsing after the upload response");
});

test("upload records are saved with materials and chat history refreshes without a second attachment API", () => {
  assert.match(changeSource, /replaceArray\(materials, mergeMaterials\(materials, \[uploadedMaterial\]\)\)/, "successful uploads immediately appear in meeting materials");
  assert.match(changeSource, /context === ["']vpbuddy-material["'][\s\S]{0,600}?addVpbuddyMessage\(/, "VPBuddy sends immediately add their upload record");
  assert.match(changeSource, /Promise\.allSettled\(\[\s*api\.listMaterials\(meetingId\),\s*api\.listChatHistory\(meetingId\)\s*\]\)/, "post-upload refreshes use existing material and chat APIs");
  assert.doesNotMatch(changeSource, /api\.sendChatAttachment\s*\(/, "materials are not uploaded twice through chat");
});

test("screenshot upload locks shared upload actions and refreshes materials and chat", () => {
  assert.match(presentationSource, /data-action=["']capture-screenshot["'][^>]*\$\{uploadBusy\s*\?\s*["']disabled["']/, "the screenshot button must disable while a shared upload is active");
  assert.match(materialsSource, /data-context=["']material["'][^>]*\$\{uploadBusy\s*\?\s*["']disabled["']/, "the meeting material button must disable while a shared upload is active");
  assert.match(composerSource, /data-action=["']send-vpbuddy-material["'][^>]*(?:materialSending|uploadBusy)[\s\S]{0,100}?["']disabled["']/, "the VPBuddy material button must disable while a shared upload is active");
  assert.match(
    captureSource,
    /Promise\.allSettled\(\s*\[\s*api\.listMaterials\(meetingId\),\s*api\.listChatHistory\(meetingId\)\s*\]\s*\)/,
    "screenshot completion must refresh the pinned material list and VPBuddy history together"
  );
  assert.match(captureSource, /applyChatHistory\(chatHistory\.value\)/, "a refreshed screenshot upload record must be applied to chat history");
  assert.match(captureSource, /mergeMaterials\(refreshedMaterials,\s*\[uploadedMaterial\]\)/, "a stale GET must not discard the uploaded screenshot material");
  assert.doesNotMatch(captureSource, /api\.sendChatAttachment\s*\(/, "a screenshot must not be uploaded through a second attachment endpoint");
});

test("screenshots target the complete stage surface instead of image-only previews", () => {
  assert.match(captureSource, /document\.querySelector\("\.annotation-canvas"\)/);
  assert.match(captureSource, /await html2canvas\(stage,[\s\S]*?ignoreElements/);
  assert.match(captureSource, /const previewCanvas\s*=\s*surface\.querySelector\("canvas"\)/);
  assert.doesNotMatch(captureSource, /暂无可截屏的投屏内容/);
  assert.match(captureSource, /drawStageAnnotations\(context,\s*fallback\.width,\s*fallback\.height\)/);
});

test("all annotation tools share the stage overlay and retain reversible history", () => {
  assert.match(mainSource, /function getAnnotationSurfaceRect\(\)[\s\S]*?\.stage-render-surface/);
  assert.match(mainSource, /function saveAnnotationHistory\([\s\S]*?annotationRedoStack\s*=\s*\[\]/);
  assert.match(mainSource, /action\s*===\s*"annotation-redo"[\s\S]*?restoreAnnotationHistory/);
  assert.match(presentationSource, /data-action="annotation-undo"[\s\S]*?data-action="annotation-redo"/);
});
