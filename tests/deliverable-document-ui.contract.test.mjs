import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

import { renderMarkdown } from "../src/utils/markdown.js";

const repoRoot = process.env.VPBUDDY_FRONTEND_ROOT
  ? path.resolve(process.env.VPBUDDY_FRONTEND_ROOT)
  : fileURLToPath(new URL("../", import.meta.url));
const mainSource = await readFile(path.join(repoRoot, "src", "main.js"), "utf8");
const stylesSource = await readFile(path.join(repoRoot, "src", "styles.css"), "utf8");

function namedFunction(name) {
  const startPattern = new RegExp(`function\\s+${name}\\s*\\(`, "m");
  const startMatch = startPattern.exec(mainSource);
  assert.ok(startMatch, `missing function: ${name}`);
  const nextPattern = /\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g;
  nextPattern.lastIndex = startMatch.index + startMatch[0].length;
  const nextMatch = nextPattern.exec(mainSource);
  return mainSource.slice(startMatch.index, nextMatch?.index ?? mainSource.length);
}

function cssRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`).exec(stylesSource);
  assert.ok(match, `missing CSS rule: ${selector}`);
  return match[1];
}

function cssSelectors() {
  return [...stylesSource.matchAll(/(?:^|\})([^{}]+)\{/g)]
    .flatMap((match) => match[1].split(","))
    .map((selector) => selector.trim())
    .filter(Boolean);
}

test("meeting and summary document views render backend deliverable content", () => {
  const meetingDocument = namedFunction("renderDeliverableCanvas");
  const summaryDocument = namedFunction("renderSummaryDeliverable");

  assert.match(meetingDocument, /renderMarkdown\(current\.content\)/);
  assert.match(summaryDocument, /const\s+content\s*=\s*String\(item\.content\s*\|\|\s*""\)\.trim\(\)/);
  assert.match(summaryDocument, /renderMarkdown\(content\)/);
  assert.doesNotMatch(`${meetingDocument}\n${summaryDocument}`, /\bmock\b/i);
});

test("Markdown renderer preserves heading and nested list hierarchy", () => {
  const html = renderMarkdown(`# Requirements

- **Primary task**
  - Clarify the request
    1. Confirm scope
    2. Confirm owner
  - Present options
- Record the decision`);

  assert.match(html, /^<h1>Requirements<\/h1>/);
  assert.match(
    html,
    /<ul><li><strong>Primary task<\/strong><ul><li>Clarify the request<ol><li>Confirm scope<\/li><li>Confirm owner<\/li><\/ol><\/li><li>Present options<\/li><\/ul><\/li><li>Record the decision<\/li><\/ul>/
  );
});

test("summary card rules cannot leak into Markdown descendants", () => {
  const selectors = cssSelectors();
  const legacyTargets = /(?:strong|p|label|\.doc-badge)$/;

  for (const selector of selectors) {
    if (!selector.startsWith(".delivery-strip")) continue;
    assert.ok(
      !/^\.delivery-strip\s+(?:p|label)$/.test(selector),
      `broad delivery-strip selector leaks into Markdown: ${selector}`
    );
    if (!selector.includes("article") || !legacyTargets.test(selector)) continue;
    assert.match(selector, />\s*(?:strong|p|label|\.doc-badge)$/, `card metadata must be a direct child: ${selector}`);
  }

  const markdownContent = cssRule(".markdown-content");
  assert.match(markdownContent, /min-width:\s*0/);
  assert.match(markdownContent, /max-width:\s*100%/);
  assert.match(markdownContent, /overflow-wrap:\s*anywhere/);
  assert.match(markdownContent, /word-break:\s*break-word/);
  assert.match(stylesSource, /\.markdown-content li\s*>\s*ul/);
  assert.match(stylesSource, /\.markdown-content li\s*>\s*ol/);
});
