import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

import { stripAssistantReasoning } from "../src/utils/collaboration.js";
import { renderMarkdown } from "../src/utils/markdown.js";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
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

test("transcript cards stack time above a full-width body", () => {
  const renderer = sourceBetween(mainSource, "function renderMeetingRecords()", "function renderUnderstanding()");
  assert.match(
    renderer,
    /<article class="record-item">\s*<time>\$\{escapeHtml\(item\.time\)\}<\/time>\s*<p>\$\{escapeHtml\(item\.text\)\}<\/p>/,
    "the transcript DOM must keep time before its body"
  );

  const itemRule = cssRule(".record-item");
  assert.match(itemRule, /display:\s*flex/);
  assert.match(itemRule, /flex-direction:\s*column/);
  assert.match(itemRule, /align-items:\s*stretch/);
  assert.doesNotMatch(itemRule, /grid-template-columns/);
  assert.match(cssRule(".record-item p"), /width:\s*100%/);
});

test("AI collaboration cards use stripped, safe Markdown output", () => {
  const renderer = sourceBetween(mainSource, "function renderCollabMarkdown", "function normalizeCollabQuestions");
  const panel = sourceBetween(mainSource, "function renderAIPanel()", "function renderTimeline()");
  assert.match(renderer, /return\s+renderMarkdown\(stripAssistantReasoning\(value\)\)/);
  assert.match(panel, /renderCollabMarkdown\(item\.question\)/);
  assert.match(panel, /class="followup-markdown markdown-content"/);
  assert.doesNotMatch(panel, /\$\{\s*item\.question\s*\}/);
  assert.doesNotMatch(panel, /item\.reason/, "frontend-only reason metadata must not be rendered");
  assert.doesNotMatch(panel, /innerHTML|insertAdjacentHTML/);

  const markdown = stripAssistantReasoning(`<think>private chain of thought</think>
## 会议结论

这是**重点**段落。

- 第一项
- *第二项*

<img src=x onerror=alert(1)>`);
  const html = renderMarkdown(markdown);

  assert.doesNotMatch(markdown, /think|private chain of thought/i);
  assert.match(html, /<h2>会议结论<\/h2>/);
  assert.match(html, /<p>这是<strong>重点<\/strong>段落。<\/p>/);
  assert.match(html, /<ul><li>第一项<\/li><li><em>第二项<\/em><\/li><\/ul>/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img\b/i);
});

test("unterminated think blocks cannot leak into collaboration cards", () => {
  assert.equal(stripAssistantReasoning("保留的正文</think>"), "保留的正文");
  assert.equal(stripAssistantReasoning("<THINK data-source=\"model\">未闭合的内部推理"), "");
});
