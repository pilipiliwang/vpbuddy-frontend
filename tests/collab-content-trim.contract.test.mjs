import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const repoRoot = process.env.VPBUDDY_FRONTEND_ROOT
  ? path.resolve(process.env.VPBUDDY_FRONTEND_ROOT)
  : fileURLToPath(new URL("../", import.meta.url));
const mainSource = await readFile(path.join(repoRoot, "src", "main.js"), "utf8");
const collaborationSource = await readFile(path.join(repoRoot, "src", "utils", "collaboration.js"), "utf8");
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

test("collaboration normalization keeps backend primary content without invented metadata", () => {
  const normalizer = sourceBetween(mainSource, "function normalizeCollabQuestions", "function normalizeChatMessage");

  assert.match(normalizer, /return\s+normalizeCollabQuestionPayload\(payload\)/);
  assert.match(collaborationSource, /\["content",\s*"text",\s*"question",\s*"suggestion"\]/);
  assert.match(collaborationSource, /replace\(\/\\\\r\\\\n\|\\\\n\|\\\\r\/g,\s*"\\n"\)/);
  assert.doesNotMatch(normalizer, /\b(?:target|reason|status):/);
  assert.doesNotMatch(normalizer, /会议参与者|关联交付物|来自后端协同问答|待回答/);
});

test("AI collaboration cards safely render a bounded Markdown preview", () => {
  const renderer = sourceBetween(mainSource, "function renderCollabMarkdown", "function normalizeCollabQuestions");
  const panel = sourceBetween(mainSource, "function renderAIPanel()", "function renderTimeline()");
  const cards = sourceBetween(panel, '<div class="followup-list">', "${uiVisibility.explanationMaterials");
  const cardMarkdown = cssRule(".followup-markdown.markdown-content");
  const cardContent = cssRule(".followup-content");

  assert.match(renderer, /return\s+renderMarkdown\(stripAssistantReasoning\(value\)\)/);
  assert.match(cards, /renderCollabMarkdown\(item\.question\)/);
  assert.doesNotMatch(cards, /item\.question\.(?:slice|substring|substr)\s*\(/);
  assert.doesNotMatch(cards, /\$\{\s*item\.question\s*\}/);
  assert.doesNotMatch(cards, /item\.(?:target|reason|status)/);
  assert.match(cardMarkdown, /max-block-size:\s*5\.8rem\s*;/);
  assert.match(cardMarkdown, /overflow:\s*hidden\s*;/);
  assert.match(cardMarkdown, /font-size:\s*0\.9375rem\s*;/);
  assert.match(cardMarkdown, /-webkit-line-clamp:\s*4\s*;/);
  assert.match(cardMarkdown, /line-clamp:\s*4\s*;/);
  assert.match(cardContent, /flex:\s*1\s+1\s+0\s*;/);
  assert.match(cardContent, /inline-size:\s*0\s*;/);
  assert.match(stylesSource, /\.followup-markdown\.markdown-content h1\s*\{[\s\S]{0,80}?font-size:\s*1\.2em/);
  assert.match(stylesSource, /\.followup-markdown\.markdown-content h2\s*\{[\s\S]{0,80}?font-size:\s*1\.12em/);
  assert.doesNotMatch(stylesSource, /\.question-row\s+(?:span|strong|em)\s*\{/);
  assert.doesNotMatch(stylesSource, /\.detail-question\s+strong\s*\{/);
});

test("content detail renders the complete question and no frontend-generated labels", () => {
  const modal = sourceBetween(mainSource, 'if (state.modal === "followup-detail")', 'if (state.modal === "all-explanations")');
  const modalMarkdown = cssRule(".followup-detail-modal .modal-markdown");

  assert.match(modal, /renderCollabMarkdown\(selectedFollowup\?\.question\)/);
  assert.doesNotMatch(modal, /selectedFollowup\?\.question\.(?:slice|substring|substr)\s*\(/);
  assert.doesNotMatch(modal, /\$\{\s*selectedFollowup\?\.question\s*\}/);
  assert.doesNotMatch(modal, /lookup-meta|生成原因|关联交付物|会议对话分析|待主持人确认|面向/);
  assert.doesNotMatch(modal, /selectedFollowup\?\.(?:target|reason|status)/);
  assert.doesNotMatch(modalMarkdown, /line-clamp|max-(?:block-size|height)/);
  assert.match(modalMarkdown, /font-size:\s*1rem\s*;/);
  assert.match(modalMarkdown, /overflow-wrap:\s*anywhere\s*;/);
  assert.match(stylesSource, /\.followup-detail-modal \.modal-markdown h1\s*\{[\s\S]{0,80}?font-size:\s*1\.5em/);
  assert.match(stylesSource, /\.followup-detail-modal \.modal-markdown h2\s*\{[\s\S]{0,80}?font-size:\s*1\.3em/);
});
