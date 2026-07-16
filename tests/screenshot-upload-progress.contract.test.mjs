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

function sourceBetween(startMarker, endMarker) {
  const start = mainSource.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = mainSource.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return mainSource.slice(start, end);
}

const progressFactorySource = sourceBetween("function startUploadProgress", "function renderUploadProgress");
const progressRendererSource = sourceBetween("function renderUploadProgress", "function renderDemoVersionControl");
const materialsSource = sourceBetween("function renderMaterialsList", "function renderMeetingRecords");
const presentationSource = sourceBetween("function renderPresentationCanvas", "function renderDeliverableCanvas");
const composerSource = sourceBetween("function renderVpbuddyComposer", "function renderAIPanel");
const captureSource = sourceBetween("async function captureStageScreenshot", 'document.addEventListener("click"');
const changeHandlerSource = sourceBetween('document.addEventListener("change"', 'document.addEventListener("keydown"');

test("screenshot and manual file uploads share the same progress object and renderer", () => {
  assert.match(
    progressFactorySource,
    /const\s+progress\s*=\s*\{\s*context,\s*name,\s*current:\s*0,\s*total,\s*status:\s*["']uploading["']\s*\}/,
    "the shared progress factory must preserve context, name, current/total, and status"
  );
  assert.match(
    captureSource,
    /startUploadProgress\(\s*["']vpbuddy-material["']\s*,\s*file\.name\s*,\s*1\s*\)/,
    "a screenshot must use the same prominent VPBuddy material progress context as manual sending"
  );
  assert.match(
    changeHandlerSource,
    /const\s+progressContext\s*=\s*context\s*;[\s\S]{0,500}?startUploadProgress\(\s*progressContext\s*,\s*files\[0\]\.name\s*,\s*files\.length\s*\)/,
    "manual meeting and VPBuddy uploads must use the same progress factory"
  );
  assert.match(composerSource, /renderUploadProgress\(\s*["']vpbuddy-material["']\s*\)/, "screenshot progress must render in the same VPBuddy composer area as manual sending");
  assert.match(progressRendererSource, /["']正在上传["'][\s\S]{0,80}?progress\.name/, "material progress must show the active filename with an uploading label");
  assert.match(progressRendererSource, /progress\.current\}\/\$\{progress\.total\}/, "the shared renderer must show truthful completed-item counts");
  assert.doesNotMatch(stylesSource, /\.(?:screenshot|stage-screenshot)-(?:upload-)?progress\b/, "screenshots must not introduce a duplicate progress style");
});

test("screenshot upload exposes 0/1 to 1/1 success and failure states without simulated counts", () => {
  const uploadAwait = captureSource.indexOf("await api.uploadMaterial(meetingId, file)");
  const settledCount = captureSource.indexOf("progress.current = 1", uploadAwait);
  assert.notEqual(uploadAwait, -1, "the screenshot must await the canonical material upload request");
  assert.ok(settledCount > uploadAwait, "the screenshot count may advance to 1/1 only after the upload request settles");
  assert.match(
    captureSource,
    /startUploadProgress\([\s\S]{0,120}?state\.meetingLeftTab\s*=\s*["']materials["'];\s*render\(\)/,
    "starting a screenshot upload must reveal the materials list while the shared composer progress remains visible"
  );
  assert.match(captureSource, /progress\.current\s*=\s*1;[\s\S]{0,120}?render\(\)/, "a successful request must render the settled 1/1 count");
  assert.match(captureSource, /progress\.status\s*=\s*["']complete["'][\s\S]{0,140}?截屏已上传为会议材料/, "a successful screenshot must expose complete state and success copy");
  assert.match(captureSource, /catch\s*\(error\)[\s\S]{0,260}?progress\.current\s*=\s*1;\s*progress\.status\s*=\s*["']error["'][\s\S]{0,120}?截屏上传失败/, "a failed request must settle at 1/1 and expose failure copy");
  const cleanupTimer = captureSource.slice(captureSource.indexOf("window.setTimeout"));
  assert.doesNotMatch(cleanupTimer, /progress\.current\s*=/, "the dismissal timer must not fabricate progress counts");
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

test("manual uploads retain truthful status until their post-upload refresh completes", () => {
  const finalStatus = changeHandlerSource.lastIndexOf('progress.status = errors.length ? "error" : "complete"');
  const vpbuddyRefresh = changeHandlerSource.indexOf('if (context === "vpbuddy-material" && succeeded)');
  const materialRefresh = changeHandlerSource.indexOf('if (context === "material" && succeeded)');
  const nameUpdate = changeHandlerSource.indexOf("progress.name = file.name");
  const uploadAwait = changeHandlerSource.indexOf("await api.uploadMaterial(meetingId, file)", nameUpdate);
  const currentUpdate = changeHandlerSource.indexOf("progress.current = index + 1", uploadAwait);
  assert.ok(nameUpdate !== -1 && nameUpdate < uploadAwait && uploadAwait < currentUpdate, "manual uploads must show each filename and advance only after each request settles");
  assert.match(changeHandlerSource.slice(currentUpdate), /^progress\.current\s*=\s*index\s*\+\s*1;\s*render\(\)/, "each settled manual request must render its updated count");
  assert.ok(finalStatus > vpbuddyRefresh && finalStatus > materialRefresh, "manual success or failure status must be finalized after list/history refresh work");
  assert.match(changeHandlerSource, /api\.listMaterials\(meetingId\),\s*api\.listChatHistory\(meetingId\)/, "VPBuddy material completion must refresh both backend collections");
});
