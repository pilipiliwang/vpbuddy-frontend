import assert from "node:assert/strict";
import test from "node:test";
import { aggregateMaterialProcessingPhase, resolveMaterialProcessingPhases } from "../src/utils/material-upload.js";

test("material remains uploaded until a real VPBuddy parse callback arrives", () => {
  const phase = aggregateMaterialProcessingPhase(
    [{ id: "mat-1", status: "stored" }],
    [{ type: "material", materialId: "mat-1", materialStatus: "stored" }],
    ["mat-1"]
  );

  assert.equal(phase, "uploaded");
});

test("assistant parse callbacks complete or fail only their preceding material upload", () => {
  const completed = resolveMaterialProcessingPhases([], [
    { type: "material", materialId: "mat-1" },
    { type: "answer", role: "assistant", status: "completed" },
    { type: "material", materialId: "mat-2" },
    { type: "answer", role: "assistant", status: "failed" }
  ]);

  assert.equal(completed.get("mat-1"), "parsed");
  assert.equal(completed.get("mat-2"), "parse-error");
});

test("a backend material parse status takes precedence over an unfinished upload record", () => {
  const phase = aggregateMaterialProcessingPhase(
    [{ id: "mat-1", status: "parse_failed" }],
    [{ type: "material", materialId: "mat-1", materialStatus: "stored" }],
    ["mat-1"]
  );

  assert.equal(phase, "parse-error");
});
