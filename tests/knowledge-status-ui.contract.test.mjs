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

test("knowledge status markup keeps the dot, label, and pagination in dedicated containers", () => {
  const knowledgeMarkup = namedFunction("renderKnowledge");

  assert.match(knowledgeMarkup, /<span class="kb-status-heading">状态<\/span>/);
  assert.match(
    knowledgeMarkup,
    /<span class="kb-status-cell"><i class="status-dot \$\{docCallable \? "on" : "off"\}" aria-hidden="true"><\/i><span class="kb-status-label">\$\{docCallable \? "可供会议检索" : "当前未启用"\}<\/span><\/span>/
  );
  assert.match(knowledgeMarkup, /<span class="kb-pagination-total">共 \$\{visibleDocs\.length\} 条<\/span>/);
  assert.match(knowledgeMarkup, /<nav class="kb-pagination-controls" aria-label="知识库分页">/);
});

test("knowledge headers and rows share stable tracks with a centered status column", () => {
  const table = cssRule(".kb-table");
  const header = cssRule(".kb-row");
  const documentRow = cssRule(".kb-document-row");
  const rowMain = cssRule(".kb-row-main");
  const statusCell = cssRule(".kb-status-cell");
  const statusLabel = cssRule(".kb-status-label");

  assert.match(table, /--kb-data-columns:[^;]*minmax\(132px,\s*0\.65fr\)/);
  assert.match(header, /grid-template-columns:\s*var\(--kb-data-columns\)\s+var\(--kb-action-column-width\)/);
  assert.match(documentRow, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+var\(--kb-action-column-width\)/);
  assert.match(rowMain, /grid-template-columns:\s*var\(--kb-data-columns\)/);
  assert.match(header, /gap:\s*var\(--kb-column-gap\)/);
  assert.match(documentRow, /gap:\s*var\(--kb-column-gap\)/);
  assert.match(rowMain, /gap:\s*var\(--kb-column-gap\)/);
  assert.match(header, /padding:\s*0 8px 0 12px/);
  assert.match(documentRow, /padding:\s*0 8px 0 12px/);
  assert.match(stylesSource, /\.kb-status-heading,\s*\.kb-action-heading\s*\{[^}]*text-align:\s*center/);
  assert.match(statusCell, /display:\s*flex/);
  assert.match(statusCell, /align-items:\s*center/);
  assert.match(statusCell, /justify-content:\s*center/);
  assert.match(statusCell, /gap:\s*8px/);
  assert.match(statusLabel, /overflow:\s*hidden/);
  assert.match(statusLabel, /text-overflow:\s*ellipsis/);
  assert.match(statusLabel, /white-space:\s*nowrap/);
});

test("knowledge status and pagination remain contained in narrow windows", () => {
  const footer = cssRule(".kb-table footer");
  const pagination = cssRule(".kb-pagination-controls");

  assert.match(footer, /align-items:\s*center/);
  assert.match(footer, /justify-content:\s*space-between/);
  assert.match(footer, /flex-wrap:\s*wrap/);
  assert.match(pagination, /margin-left:\s*auto/);
  assert.match(pagination, /display:\s*flex/);
  assert.match(
    stylesSource,
    /@media \(max-width:\s*680px\)[\s\S]{0,520}?--kb-data-columns:\s*minmax\(0,\s*1fr\)\s+124px[\s\S]{0,520}?\.kb-updated-cell\s*\{\s*display:\s*none/
  );
  assert.match(
    stylesSource,
    /@media \(max-width:\s*480px\)[\s\S]{0,520}?--kb-data-columns:\s*minmax\(0,\s*1fr\)\s+104px[\s\S]{0,520}?\.kb-status-cell\s*\{[\s\S]{0,180}?font-size:\s*13px/
  );
});
