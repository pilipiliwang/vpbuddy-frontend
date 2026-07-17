import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const repoRoot = process.env.VPBUDDY_FRONTEND_ROOT
  ? path.resolve(process.env.VPBUDDY_FRONTEND_ROOT)
  : fileURLToPath(new URL("../", import.meta.url));
const styles = (await readFile(path.join(repoRoot, "src", "styles.css"), "utf8")).replace(/\r\n/g, "\n");

function cssRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`).exec(styles);
  assert.ok(match, `missing CSS rule: ${selector}`);
  return match[1];
}

test("login fields render the focus indicator around the whole field", () => {
  const fieldFocus = cssRule(".login-card .field:focus-within");

  assert.match(fieldFocus, /border-color:\s*rgba\([^)]+\)/);
  assert.match(fieldFocus, /box-shadow:\s*0 0 0 [^;]+/);
  assert.doesNotMatch(fieldFocus, /outline:\s*none/);
});

test("login inputs suppress only their inner focus rectangle", () => {
  const inputFocus = cssRule(".login-card .field input:focus-visible");
  const globalFocus = cssRule(
    "button:focus-visible,\ninput:focus-visible,\ntextarea:focus-visible,\nselect:focus-visible"
  );

  assert.match(inputFocus, /outline:\s*none/);
  assert.match(globalFocus, /outline:\s*2px solid/);
  assert.match(globalFocus, /outline-offset:\s*2px/);
});
