const MEETING_SCOPES = new Set([
  "meeting",
  "meeting_only",
  "meeting_material",
  "meeting_upload",
  "current_meeting",
  "session"
]);

const MEETING_RESOURCE_TYPES = new Set([
  "meeting_material",
  "meeting_upload",
  "chat_upload",
  "screenshot",
  "screen_capture",
  "vision_analysis"
]);

function normalizeMarker(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim()) || "";
}

export function isPersonalKnowledgeDocument(raw = {}) {
  const metadata = raw.metadata && typeof raw.metadata === "object" ? raw.metadata : {};
  const scope = normalizeMarker(firstValue(
    raw.scope,
    raw.resource_scope,
    raw.storage_scope,
    metadata.scope,
    metadata.resource_scope,
    metadata.storage_scope
  ));
  if (MEETING_SCOPES.has(scope) || scope.startsWith("meeting_")) return false;

  const resourceType = normalizeMarker(firstValue(
    raw.resource_type,
    raw.origin_type,
    raw.category,
    metadata.resource_type,
    metadata.origin_type,
    metadata.category
  ));
  if (MEETING_RESOURCE_TYPES.has(resourceType)) return false;

  const source = normalizeMarker(firstValue(
    raw.source,
    raw.origin,
    raw.ingest_source,
    metadata.source,
    metadata.origin,
    metadata.ingest_source
  ));
  if (/^(meeting_material|meeting_upload|material_upload|chat_upload|screenshot|screen_capture|vision_analysis)(?:_|:|$)/.test(source)) {
    return false;
  }

  const name = String(firstValue(
    raw.name,
    raw.filename,
    raw.title,
    metadata.filename,
    metadata.source,
    raw.doc_id,
    raw.id
  )).replace(/^upload:/i, "");
  if (/^vision[_-]desc[_-]/i.test(name)) return false;

  return true;
}

export function filterPersonalKnowledgeDocuments(documents) {
  return Array.isArray(documents) ? documents.filter(isPersonalKnowledgeDocument) : [];
}
