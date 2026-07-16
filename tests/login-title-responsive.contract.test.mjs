import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const repoRoot = process.env.VPBUDDY_FRONTEND_ROOT
  ? path.resolve(process.env.VPBUDDY_FRONTEND_ROOT)
  : fileURLToPath(new URL("../", import.meta.url));
const styles = await readFile(path.join(repoRoot, "src", "styles.css"), "utf8");

test("the login product title stays on one line across desktop widths", () => {
  const rule = styles.match(/\.login-copy h1\s*\{([\s\S]*?)\}/)?.[1] || "";
  assert.match(rule, /white-space:\s*nowrap/);
  assert.match(rule, /font-size:\s*50px/);
  assert.doesNotMatch(rule, /\d(?:\.\d+)?vw/, "the title size must not depend on viewport width");
  assert.match(styles, /@media \(max-width:\s*1220px\)[\s\S]*?\.login-copy h1\s*\{[\s\S]*?font-size:\s*42px/);
  assert.match(styles, /@media \(max-width:\s*680px\)[\s\S]*?\.login-copy h1\s*\{[\s\S]*?font-size:\s*34px/);
});
