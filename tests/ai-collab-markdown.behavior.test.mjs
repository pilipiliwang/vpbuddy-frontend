import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCollabQuestions } from "../src/utils/collaboration.js";
import { renderMarkdown } from "../src/utils/markdown.js";

test("AI collaboration normalizes backend content aliases and escaped line breaks", () => {
  const payload = {
    meeting_id: "meeting-real-shape",
    pending: [
      {
        qid: "from-content",
        section: "delivery",
        asked_by: "delivery-agent",
        asked_at: "2026-07-17T09:30:00Z",
        content: "# Delivery review\\n\\n## Decisions\\n\\nConfirm the **launch scope**."
      },
      {
        qid: "from-text",
        section: "quality",
        asked_by: "quality-agent",
        asked_at: "2026-07-17T09:31:00Z",
        content: "  ",
        text: "Use `npm test` before release.\\n\\n- Run checks\\n- Review output"
      },
      {
        qid: "from-question",
        section: "operations",
        asked_by: "ops-agent",
        asked_at: "2026-07-17T09:32:00Z",
        question: "Read the [runbook](https://example.com/runbook)."
      },
      {
        qid: "from-suggestion",
        section: "release",
        asked_by: "release-agent",
        asked_at: "2026-07-17T09:33:00Z",
        suggestion: "### Suggested action\\n\\nShip the verified build."
      }
    ]
  };

  const normalized = normalizeCollabQuestions(payload);
  const html = normalized.map((item) => renderMarkdown(item.question)).join("\n");

  assert.deepEqual(normalized.map((item) => item.id), [
    "from-content",
    "from-text",
    "from-question",
    "from-suggestion"
  ]);
  assert.equal(normalized[0].question, "# Delivery review\n\n## Decisions\n\nConfirm the **launch scope**.");
  assert.match(normalized[0].time, /^\d{2}:\d{2}$/);
  assert.match(html, /<h1>Delivery review<\/h1>/);
  assert.match(html, /<h2>Decisions<\/h2>/);
  assert.match(html, /<strong>launch scope<\/strong>/);
  assert.match(html, /<code>npm test<\/code>/);
  assert.match(html, /<ul><li>Run checks<\/li><li>Review output<\/li><\/ul>/);
  assert.match(html, /href="https:\/\/example\.com\/runbook"/);
  assert.match(html, /<h3>Suggested action<\/h3>/);
  assert.doesNotMatch(html, /\\n|>#{1,6}\s|\*\*launch scope\*\*/);
});

test("AI collaboration payload wrappers stay safe after normalization and Markdown rendering", () => {
  const [item] = normalizeCollabQuestions({
    data: {
      pending: [{
        id: "wrapped-content",
        text: "<think>private reasoning</think>\\n# Safe result\\n\\n<script>alert(1)</script>\\n\\n[unsafe](javascript:alert(1))\\n\\n[docs](https://example.com/docs)"
      }]
    }
  });
  const html = renderMarkdown(item.question);

  assert.doesNotMatch(item.question, /think|private reasoning/i);
  assert.match(html, /<h1>Safe result<\/h1>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /href="https:\/\/example\.com\/docs"/);
  assert.doesNotMatch(html, /<(?:script|img|iframe|style)\b/i);
  assert.doesNotMatch(html, /href=["']javascript:/i);
});

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
  ].join("\\n");

  const [item] = normalizeCollabQuestions({ pending: [{ suggestion: backendMarkdown }] });
  const html = renderMarkdown(item.question);

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
