const COLLAB_CONTENT_FIELDS = ["content", "text", "question", "suggestion"];

function normalizeLineBreaks(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\\r\\n|\\n|\\r/g, "\n");
}

function readCollabContent(item) {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object" || Array.isArray(item)) return "";

  for (const field of COLLAB_CONTENT_FIELDS) {
    const value = item[field];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function formatCollabTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export function stripAssistantReasoning(value) {
  return normalizeLineBreaks(value)
    .replace(/<think\b[^>]*>[\s\S]*?<\/think\s*>/gi, "")
    .replace(/<think\b[^>]*>[\s\S]*$/gi, "")
    .replace(/<\/?think\b[^>]*>/gi, "")
    .trim();
}

export function normalizeCollabQuestions(payload) {
  const pending = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.pending)
      ? payload.pending
      : Array.isArray(payload?.data?.pending)
        ? payload.data.pending
        : [];

  return pending.map((rawItem, index) => {
    const item = rawItem && typeof rawItem === "object" && !Array.isArray(rawItem) ? rawItem : {};
    return {
      id: String(item.qid || item.id || `collab-${index + 1}`),
      time: formatCollabTime(item.asked_at || item.askedAt),
      question: stripAssistantReasoning(readCollabContent(rawItem))
    };
  }).filter((item) => item.question);
}
