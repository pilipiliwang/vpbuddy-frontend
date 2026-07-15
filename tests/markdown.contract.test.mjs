import assert from "node:assert/strict";
import test from "node:test";

import { renderMarkdown } from "../src/utils/markdown.js";

test("Markdown renderer preserves document hierarchy and inline emphasis", () => {
  const html = renderMarkdown(`# 一级标题

## 二级标题

- **重点内容**：说明文字
- 普通列表

正文包含 \`inline code\` 和 *强调文字*。`);

  assert.match(html, /<h1>一级标题<\/h1>/);
  assert.match(html, /<h2>二级标题<\/h2>/);
  assert.match(html, /<ul><li><strong>重点内容<\/strong>：说明文字<\/li><li>普通列表<\/li><\/ul>/);
  assert.match(html, /<code>inline code<\/code>/);
  assert.match(html, /<em>强调文字<\/em>/);
});

test("Markdown renderer supports code blocks, quotes, links, tasks, and tables", () => {
  const html = renderMarkdown(`> 会议引用

- [x] 已完成
- [ ] 待处理

| 字段 | 状态 |
| --- | :---: |
| API | ready |

[后端文档](https://example.com/docs)

\`\`\`html
<script>alert(1)</script>
\`\`\``);

  assert.match(html, /<blockquote>会议引用<\/blockquote>/);
  assert.match(html, /class="markdown-task"/);
  assert.match(html, /<table>/);
  assert.match(html, /class="align-center"/);
  assert.match(html, /href="https:\/\/example\.com\/docs"/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test("Markdown renderer escapes raw HTML and rejects unsafe link schemes", () => {
  const html = renderMarkdown(`<img src=x onerror=alert(1)>

[危险链接](javascript:alert(1))`);

  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /href="javascript:/);
});

