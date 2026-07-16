import assert from "node:assert/strict";
import test from "node:test";

import { renderMarkdown } from "../src/utils/markdown.js";

test("AI collaboration card payload keeps heading, emphasis, and list hierarchy", () => {
  const backendMarkdown = [
    "# Generated documents",
    "",
    "## Clean transcript",
    "",
    "**Status:** ready",
    "",
    "- Summary",
    "  - Nested **decision**",
    "- Final item"
  ].join("\n");

  const html = renderMarkdown(backendMarkdown);

  assert.match(html, /<h1>Generated documents<\/h1>/);
  assert.match(html, /<h2>Clean transcript<\/h2>/);
  assert.match(html, /<p><strong>Status:<\/strong> ready<\/p>/);
  assert.match(html, /<ul><li>Summary<ul><li>Nested <strong>decision<\/strong><\/li><\/ul><\/li><li>Final item<\/li><\/ul>/);
  assert.ok(html.indexOf("<h1>") < html.indexOf("<h2>"));
  assert.ok(html.indexOf("<h2>") < html.indexOf("<ul>"));
});

test("AI collaboration detail keeps the full payload and escapes unsafe backend HTML", () => {
  const tailMarker = "DETAIL_TAIL_MUST_REMAIN_VISIBLE";
  const backendMarkdown = [
    "# Safe detail",
    "",
    "<img src=x onerror=alert(1)>",
    "",
    "- [unsafe](javascript:alert(1))",
    `- ${tailMarker}`
  ].join("\n");

  const html = renderMarkdown(backendMarkdown);

  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, new RegExp(tailMarker));
  assert.doesNotMatch(html, /<(?:img|script|iframe|style)\b/i);
  assert.doesNotMatch(html, /href=["']javascript:/i);
});
