const parsedStatuses = new Set([
  "complete",
  "completed",
  "indexed",
  "ok",
  "parsed",
  "processed",
  "ready",
  "succeeded",
  "success"
]);

const parseFailureStatuses = new Set([
  "error",
  "failed",
  "fallback",
  "parse-error",
  "parse-failed",
  "parse_error",
  "parse_failed",
  "timeout"
]);

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

export function materialProcessingPhase(status) {
  const normalized = normalizeStatus(status);
  if (parseFailureStatuses.has(normalized)) return "parse-error";
  if (parsedStatuses.has(normalized)) return "parsed";
  return "uploaded";
}

function assistantProcessingPhase(message) {
  const isAssistant = message?.type === "answer" || message?.role === "assistant";
  if (!isAssistant) return "";
  const status = normalizeStatus(message.status);
  const source = normalizeStatus(message.source);
  if (parseFailureStatuses.has(status) || source === "fallback") return "parse-error";
  if (parsedStatuses.has(status) || source === "vision-analysis") return "parsed";
  return "";
}

export function resolveMaterialProcessingPhases(materials = [], messages = [], materialIds) {
  const targetIds = materialIds ? new Set(Array.from(materialIds, String)) : null;
  const phases = new Map();

  for (const material of materials) {
    const id = String(material?.id || material?.materialId || material?.material_id || "");
    if (!id || (targetIds && !targetIds.has(id))) continue;
    phases.set(id, materialProcessingPhase(material.status));
  }

  const awaitingAssistant = [];
  for (const message of messages) {
    const materialId = String(message?.materialId || message?.material_id || "");
    const isTargetMaterial = message?.type === "material"
      && materialId
      && (!targetIds || targetIds.has(materialId));
    if (isTargetMaterial) {
      if (!phases.has(materialId)) phases.set(materialId, materialProcessingPhase(message.materialStatus));
      awaitingAssistant.push(materialId);
      continue;
    }

    if (!awaitingAssistant.length) continue;
    if (message?.type === "question" || message?.role === "user") {
      awaitingAssistant.length = 0;
      continue;
    }

    const phase = assistantProcessingPhase(message);
    if (phase) phases.set(awaitingAssistant.shift(), phase);
  }

  return phases;
}

export function aggregateMaterialProcessingPhase(materials = [], messages = [], materialIds = []) {
  const ids = Array.from(materialIds, String).filter(Boolean);
  if (!ids.length) return "uploaded";
  const phases = resolveMaterialProcessingPhases(materials, messages, ids);
  const values = ids.map((id) => phases.get(id) || "uploaded");
  if (values.includes("parse-error")) return "parse-error";
  if (values.every((phase) => phase === "parsed")) return "parsed";
  return "uploaded";
}
