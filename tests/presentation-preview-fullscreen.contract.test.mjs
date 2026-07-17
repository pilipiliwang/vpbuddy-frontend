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

test("material preview paints loading immediately and settles success or failure", () => {
  const loadSource = sourceBetween(mainSource, "async function loadMaterialPreview", "async function presentMaterial");
  const renderSource = sourceBetween(mainSource, "function renderMaterialPreviewContent", "function renderPresentationCanvas");
  const loadingIndex = loadSource.indexOf("state.presentationLoading = true");
  const firstRenderIndex = loadSource.indexOf("render()", loadingIndex);
  const downloadIndex = loadSource.indexOf("await api.downloadMaterial", firstRenderIndex);

  assert.ok(loadingIndex >= 0, "preview loading state must be explicit");
  assert.ok(firstRenderIndex > loadingIndex, "the loading state must render immediately");
  assert.ok(downloadIndex > firstRenderIndex, "loading must paint before the authenticated file request begins");
  assert.match(loadSource, /catch\s*\(error\)[\s\S]*?presentationError\s*=\s*materialPreviewErrorMessage\(error\)/);
  assert.match(loadSource, /finally\s*\{[\s\S]*?presentationLoading\s*=\s*false;[\s\S]*?render\(\)/);
  assert.match(renderSource, /class="material-preview-status"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-busy="true"/);
  assert.match(renderSource, /meeting-loading-spinner[\s\S]*?正在准备投屏预览[\s\S]*?正在读取/);
  assert.match(stylesSource, /\.material-preview-status\s*\{[\s\S]*?align-items:\s*center[\s\S]*?justify-content:\s*center/);
});

test("preview requests ignore stale work and revoke replaced object URLs", () => {
  const clearSource = sourceBetween(mainSource, "function clearPresentationPreview", "function getMaterialPreviewCacheKeys");
  const loadSource = sourceBetween(mainSource, "async function loadMaterialPreview", "async function presentMaterial");

  assert.match(clearSource, /materialPreviewLoadSequence\s*\+=\s*1/);
  assert.match(clearSource, /URL\.revokeObjectURL\(state\.presentationUrl\)/);
  assert.match(clearSource, /presentationLoading\s*=\s*false/);
  assert.match(loadSource, /loadSequence\s*!==\s*materialPreviewLoadSequence/);
  assert.match(loadSource, /URL\.createObjectURL\(previewBlob\)/);
});

test("screenshot PNG previews reuse the generated Blob before authenticated download fallback", () => {
  const captureSource = sourceBetween(mainSource, "async function captureStageScreenshot", 'document.addEventListener("click"');
  const loadSource = sourceBetween(mainSource, "async function loadMaterialPreview", "async function presentMaterial");
  const cachedLookupIndex = loadSource.indexOf("getCachedMaterialPreviewDownload(material)");
  const authenticatedDownloadIndex = loadSource.indexOf("await api.downloadMaterial(materialId)");

  assert.match(captureSource, /cacheMaterialPreviewDownload\(uploadedMaterial,\s*\{[\s\S]*?blob:\s*file,[\s\S]*?contentType:\s*file\.type[\s\S]*?\},\s*meetingId,\s*true\)/);
  assert.match(captureSource, /uploadedMaterial\.contentType\s*=\s*"image\/png"/);
  assert.ok(cachedLookupIndex >= 0, "material preview must check its Blob cache");
  assert.ok(authenticatedDownloadIndex > cachedLookupIndex, "authenticated material download must remain the cache-miss fallback");
  assert.match(mainSource, /function clearMaterialPreviewDownloadCache\(\)\s*\{\s*materialPreviewDownloadCache\.clear\(\)/);
});

test("manual material uploads retain their original Blob for immediate presentation", () => {
  const uploadSource = sourceBetween(mainSource, 'document.addEventListener("change"', 'document.addEventListener("keydown"');

  assert.match(uploadSource, /api\.uploadMaterial\(meetingId,\s*file\)[\s\S]*?cacheMaterialPreviewDownload\(uploadedMaterial,\s*\{[\s\S]*?blob:\s*file,[\s\S]*?filename:\s*file\.name,[\s\S]*?contentType:\s*file\.type[\s\S]*?\},\s*meetingId,\s*true\)/);
});

test("presentation uses a stable canvas PDF reader and supports local text formats", () => {
  const loadSource = sourceBetween(mainSource, "async function loadMaterialPreview", "async function presentMaterial");
  const renderSource = sourceBetween(mainSource, "function renderMaterialPreviewContent", "function renderPresentationCanvas");

  assert.match(mainSource, /md:\s*"text\/markdown"/);
  assert.match(mainSource, /csv:\s*"text\/csv"/);
  assert.match(loadSource, /isTextMaterialPreview\(resolvedMime\)[\s\S]*?await previewBlob\.text\(\)/);
  assert.match(renderSource, /class="material-pdf-preview"[\s\S]*?data-stable-stage-surface="material-preview"[\s\S]*?material-pdf-canvas/);
  assert.match(mainSource, /async function ensurePdfPreviewMounted[\s\S]*?pdfjs\.getDocument[\s\S]*?surface\.scrollTop\s*=\s*scrollTop/);
  assert.match(renderSource, /class="material-text-preview markdown-body"[\s\S]*?renderMarkdown\(state\.presentationText\)/);
  assert.match(stylesSource, /\.material-text-preview\s*\{[\s\S]*?overflow:\s*auto/);
  assert.match(stylesSource, /\.material-pdf-preview\s*\{[\s\S]*?overflow:\s*auto/);
  assert.match(stylesSource, /\.annotation-canvas\.tool-cursor \.annotation-layer\s*\{[\s\S]*?pointer-events:\s*none/);
});

test("ordinary renders preserve the material surface while PDF rendering is mounted separately", () => {
  const patchSource = sourceBetween(mainSource, "function patchDomNode", "function patchDomChildren");
  const updateSource = sourceBetween(mainSource, "function updateAppMarkup", "function render()");

  assert.match(patchSource, /stableStageSurface[\s\S]*?stableStageSource[\s\S]*?syncDomAttributes\(current,\s*next\);[\s\S]*?return/);
  assert.match(updateSource, /canPreserveStageSurface[\s\S]*?patchDomChildren\(app,\s*template\.content\)/);
});

test("network-level preview failures are actionable and retryable", () => {
  const renderSource = sourceBetween(mainSource, "function renderMaterialPreviewContent", "function renderPresentationCanvas");

  assert.match(mainSource, /failed to fetch\|networkerror[\s\S]*?后端未能返回材料原文件/);
  assert.match(renderSource, /data-action="retry-material-preview"/);
  assert.match(mainSource, /action\s*===\s*"retry-material-preview"[\s\S]*?loadMaterialPreview\(materialId\)/);
});

test("fullscreen rendering patches the active element instead of replacing it", () => {
  const updateSource = sourceBetween(mainSource, "function updateAppMarkup", "function render()");
  const toolbarSource = sourceBetween(mainSource, "function renderPresentationCanvas", "function renderDeliverableCanvas");

  assert.match(updateSource, /document\.fullscreenElement\s*&&\s*app\.contains\(document\.fullscreenElement\)/);
  assert.match(updateSource, /canPreserveFrame\s*\|\|\s*preserveFullscreenElement\s*\|\|\s*canPreserveStageSurface\)\s*patchDomChildren\(app,\s*template\.content\)/);
  assert.match(updateSource, /else\s+app\.innerHTML\s*=\s*nextMarkup/);
  for (const action of ["tool", "annotation-color", "annotation-size", "annotation-undo", "annotation-clear", "zoom"]) {
    assert.match(toolbarSource, new RegExp(`data-action=["']${action}["']`), `missing fullscreen-safe toolbar action: ${action}`);
  }
});

test("the unavailable thumbnail backend message is no longer rendered", () => {
  const presentationSource = sourceBetween(mainSource, "function renderPresentationCanvas", "function renderDeliverableCanvas");
  assert.doesNotMatch(presentationSource, /后端尚未提供材料页面缩略图/);
});
