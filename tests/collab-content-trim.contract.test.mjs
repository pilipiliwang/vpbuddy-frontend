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

test("collaboration normalization keeps backend primary content without invented metadata", () => {
  const normalizer = sourceBetween(mainSource, "function normalizeCollabQuestions", "function normalizeChatMessage");

  assert.match(normalizer, /question:\s*stripAssistantReasoning\(item\.question\)/);
  assert.match(normalizer, /time:\s*item\.asked_at\s*\?/);
  assert.doesNotMatch(normalizer, /\b(?:target|reason|status):/);
  assert.doesNotMatch(normalizer, /会议参与者|关联交付物|来自后端协同问答|待回答/);
});

test("AI collaboration cards clamp presentation without truncating stored question data", () => {
  const panel = sourceBetween(mainSource, "function renderAIPanel()", "function renderTimeline()");
  const cards = sourceBetween(panel, '<div class="followup-list">', "${uiVisibility.explanationMaterials");
  const cardMarkdown = cssRule(".followup-markdown.markdown-content");

  assert.match(cards, /renderMarkdown\(stripAssistantReasoning\(item\.question\)\)/);
  assert.doesNotMatch(cards, /item\.question\.(?:slice|substring|substr)\s*\(/);
  assert.doesNotMatch(cards, /item\.(?:target|reason|status)/);
  assert.match(cardMarkdown, /-webkit-line-clamp:\s*4\s*;/);
  assert.match(cardMarkdown, /line-clamp:\s*4\s*;/);
  assert.match(cardMarkdown, /overflow:\s*hidden\s*;/);
});

test("content detail renders the complete question and no frontend-generated labels", () => {
  const modal = sourceBetween(mainSource, 'if (state.modal === "followup-detail")', 'if (state.modal === "all-explanations")');
  const modalMarkdown = cssRule(".followup-detail-modal .modal-markdown");

  assert.match(modal, /renderMarkdown\(stripAssistantReasoning\(selectedFollowup\?\.question\)\)/);
  assert.doesNotMatch(modal, /selectedFollowup\?\.question\.(?:slice|substring|substr)\s*\(/);
  assert.doesNotMatch(modal, /lookup-meta|生成原因|关联交付物|会议对话分析|待主持人确认|面向/);
  assert.doesNotMatch(modal, /selectedFollowup\?\.(?:target|reason|status)/);
  assert.doesNotMatch(modalMarkdown, /line-clamp|max-height/);
  assert.match(modalMarkdown, /overflow-wrap:\s*anywhere\s*;/);
});
