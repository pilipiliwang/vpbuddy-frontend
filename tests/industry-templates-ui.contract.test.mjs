import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const mainSource = await readFile(path.join(repoRoot, "src", "main.js"), "utf8");
const clientSource = await readFile(path.join(repoRoot, "src", "api", "client.js"), "utf8");
const stylesSource = await readFile(path.join(repoRoot, "src", "styles.css"), "utf8");

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("industry templates are a backend-backed navigation module", () => {
  assert.match(mainSource, /const\s+industryTemplates\s*=\s*\[\s*\]\s*;/);
  assert.match(mainSource, /\["workspace",\s*"工作台"[\s\S]{0,100}?\["templates",\s*"行业模板"[\s\S]{0,100}?\["knowledge",\s*"知识库"/);
  assert.match(mainSource, /templates:\s*renderIndustryTemplates/);
  assert.match(mainSource, /state\.view\s*===\s*"templates"\)\s*await\s+loadIndustryTemplates/);
  for (const staticTemplateId of [
    "corporate-website",
    "data-dashboard",
    "ecommerce-store",
    "restaurant-ordering",
    "education-training",
    "healthcare-booking"
  ]) {
    assert.ok(!mainSource.includes(staticTemplateId), `production UI must not embed backend template id ${staticTemplateId}`);
  }
});

test("template listing sends search, industry, sorting and pagination to the backend", () => {
  const listSource = sourceBetween(mainSource, "async function loadIndustryTemplates", "function scheduleIndustryTemplateSearch");
  assert.match(listSource, /api\.listTemplates\(\{[\s\S]*?q:\s*state\.templateQuery\.trim\(\)[\s\S]*?industry:\s*state\.templateIndustry[\s\S]*?sort:\s*state\.templateSort[\s\S]*?page:\s*state\.templatePage[\s\S]*?pageSize:\s*state\.templatePageSize/);
  assert.match(clientSource, /withQuery\("\/api\/templates"[\s\S]{0,260}?page_size:/);
  assert.match(mainSource, /class="template-search-input"/);
  assert.match(mainSource, /data-action="template-industry"/);
  assert.match(mainSource, /class="template-sort-select"/);
  assert.match(mainSource, /data-action="template-page"/);
});

test("authenticated cover and HTML preview responses use revocable Blob URLs", () => {
  const coverSource = sourceBetween(mainSource, "async function loadIndustryTemplateCover", "function loadVisibleIndustryTemplateCovers");
  const previewSource = sourceBetween(mainSource, "async function loadIndustryTemplatePreview", "async function openIndustryTemplateDetail");
  assert.match(coverSource, /api\.getTemplateCover\(template\.id\)/);
  assert.match(coverSource, /URL\.createObjectURL\(download\.blob\)/);
  assert.match(previewSource, /api\.getTemplatePreview\(templateId/);
  assert.match(previewSource, /URL\.createObjectURL\(new Blob\(\[html\]/);
  assert.match(mainSource, /function clearIndustryTemplateAssets[\s\S]{0,500}?revokeTemplateObjectUrl/);
  assert.match(mainSource, /sandbox="allow-scripts allow-forms allow-modals"/);
  assert.doesNotMatch(mainSource, /sandbox="[^"]*allow-same-origin/);
  assert.match(mainSource, /const\s+coverUrl\s*=\s*templateCoverUrls\.get\(template\.id\)/);
  assert.doesNotMatch(mainSource, /<img[^>]+src="\$\{escapeHtml\(template\.coverUrl\)\}/);
});

test("using a template is idempotent and opens the generated Demo without starting recording", () => {
  const applySource = sourceBetween(mainSource, "async function applyIndustryTemplate", "async function loadMeetingsFromBackend");
  const openSource = sourceBetween(mainSource, "async function openAppliedTemplateMeeting", "async function applyIndustryTemplate");
  assert.match(applySource, /templateApplyRequestTemplateId\s*===\s*templateId[\s\S]{0,220}?templateApplyRequestId/);
  assert.match(applySource, /api\.applyTemplate\(templateId,\s*\{[\s\S]{0,180}?request_id:\s*requestId/);
  assert.match(applySource, /recoverIndustryTemplateApplication\(requestId\)/);
  assert.match(openSource, /state\.selectedMeetingId\s*=\s*meetingId/);
  assert.match(openSource, /state\.stageTab\s*=\s*"deliverable"/);
  assert.match(openSource, /state\.selectedDemoVersion\s*=\s*Number\(result\?\.demo\?\.version\)\s*\|\|\s*1/);
  assert.match(openSource, /fallbackStatus:\s*"进行中"/);
  assert.match(openSource, /if\s*\(!hasMeetingClosedMarker\(meetingSource\)\)\s*meeting\.status\s*=\s*"进行中"/);
  assert.match(openSource, /rememberMeetingStatus\(meeting\.id,\s*meeting\.status\)/);
  assert.match(openSource, /rememberMeetingTime\(meeting\.id,\s*meetingSource\.created_at\s*\|\|\s*appliedAt\)/);
  assert.match(openSource, /loadDemoPreviewContent\(meetingId,\s*\{\s*force:\s*true\s*\}\)/);
  assert.doesNotMatch(openSource, /startRealtimeRecording|toggle-recording|recordingStatus\s*=\s*"recording"/);
});

test("template cards and detail preview have stable responsive dimensions", () => {
  assert.match(stylesSource, /\.industry-template-grid\s*\{[\s\S]{0,180}?grid-template-columns:\s*repeat\(3,\s*minmax\(250px,\s*1fr\)\)/);
  assert.match(stylesSource, /\.industry-template-cover\s*\{[\s\S]{0,180}?aspect-ratio:\s*16\s*\/\s*9/);
  assert.match(stylesSource, /\.template-preview-shell\s*\{[\s\S]{0,180}?aspect-ratio:\s*16\s*\/\s*9/);
  assert.match(stylesSource, /\.template-sort-control\s*\{[\s\S]{0,220}?min-width:\s*180px/);
  assert.match(stylesSource, /\.template-sort-control select\s*\{[\s\S]{0,260}?appearance:\s*none/);
  assert.match(stylesSource, /\.template-industry-tabs\s*\{[\s\S]{0,260}?scrollbar-width:\s*none/);
  assert.match(stylesSource, /\.template-detail-modal\s*\{[\s\S]{0,220}?scrollbar-width:\s*none/);
  assert.match(mainSource, /function prepareIndustryTemplatePreviewHtml[\s\S]{0,500}?::-webkit-scrollbar/);
  assert.match(stylesSource, /@media\s*\(max-width:\s*1320px\)[\s\S]{0,180}?\.industry-template-grid\s*\{[\s\S]{0,100}?repeat\(2/);
  assert.match(stylesSource, /@media\s*\(max-width:\s*880px\)[\s\S]*?\.industry-template-grid,[\s\S]{0,180}?grid-template-columns:\s*1fr/);
});
