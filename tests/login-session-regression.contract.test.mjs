import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const repoRoot = process.env.VPBUDDY_FRONTEND_ROOT
  ? path.resolve(process.env.VPBUDDY_FRONTEND_ROOT)
  : fileURLToPath(new URL("../", import.meta.url));
const mainSource = await readFile(path.join(repoRoot, "src", "main.js"), "utf8");

function namedFunction(name, nextName) {
  const start = mainSource.indexOf(`function ${name}`);
  const end = nextName ? mainSource.indexOf(`function ${nextName}`, start + 1) : mainSource.length;
  assert.ok(start >= 0, `missing function: ${name}`);
  return mainSource.slice(start, end > start ? end : mainSource.length);
}

test("logout cancels delayed UI work before returning to the login form", () => {
  const resetSource = namedFunction("resetAuthenticatedSession", "submitAuthentication");

  assert.match(resetSource, /clearTimeout\(toastTimer\)/);
  assert.match(resetSource, /clearTimeout\(knowledgeSearchTimer\)/);
  assert.match(resetSource, /meetingDetailLoadSequence\s*\+=\s*1/);
  assert.match(resetSource, /materialPreviewLoadSequence\s*\+=\s*1/);
  assert.match(resetSource, /state\.authBusy\s*=\s*false/);
  assert.match(resetSource, /state\.modal\s*=\s*""/);
});

test("login drafts survive harmless rerenders and remain editable", () => {
  assert.match(mainSource, /authPasswordDraft:\s*""/);
  assert.match(mainSource, /data-field="auth-password"[\s\S]*?value="\$\{escapeHtml\(state\.authPasswordDraft\)\}"/);
  assert.match(mainSource, /matches\("\[data-field='auth-email'\]"\)[\s\S]*?state\.authEmail\s*=\s*event\.target\.value/);
  assert.match(mainSource, /matches\("\[data-field='auth-password'\]"\)[\s\S]*?state\.authPasswordDraft\s*=\s*event\.target\.value/);
});
