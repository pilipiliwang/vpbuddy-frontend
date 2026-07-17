import { createVpbuddyApi } from "./api/client.js";
import { connectAuthenticatedSse, createRealtimeAsrSession } from "./api/realtime.js";
import {
  normalizeCollabQuestions as normalizeCollabQuestionPayload,
  stripAssistantReasoning as normalizeAssistantMarkdown
} from "./utils/collaboration.js";
import { filterPersonalKnowledgeDocuments } from "./utils/knowledge.js";
import { aggregateMaterialProcessingPhase, resolveMaterialProcessingPhases } from "./utils/material-upload.js";
import { renderMarkdown } from "./utils/markdown.js";
import { createTranscriptRecordStore, reconcileTranscriptRecords } from "./utils/transcript.js";
import { createZipBlob } from "./utils/zip.js";

const app = document.querySelector("#app");
const defaultApiBaseUrl = "http://47.100.182.3:28765";
const apiBaseUrl = window.localStorage?.getItem("vpbuddy.apiBaseUrl") || window.VPBUDDY_API_BASE_URL || defaultApiBaseUrl;
const authTokenKey = "vpbuddy.authToken";
const authEmailKey = "vpbuddy.authEmail";
const meetingStatusStorageKey = "vpbuddy.meetingStatuses";
const getAuthToken = () => window.localStorage?.getItem(authTokenKey) || "";
const clientLogEntries = [];
const maxClientLogEntries = 500;
const meetingStatusCache = readMeetingStatusCache();
const api = createVpbuddyApi({
  baseUrl: apiBaseUrl,
  getToken: getAuthToken,
  onUnauthorized: () => resetAuthenticatedSession("登录已失效，请重新登录。"),
  onDiagnostic: ({ level, message, details }) => recordClientLog(level, message, details)
});

const state = {
  view: "login",
  authMode: "login",
  authBusy: false,
  authError: "",
  authEmail: window.localStorage?.getItem(authEmailKey) || "",
  showAccountMenu: false,
  showCreate: false,
  stageTab: "presentation",
  stageFullscreen: false,
  meetingDetailLoading: false,
  loadedMeetingDetailId: "",
  meetingLeftTab: "records",
  deliverableLeftTab: "deliverables",
  selectedKnowledge: "",
  selectedMeetingId: "",
  meetingTitleEditing: false,
  meetingTitleDraft: "",
  meetingTitleSaving: false,
  meetingTitleSelectOnFocus: false,
  selectedMaterial: "",
  selectedDeliverable: "",
  selectedDemoVersion: "",
  demoVersionPinned: false,
  demoVersionMessage: "",
  selectedFollowup: "",
  selectedExplanation: "",
  currentSlide: 1,
  activeTool: "cursor",
  annotationColor: "#2f8cff",
  penSize: 4,
  annotations: [],
  annotationUndoStack: [],
  annotationRedoStack: [],
  drawingAnnotationId: "",
  textDraft: null,
  composerText: "",
  chatBusy: false,
  showComposerHistory: false,
  vpbuddyMessages: [],
  fileUploadContext: "material",
  knowledgeCallable: {},
  knowledgeSearch: "",
  knowledgeLoaded: false,
  knowledgeTotal: null,
  knowledgeMessage: "",
  uploadProgress: null,
  presentationUrl: "",
  presentationMime: "",
  presentationName: "",
  presentationText: "",
  presentationLoading: false,
  presentationError: "",
  presentationPdfPageCount: 0,
  presentationPdfError: "",
  recordingStatus: "idle",
  recordingStartedAt: 0,
  recordingElapsed: 0,
  recordingMessage: "尚未开始录制",
  endingMeeting: false,
  pendingDeleteMeetingId: "",
  pendingDeleteKnowledgeId: "",
  deletingKnowledgeId: "",
  downloadBusyId: "",
  downloadBusyMode: "",
  downloadProgress: null,
  showDeliverableDownloadMenu: false,
  apiBaseUrl,
  settings: {
    apiKey: "",
    modelPreset: "minimax-m3",
    provider: "minimax",
    model: "MiniMax-M3",
    endpoint: "https://api.minimax.chat/v1",
    apiKeyEnv: "MINIMAX_API_KEY",
    apiKeyConfigured: false,
    status: "idle",
    message: "尚未测试连接"
  },
  apiStatus: "idle",
  apiMessage: "尚未登录",
  zoom: 100,
  toast: "",
  modal: ""
};

let toastTimer = 0;
let meetingEventSource = null;
let realtimeAsrSession = null;
let recordingTimer = 0;
let knowledgeSearchTimer = 0;
let meetingDetailLoadSequence = 0;
let materialPreviewLoadSequence = 0;
let meetingMaterialsRevision = 0;
let vpbuddyChatRequestSequence = 0;
let presentationPreviewBlob = null;
let pdfRendererModulePromise = null;
let html2canvasModulePromise = null;
let pdfResizeTimer = 0;
let pdfPreviewRuntime = createEmptyPdfPreviewRuntime();
const pendingVpbuddyChatRequests = new Map();
const materialPreviewDownloadCache = new Map();

const user = {
  name: "VPBuddy 用户",
  organization: "",
  role: ""
};

const meetings = [];
const materials = [];
const timeline = [];
const meetingRecords = [];
const meetingUnderstanding = [];
const transcriptRecordStore = createTranscriptRecordStore({
  storage: window.localStorage,
  onStorageError: ({ operation, error }) => recordClientLog("warn", "Local transcript storage failed", {
    operation,
    message: error?.message || "unknown"
  })
});
const liveTranscriptIdsByMeeting = new Map();

const aiFollowupQuestions = [];
const deliverables = [];
const demoVersions = [];
const conceptSources = [];

const deliverableArchiveSpecs = [
  { kind: "req", label: "需求文档", filename: "需求文档.md" },
  { kind: "arch", label: "架构文档", filename: "架构文档.md" },
  { kind: "tasks", label: "任务拆解", filename: "任务拆解.md" },
  { kind: "api", label: "API设计", filename: "API设计.md" },
  { kind: "risk", label: "风险分析", filename: "风险分析.md" },
  { kind: "demo", label: "Demo", filename: "Demo.html" }
];

const explanationFindings = [];
const knowledgeDocs = [];
const knowledgePreviewSnippets = {};

const modelPresets = [
  { id: "minimax-m3", provider: "minimax", label: "MiniMax · MiniMax-M3", model: "MiniMax-M3", baseUrl: "https://api.minimax.chat/v1", apiKeyEnv: "MINIMAX_API_KEY" },
  { id: "deepseek-chat", provider: "deepseek", label: "DeepSeek · Chat", model: "deepseek-chat", baseUrl: "https://api.deepseek.com/v1", apiKeyEnv: "DEEPSEEK_API_KEY" },
  { id: "deepseek-reasoner", provider: "deepseek", label: "DeepSeek · Reasoner", model: "deepseek-reasoner", baseUrl: "https://api.deepseek.com/v1", apiKeyEnv: "DEEPSEEK_API_KEY" },
  { id: "qwen-plus", provider: "dashscope", label: "Qwen · Plus", model: "qwen-plus", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", apiKeyEnv: "DASHSCOPE_API_KEY" },
  { id: "qwen-max", provider: "dashscope", label: "Qwen · Max", model: "qwen-max", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", apiKeyEnv: "DASHSCOPE_API_KEY" },
  { id: "openai-gpt-4.1", provider: "openai", label: "OpenAI · GPT-4.1", model: "gpt-4.1", baseUrl: "https://api.openai.com/v1", apiKeyEnv: "OPENAI_API_KEY" },
  { id: "openai-gpt-4o", provider: "openai", label: "OpenAI · GPT-4o", model: "gpt-4o", baseUrl: "https://api.openai.com/v1", apiKeyEnv: "OPENAI_API_KEY" },
  { id: "openai-o3", provider: "openai", label: "OpenAI · o3", model: "o3", baseUrl: "https://api.openai.com/v1", apiKeyEnv: "OPENAI_API_KEY" },
  { id: "kimi-32k", provider: "moonshot", label: "Kimi · Moonshot v1 32k", model: "moonshot-v1-32k", baseUrl: "https://api.moonshot.cn/v1", apiKeyEnv: "MOONSHOT_API_KEY" },
  { id: "glm-4", provider: "zhipu", label: "智谱 · GLM-4", model: "glm-4", baseUrl: "https://open.bigmodel.cn/api/paas/v4", apiKeyEnv: "ZHIPUAI_API_KEY" }
];

const todoItems = [];

const uiVisibility = Object.freeze({
  settingsNavigation: false,
  knowledgeDetailPanel: false,
  explanationMaterials: false,
  meetingUnderstandingTab: false,
  meetingMaterialUploadButton: false
});

const navItems = [
  ["workspace", "工作台", "grid"],
  ["knowledge", "知识库", "book"],
  ["settings", "设置", "settings"]
].filter(([view]) => view !== "settings" || uiVisibility.settingsNavigation);

const iconPaths = {
  arrowLeft: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M4 4v15.5"/><path d="M20 4v18"/><path d="M6.5 2H20v15H6.5A2.5 2.5 0 0 0 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
  bot: '<path d="M12 8V4H8"/><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M9 14h.01"/><path d="M15 14h.01"/><path d="M9 18h6"/>',
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/>',
  camera: '<path d="M14.5 4 13 2H9L7.5 4H5a3 3 0 0 0-3 3v11a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3Z"/><circle cx="12" cy="13" r="4"/><path d="M18 8h.01"/>',
  check: '<path d="m20 6-11 11-5-5"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><rect x="2" y="2" width="13" height="13" rx="2"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h8"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  invite: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  maximize: '<path d="M15 3h6v6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/><path d="M9 21H3v-6"/>',
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8"/><path d="M12 16v4"/>',
  pen: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15.4 6.4L3 16"/><path d="M3 21v-5h5"/><path d="M3 12A9 9 0 0 1 18.4 5.6L21 8"/><path d="M21 3v5h-5"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  settings: '<path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.66V21a2 2 0 1 1-4 0v-.09a1.8 1.8 0 0 0-1.1-1.66 1.8 1.8 0 0 0-1.98.36l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.66-1.1H3a2 2 0 1 1 0-4h.09A1.8 1.8 0 0 0 4.75 8.8a1.8 1.8 0 0 0-.36-1.98l-.06-.06A2 2 0 1 1 7.16 3.9l.06.06a1.8 1.8 0 0 0 1.98.36h.01A1.8 1.8 0 0 0 10.3 2.7V3a2 2 0 1 1 4 0v-.09a1.8 1.8 0 0 0 1.1 1.66 1.8 1.8 0 0 0 1.98-.36l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.8 1.8 0 0 0-.36 1.98v.01a1.8 1.8 0 0 0 1.66 1.1H21a2 2 0 1 1 0 4h-.09A1.8 1.8 0 0 0 19.4 15Z"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4"/><path d="m15.4 6.5-6.8 4"/>',
  sparkle: '<path d="M12 3 9.8 8.8 4 11l5.8 2.2L12 19l2.2-5.8L20 11l-5.8-2.2Z"/><path d="M19 3v4"/><path d="M21 5h-4"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2v2"/><path d="m19 6-1 14c-.1 1.1-1 2-2 2H8c-1 0-1.9-.9-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h9a7 7 0 0 1 7 7v4"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9h-9a7 7 0 0 0-7 7v4"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  user: '<path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/>',
  zoom: '<path d="M5 12h14"/><path d="M12 5v14"/>'
};

function icon(name, size = 20) {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name] || ""}</svg>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}

function sanitizeLogDetails(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack || ""
    };
  }
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeLogDetails(item, seen));

  const result = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = /authorization|password|token|api[_-]?key|secret/i.test(key)
      ? "[REDACTED]"
      : sanitizeLogDetails(item, seen);
  }
  return result;
}

function recordClientLog(level, message, details = {}) {
  clientLogEntries.push({
    timestamp: new Date().toISOString(),
    level: level || "info",
    message: String(message || ""),
    details: sanitizeLogDetails(details)
  });
  if (clientLogEntries.length > maxClientLogEntries) {
    clientLogEntries.splice(0, clientLogEntries.length - maxClientLogEntries);
  }
}

function readMeetingStatusCache() {
  try {
    const parsed = JSON.parse(window.localStorage?.getItem(meetingStatusStorageKey) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function meetingStatusCacheId(meetingId) {
  return `${state.authEmail || "anonymous"}:${meetingId}`;
}

function getRememberedMeetingStatus(meetingId) {
  const entry = meetingStatusCache[meetingStatusCacheId(meetingId)];
  return typeof entry === "string" ? entry : entry?.status || "";
}

function rememberMeetingStatus(meetingId, status) {
  if (!meetingId || !status) return;
  meetingStatusCache[meetingStatusCacheId(meetingId)] = {
    status,
    updated_at: new Date().toISOString()
  };
  window.localStorage?.setItem(meetingStatusStorageKey, JSON.stringify(meetingStatusCache));
}

function forgetMeetingStatus(meetingId) {
  if (!meetingId) return;
  delete meetingStatusCache[meetingStatusCacheId(meetingId)];
  window.localStorage?.setItem(meetingStatusStorageKey, JSON.stringify(meetingStatusCache));
}

function downloadClientLog() {
  recordClientLog("info", "Client log exported", {
    view: state.view,
    meeting_id: state.selectedMeetingId || null
  });

  const generatedAt = new Date();
  const payload = {
    format_version: 1,
    generated_at: generatedAt.toISOString(),
    application: {
      name: "VPBuddy",
      desktop: Boolean(window.VPBUDDY_DESKTOP),
      page: `${window.location.origin}${window.location.pathname}`,
      user_agent: navigator.userAgent,
      language: navigator.language,
      viewport: { width: window.innerWidth, height: window.innerHeight }
    },
    account: {
      email: state.authEmail || user.name || ""
    },
    backend: {
      base_url: state.apiBaseUrl,
      status: state.apiStatus,
      message: state.apiMessage
    },
    session: {
      view: state.view,
      meeting_id: state.selectedMeetingId || null,
      recording_status: state.recordingStatus,
      recording_elapsed_seconds: state.recordingElapsed,
      meeting_count: meetings.length,
      material_count: materials.length,
      deliverable_count: deliverables.length
    },
    events: clientLogEntries
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = generatedAt.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
  link.href = url;
  link.download = `VPBuddy-client-${stamp}.log`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  state.showAccountMenu = false;
  setToast("Log 已下载");
  render();
}

window.addEventListener("error", (event) => {
  recordClientLog("error", "Unhandled window error", {
    message: event.message,
    source: event.filename,
    line: event.lineno,
    column: event.colno,
    error: event.error
  });
});

window.addEventListener("unhandledrejection", (event) => {
  recordClientLog("error", "Unhandled promise rejection", { reason: event.reason });
});

recordClientLog("info", "VPBuddy client started", {
  desktop: Boolean(window.VPBUDDY_DESKTOP),
  api_base_url: apiBaseUrl
});

function logo(compact = false) {
  return `
    <div class="brand ${compact ? "brand-compact" : ""}">
      <div class="brand-mark"><span></span></div>
      <strong>VPBuddy</strong>
    </div>
  `;
}

function docBadge(type) {
  const labelMap = { ppt: "P", pdf: "PDF", word: "W", excel: "X", image: "IMG", demo: "D", task: "T", code: "</>", api: "API" };
  return `<span class="doc-badge doc-${type}">${labelMap[type] || "F"}</span>`;
}

function setToast(message, closeModal = true) {
  if (toastTimer) window.clearTimeout(toastTimer);
  state.toast = message;
  if (closeModal) state.modal = "";
  toastTimer = window.setTimeout(() => {
    if (state.toast === message) {
      state.toast = "";
      render();
    }
  }, 2600);
}

function syncDomAttributes(current, next) {
  for (const attribute of Array.from(current.attributes)) {
    if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
  }
  for (const attribute of Array.from(next.attributes)) {
    if (current.getAttribute(attribute.name) !== attribute.value) current.setAttribute(attribute.name, attribute.value);
  }
}

function patchDomNode(current, next) {
  if (!current || !next || current.nodeType !== next.nodeType) {
    current?.replaceWith(next.cloneNode(true));
    return;
  }
  if (current.nodeType === Node.TEXT_NODE || current.nodeType === Node.COMMENT_NODE) {
    if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
    return;
  }
  if (!(current instanceof Element) || !(next instanceof Element) || current.tagName !== next.tagName) {
    current.replaceWith(next.cloneNode(true));
    return;
  }

  const stableStageSurface = current.dataset.stableStageSurface;
  if (
    stableStageSurface
    && stableStageSurface === next.dataset.stableStageSurface
    && current.dataset.stableStageSource === next.dataset.stableStageSource
  ) {
    syncDomAttributes(current, next);
    return;
  }

  const stableFrameKey = current.dataset.stableDemoFrame;
  if (
    current.tagName === "IFRAME"
    && stableFrameKey
    && stableFrameKey === next.dataset.stableDemoFrame
    && current.getAttribute("src") === next.getAttribute("src")
  ) {
    syncDomAttributes(current, next);
    return;
  }

  syncDomAttributes(current, next);
  patchDomChildren(current, next);

  if (current instanceof HTMLInputElement && next instanceof HTMLInputElement) {
    if (current.value !== next.value) current.value = next.value;
    current.checked = next.checked;
  } else if (current instanceof HTMLTextAreaElement && next instanceof HTMLTextAreaElement) {
    if (current.value !== next.value) current.value = next.value;
  } else if (current instanceof HTMLSelectElement && next instanceof HTMLSelectElement) {
    if (current.value !== next.value) current.value = next.value;
  }
}

function patchDomChildren(currentParent, nextParent) {
  const nextChildren = Array.from(nextParent.childNodes);
  nextChildren.forEach((nextChild, index) => {
    const currentChild = currentParent.childNodes[index];
    if (!currentChild) currentParent.appendChild(nextChild.cloneNode(true));
    else patchDomNode(currentChild, nextChild);
  });
  while (currentParent.childNodes.length > nextChildren.length) {
    currentParent.lastChild.remove();
  }
}

function updateAppMarkup(nextMarkup) {
  const template = document.createElement("template");
  template.innerHTML = nextMarkup;
  const stableStageSurfaces = Array.from(app.querySelectorAll("[data-stable-stage-surface]"));
  const canPreserveStageSurface = stableStageSurfaces.some((currentSurface) => {
    const key = currentSurface.dataset.stableStageSurface;
    const source = currentSurface.dataset.stableStageSource;
    const nextSurface = Array.from(template.content.querySelectorAll("[data-stable-stage-surface]"))
      .find((candidate) => candidate.dataset.stableStageSurface === key);
    return nextSurface && source === nextSurface.dataset.stableStageSource;
  });
  const stableFrames = Array.from(app.querySelectorAll("iframe[data-stable-demo-frame]"));
  const canPreserveFrame = stableFrames.some((currentFrame) => {
    const key = currentFrame.dataset.stableDemoFrame;
    const nextFrame = Array.from(template.content.querySelectorAll("iframe[data-stable-demo-frame]"))
      .find((candidate) => candidate.dataset.stableDemoFrame === key);
    return nextFrame && currentFrame.getAttribute("src") === nextFrame.getAttribute("src");
  });
  const preserveFullscreenElement = Boolean(document.fullscreenElement && app.contains(document.fullscreenElement));
  if (canPreserveFrame || preserveFullscreenElement || canPreserveStageSurface) patchDomChildren(app, template.content);
  else app.innerHTML = nextMarkup;
}

function render() {
  const views = {
    login: renderLogin,
    workspace: renderWorkspace,
    meeting: renderMeetingStage,
    summary: renderSummary,
    knowledge: renderKnowledge,
    settings: renderSettings
  };

  updateAppMarkup(`${(views[state.view] || renderWorkspace)()}${renderToast()}${renderActionModal()}`);
  ensureFilePicker();
  requestAnimationFrame(() => {
    updateAnnotationViewport();
    void ensurePdfPreviewMounted();
    if (state.meetingTitleEditing && !state.meetingTitleSaving) {
      const titleInput = document.querySelector(".stage-title-input");
      if (titleInput) {
        titleInput.focus();
        if (state.meetingTitleSelectOnFocus) {
          titleInput.select();
          state.meetingTitleSelectOnFocus = false;
        }
      }
    }
    if (state.textDraft) {
      const input = document.querySelector(".annotation-text-input");
      input?.focus();
    }
    const composerHistory = document.querySelector(".composer-history");
    if (composerHistory) composerHistory.scrollTop = composerHistory.scrollHeight;
  });
}

function renderFilePicker() {
  return `<input class="native-file-input" data-stable-file-picker type="file" multiple accept=".ppt,.pptx,.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" />`;
}

function ensureFilePicker() {
  let input = document.querySelector(".native-file-input[data-stable-file-picker]");
  if (input) return input;
  const template = document.createElement("template");
  template.innerHTML = renderFilePicker();
  input = template.content.firstElementChild;
  document.body.appendChild(input);
  return input;
}

function openFilePicker(context, accept) {
  if (isUploadInProgress()) return false;
  const input = ensureFilePicker();
  state.fileUploadContext = context;
  input.dataset.context = context;
  input.dataset.meetingId = state.selectedMeetingId || "";
  input.accept = accept;
  input.value = "";
  input.click();
  return true;
}

function nowTime() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function pushVpbuddyMessage(text, type = "question") {
  addVpbuddyMessage({ id: createAnnotationId(), time: nowTime(), text, type });
  state.showComposerHistory = true;
}

function isVpbuddyChatBusy(meetingId = state.selectedMeetingId) {
  return Boolean(meetingId && pendingVpbuddyChatRequests.has(meetingId));
}

function updateVpbuddyMessage(messageId, patch) {
  const message = state.vpbuddyMessages.find((item) => item.id === messageId);
  if (!message) return null;
  Object.assign(message, patch);
  return message;
}

function removeVpbuddyMessage(messageId) {
  const index = state.vpbuddyMessages.findIndex((item) => item.id === messageId);
  if (index < 0) return false;
  state.vpbuddyMessages.splice(index, 1);
  return true;
}

function restorePendingVpbuddyMessage(meetingId) {
  const request = pendingVpbuddyChatRequests.get(meetingId);
  if (!request?.message) return false;
  addVpbuddyMessage(request.message);
  state.showComposerHistory = true;
  return true;
}

function getVpbuddyMessageKey(message) {
  if (message?.type === "material" && message?.materialId) return `material:${message.materialId}`;
  if (message?.id) return `id:${message.id}`;
  return `fallback:${message?.type || ""}:${message?.time || ""}:${message?.text || ""}`;
}

function addVpbuddyMessage(message) {
  if (!message?.text) return false;
  const key = getVpbuddyMessageKey(message);
  if (state.vpbuddyMessages.some((item) => getVpbuddyMessageKey(item) === key)) return false;
  state.vpbuddyMessages.push(message);
  return true;
}

function dedupeVpbuddyMessages(messages) {
  const seen = new Set();
  return messages.filter((message) => {
    if (!message?.text) return false;
    const key = getVpbuddyMessageKey(message);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getKnowledgeDocsForCurrentTab() {
  return knowledgeDocs;
}

function getSelectedKnowledgeDoc() {
  const visibleDocs = getKnowledgeDocsForCurrentTab();
  return visibleDocs.find((item) => item.id === state.selectedKnowledge) || visibleDocs[0] || null;
}

function isKnowledgeCallable(doc) {
  if (!doc) return false;
  return state.knowledgeCallable[doc.id] !== false;
}

function upsertMeeting(meeting) {
  const index = meetings.findIndex((item) => item.id === meeting.id);
  if (index >= 0) meetings[index] = { ...meetings[index], ...meeting };
  else meetings.unshift(meeting);
}

function replaceArray(target, next) {
  target.splice(0, target.length, ...next);
}

function restoreTranscriptRecords(meetingId) {
  replaceArray(meetingRecords, transcriptRecordStore.read(meetingId));
}

function cacheTranscriptRecords(meetingId, records = meetingRecords, options) {
  if (!meetingId) return;
  transcriptRecordStore.write(meetingId, records, options);
}

function applyTranscriptSnapshot(nextRecords, meetingId = state.selectedMeetingId) {
  if (!meetingId) return false;
  const currentRecords = meetingId === state.selectedMeetingId
    ? meetingRecords
    : transcriptRecordStore.read(meetingId);
  const reconciled = reconcileTranscriptRecords(currentRecords, nextRecords);
  cacheTranscriptRecords(meetingId, reconciled);
  if (meetingId !== state.selectedMeetingId || reconciled === meetingRecords) return false;
  replaceArray(meetingRecords, reconciled);
  return true;
}

function getSelectedMeeting() {
  return meetings.find((item) => item.id === state.selectedMeetingId) || meetings[0];
}

function normalizeStatus(value, fallback = "已结束") {
  const status = String(value || "").toLowerCase();
  if (["running", "active", "recording", "streaming", "in_progress", "live", "open", "进行中"].some((item) => status.includes(item))) return "进行中";
  if (["done", "ended", "closed", "user_closed", "archived", "complete", "已结束"].some((item) => status.includes(item))) return "已结束";
  if (["ready", "available", "generated"].some((item) => status.includes(item))) return "已完成";
  if (["generating", "pending", "draft"].some((item) => status.includes(item))) return "生成中";
  if (["missing", "not_found"].some((item) => status.includes(item))) return "待生成";
  if (["failed", "error"].some((item) => status.includes(item))) return "生成失败";
  return fallback;
}

function formatBackendDateTime(value, fallback = "") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function normalizeMeeting(raw, index = 0) {
  const stateData = raw.state || {};
  const id = raw.id || raw.meeting_id || stateData.meeting_id || `mtg-${index + 1}`;
  const title = raw.title || raw.name || raw.projectName || raw.project_name || stateData.title || stateData.project_name || `会议 ${index + 1}`;
  const desc = raw.desc || raw.description || raw.objective || stateData.objective || "会议协同与交付生成";
  const timeValue = raw.time || raw.startedAt || raw.started_at || raw.createdAt || raw.created_at;
  const time = formatBackendDateTime(timeValue, "时间待后端更新");
  const explicitStatus = raw.status || raw.phase || raw.lifecycle_status || raw.meeting_status || stateData.status;
  const hasClosedMarker = Boolean(
    raw.closed_at || raw.closedAt || raw.ended_at || raw.endedAt || raw.archived_at || raw.archivedAt
    || stateData.closed_at || stateData.ended_at || raw.closed === true || raw.is_closed === true
  );
  const rememberedStatus = getRememberedMeetingStatus(id);
  return {
    id,
    title,
    desc,
    time,
    status: hasClosedMarker ? "已结束" : normalizeStatus(explicitStatus, rememberedStatus || "已结束"),
    cover: raw.cover || ""
  };
}

function normalizeMeetingsResponse(payload) {
  const list = Array.isArray(payload) ? payload : payload?.meetings || payload?.items || payload?.data || [];
  return list.map(normalizeMeeting);
}

function normalizeMaterialType(value) {
  const type = String(value || "").toLowerCase();
  if (["ppt", "pptx", "presentation"].includes(type)) return "ppt";
  if (["doc", "docx", "word"].includes(type)) return "word";
  if (["xls", "xlsx", "excel"].includes(type)) return "excel";
  if (["png", "jpg", "jpeg", "webp", "image"].includes(type)) return "image";
  if (type === "pdf") return "pdf";
  return type || "demo";
}

function normalizeMaterial(raw, index = 0) {
  const name = raw.name || raw.filename || raw.title || `Material ${index + 1}`;
  return {
    id: raw.id || raw.material_id || `mat-${index + 1}`,
    name,
    type: normalizeMaterialType(raw.type || raw.file_type || name.split(".").pop()),
    contentType: raw.content_type || raw.contentType || raw.mime_type || raw.mimeType || raw.metadata?.content_type || "",
    size: raw.sizeLabel || raw.size_label || formatFileSize(Number(raw.size || raw.size_bytes || 0)),
    time: formatBackendDateTime(raw.time || raw.created_at || raw.createdAt || raw.updated_at, nowTime()),
    version: raw.version || "V1.0",
    status: raw.status || "stored"
  };
}

function normalizeMaterialsResponse(payload) {
  const candidates = [
    payload,
    payload?.materials,
    payload?.items,
    payload?.data?.materials,
    payload?.data?.items,
    payload?.data
  ];
  const list = candidates.find(Array.isArray) || [];
  return list.map(normalizeMaterial);
}

function normalizeUploadedMaterialResponse(payload, index = 0) {
  const raw = payload?.material ?? payload?.data?.material ?? payload?.data ?? payload;
  return normalizeMaterial(raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}, index);
}

function mergeMaterials(refreshedMaterials, uploadedMaterials) {
  const merged = [];
  const indexes = new Map();
  for (const material of [...uploadedMaterials, ...refreshedMaterials]) {
    if (!material?.id) continue;
    const existingIndex = indexes.get(material.id);
    if (existingIndex === undefined) {
      indexes.set(material.id, merged.length);
      merged.push(material);
      continue;
    }
    const existing = merged[existingIndex];
    merged[existingIndex] = {
      ...existing,
      ...material,
      contentType: material.contentType || existing.contentType,
      name: material.name || existing.name,
      status: material.status || existing.status
    };
  }
  return merged;
}

function normalizeKnowledgeDoc(raw, index = 0) {
  const metadata = raw.metadata || {};
  const rawName = raw.name || raw.filename || raw.title || metadata.source || metadata.filename || raw.doc_id || raw.id || `Knowledge ${index + 1}`;
  const name = String(rawName).replace(/^upload:/, "");
  return {
    id: raw.id || raw.doc_id || raw.document_id || `kb-${index + 1}`,
    name,
    type: normalizeMaterialType(raw.type || raw.file_type || raw.kind || metadata.file_ext || name.split(".").pop()),
    size: raw.sizeLabel || raw.size_label || formatFileSize(Number(raw.size || raw.size_bytes || raw.bytes || metadata.file_size || 0)),
    updated: formatBackendDateTime(raw.updated || raw.updated_at || raw.created_at || raw.createdAt || metadata.uploaded_at, ""),
    meetingCallable: String(metadata.meeting_callable ?? "true").toLowerCase() !== "false",
    scope: metadata.scope || "personal_kb",
    labels: metadata.labels || "",
    preview: raw.document || ""
  };
}

function normalizeKnowledgeResponse(payload) {
  const list = Array.isArray(payload) ? payload : payload?.docs || payload?.documents || payload?.files || payload?.items || payload?.data || [];
  return filterPersonalKnowledgeDocuments(list).map(normalizeKnowledgeDoc);
}

function secondsToTime(seconds) {
  if (!Number.isFinite(Number(seconds))) return nowTime();
  const total = Math.max(0, Math.floor(Number(seconds)));
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function normalizeTranscriptSegment(segment, index = 0) {
  const speakerId = segment.speaker_id || segment.speakerId || "";
  const speaker = segment.speaker_name || segment.speaker || segment.name || (speakerId && speakerId !== "UNKNOWN" ? `说话人 ${speakerId}` : "待识别说话人");
  const text = segment.text || segment.cleaned_text || segment.content || segment.message || "";
  const tone = speaker.includes("AI") ? "ai" : speaker.includes("客户") || speaker.includes("甲方") ? "customer" : index === 0 ? "host" : "team";
  return {
    time: segment.time || secondsToTime(
      segment.start_sec
      ?? segment.startSec
      ?? (segment.begin_time !== undefined ? Number(segment.begin_time) / 1000 : index * 15)
    ),
    speaker,
    role: segment.role || (tone === "customer" ? "甲方" : tone === "ai" ? "系统" : "乙方"),
    tone,
    text
  };
}

function normalizeTranscriptResponse(payload) {
  const list = Array.isArray(payload) ? payload : payload?.segments || payload?.transcript_segments || [];
  return list.map(normalizeTranscriptSegment).filter((item) => item.text);
}

function normalizeDeliverableType(kind) {
  const value = String(kind || "").toLowerCase();
  const map = {
    req: "word",
    requirements: "word",
    summary: "word",
    arch: "code",
    architecture: "code",
    tasks: "task",
    task: "task",
    risk: "task",
    api: "api",
    demo: "demo"
  };
  return map[value] || value || "word";
}

function canonicalDeliverableKind(kind) {
  const value = String(kind || "").toLowerCase();
  const aliases = {
    requirements: "req",
    requirement: "req",
    architecture: "arch",
    task: "tasks"
  };
  return aliases[value] || value;
}

function normalizeVersionLabel(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.toUpperCase().startsWith("V") ? text.toUpperCase() : `V${text}`;
}

function normalizeDeliverableStatus(value) {
  const status = String(value || "").toLowerCase();
  if (["ready", "available", "generated", "complete", "completed", "stored", "已完成"].some((item) => status.includes(item))) return "已完成";
  if (["generating", "pending", "draft"].some((item) => status.includes(item))) return "生成中";
  if (["missing", "not_found"].some((item) => status.includes(item))) return "待生成";
  if (["failed", "error"].some((item) => status.includes(item))) return "生成失败";
  return value || "待生成";
}

function normalizeDeliverable(raw, index = 0) {
  const kind = raw.kind || raw.type || raw.doc_kind;
  const labels = { req: "需求清单", requirements: "需求清单", arch: "技术方案", architecture: "技术方案", tasks: "任务拆解", risk: "风险清单", api: "API设计", demo: "交互 Demo", summary: "会议纪要" };
  const id = raw.id || raw.deliverableId || raw.deliverable_id || `del-${state.selectedMeetingId}-${kind || index + 1}`;
  return {
    id,
    kind,
    name: raw.name || raw.label || labels[kind] || `交付物 ${index + 1}`,
    subtitle: raw.subtitle || raw.description || "后端生成文档",
    type: normalizeDeliverableType(kind),
    status: normalizeDeliverableStatus(raw.status),
    time: formatBackendDateTime(raw.updatedAt || raw.updated_at || raw.createdAt || raw.created_at, nowTime()),
    version: normalizeVersionLabel(raw.version) || "V1.0",
    desc: raw.desc || raw.description || raw.path || "由后端文档生成接口返回。",
    content: raw.content || ""
  };
}

function normalizeDeliverablesResponse(payload) {
  const list = Array.isArray(payload) ? payload : payload?.deliverables || payload?.docs || payload?.items || [];
  return list.map(normalizeDeliverable);
}

function getOrderedDeliverables() {
  const order = new Map(["demo", "req", "arch", "tasks", "api", "risk"].map((kind, index) => [kind, index]));
  return deliverables
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const leftOrder = order.get(canonicalDeliverableKind(left.item.kind)) ?? order.size;
      const rightOrder = order.get(canonicalDeliverableKind(right.item.kind)) ?? order.size;
      return leftOrder - rightOrder || left.index - right.index;
    })
    .map(({ item }) => item);
}

function getDefaultDeliverable() {
  return deliverables.find((item) => item.kind === "demo") || deliverables[0] || null;
}

function getSelectedDeliverable() {
  return deliverables.find((item) => item.id === state.selectedDeliverable) || getDefaultDeliverable();
}

function normalizeDemoVersion(raw) {
  const version = Number(raw?.version);
  if (!Number.isFinite(version)) return null;
  const fallbackFile = `demo_v${version}.html`;
  const file = String(raw?.file || fallbackFile).trim().split(/[\\/]/).pop() || fallbackFile;
  const versionText = Number.isInteger(version) ? String(version) : String(version).replace(/0+$/, "").replace(/\.$/, "");
  const label = `V${versionText}`;
  const explicitName = [
    raw?.version_name,
    raw?.versionName,
    raw?.display_name,
    raw?.displayName,
    raw?.name,
    raw?.title
  ].map((value) => String(value || "").replace(/\s+/g, " ").trim()).find(Boolean) || "";
  const rawLabel = String(raw?.label || "").replace(/\s+/g, " ").trim();
  const summary = String(raw?.summary || "").replace(/\s+/g, " ").trim();
  const backendName = explicitName || (rawLabel && rawLabel.toUpperCase() !== label.toUpperCase() ? rawLabel : "") || summary;
  const displayLabel = backendName
    ? (/^v(?:ersion\s*)?\d/i.test(backendName) ? backendName : `${label} · ${backendName}`)
    : label;
  return {
    version,
    label,
    displayLabel,
    summary: summary || backendName || `Demo 版本 ${version}`,
    createdAt: raw?.created_at || raw?.createdAt || "",
    fileSize: Number(raw?.file_size || raw?.fileSize || 0),
    file
  };
}

function normalizeDemoVersionsResponse(payload) {
  const list = Array.isArray(payload) ? payload : payload?.versions || [];
  const seen = new Set();
  return list
    .map(normalizeDemoVersion)
    .filter((item) => {
      if (!item || seen.has(item.version)) return false;
      seen.add(item.version);
      return true;
    })
    .sort((left, right) => right.version - left.version);
}

function applyDemoVersions(payload) {
  replaceArray(demoVersions, normalizeDemoVersionsResponse(payload));
  const selected = Number(state.selectedDemoVersion);
  const selectionExists = demoVersions.some((item) => item.version === selected);
  if (!selectionExists) {
    state.selectedDemoVersion = demoVersions[0]?.version ?? "";
    state.demoVersionPinned = false;
  }
  state.demoVersionMessage = demoVersions.length ? "" : "后端尚未生成 Demo 版本";
}

function getSelectedDemoVersion() {
  const selected = Number(state.selectedDemoVersion);
  return demoVersions.find((item) => item.version === selected) || demoVersions[0] || null;
}

function getDemoPreviewState(deliverable = deliverables.find((item) => canonicalDeliverableKind(item.kind) === "demo")) {
  const selected = getSelectedDemoVersion();
  const versionLabel = selected?.label || normalizeVersionLabel(deliverable?.version) || "V1";
  const file = selected?.file || "demo_latest.html";
  const isReady = Boolean(deliverable && ["已完成", "ready", "available", "generated", "stored", "complete", "completed"]
    .some((status) => String(deliverable.status || "").toLowerCase().includes(status.toLowerCase())));
  const url = isReady
    ? `${apiBaseUrl.replace(/\/$/, "")}/docs/${encodeURIComponent(state.selectedMeetingId)}/${encodeURIComponent(file)}?v=${encodeURIComponent(versionLabel)}`
    : "";
  return {
    selected,
    versionLabel,
    file,
    url,
    frameKey: `${state.selectedMeetingId || "meeting"}:${file}:${versionLabel}`
  };
}

function stripAssistantReasoning(value) {
  return normalizeAssistantMarkdown(value);
}

function renderCollabMarkdown(value) {
  return renderMarkdown(stripAssistantReasoning(value));
}

function normalizeCollabQuestions(payload) {
  return normalizeCollabQuestionPayload(payload);
}

function normalizeChatMessage(message) {
  const source = message?.assistant_message || message?.user_message || message || {};
  const messageSource = source.source || "";
  const materialId = source.material?.material_id || source.material?.id || source.material_id || "";
  const type = messageSource === "material-upload" ? "material" : source.role === "assistant" || message?.assistant_message ? "answer" : "question";
  const rawText = source.content || source.message || source.text || "";
  return {
    id: source.id || createAnnotationId(),
    time: source.created_at ? new Date(source.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : nowTime(),
    text: type === "answer" ? stripAssistantReasoning(rawText) : rawText,
    type,
    role: source.role || (type === "answer" ? "assistant" : "user"),
    source: messageSource,
    materialId,
    materialStatus: source.material?.status || source.material_status || "",
    status: source.status || "sent",
    error: source.error || ""
  };
}

function applyMaterialProcessingStatuses(messages) {
  const phases = resolveMaterialProcessingPhases(materials, messages);
  for (const message of messages) {
    if (message.type !== "material" || !message.materialId) continue;
    message.status = phases.get(String(message.materialId)) || "uploaded";
  }
  return phases;
}

function normalizeChatHistoryResponse(payload) {
  const history = Array.isArray(payload) ? payload : payload?.messages || payload?.history || [];
  return dedupeVpbuddyMessages(history.map(normalizeChatMessage));
}

function applyChatHistory(payload) {
  const messages = normalizeChatHistoryResponse(payload);
  const pendingMaterialMessages = state.vpbuddyMessages.filter((message) => message.type === "material" && message.materialId);
  const localChatMessages = state.vpbuddyMessages.filter((message) => message.localOnly && ["sending", "failed"].includes(message.status));
  const mergedMessages = dedupeVpbuddyMessages([...messages, ...pendingMaterialMessages, ...localChatMessages]);
  applyMaterialProcessingStatuses(mergedMessages);
  replaceArray(state.vpbuddyMessages, mergedMessages);
  syncActiveMaterialProgress();
  state.showComposerHistory = mergedMessages.length > 0;
  return mergedMessages;
}

function setApiStatus(status, message) {
  if (state.apiStatus !== status || state.apiMessage !== message) {
    recordClientLog(status === "error" ? "error" : "info", "Backend status changed", {
      status,
      message
    });
  }
  state.apiStatus = status;
  state.apiMessage = message;
}

function applyAuthenticatedUser(profile = {}) {
  const email = profile.email || state.authEmail;
  state.authEmail = email;
  user.name = email || "VPBuddy 用户";
  transcriptRecordStore.setOwner(email || profile.user_id || profile.userId || profile.id || "");
  if (profile.organization) user.organization = profile.organization;
  if (profile.role) user.role = profile.role;
}

function resetAuthenticatedSession(message = "") {
  window.localStorage?.removeItem(authTokenKey);
  meetingDetailLoadSequence += 1;
  closeMeetingEvents();
  resetRecordingState();
  clearPresentationPreview();
  clearMaterialPreviewDownloadCache();
  for (const collection of [meetings, materials, timeline, meetingRecords, meetingUnderstanding, aiFollowupQuestions, deliverables, demoVersions, conceptSources, explanationFindings, knowledgeDocs, todoItems]) {
    replaceArray(collection, []);
  }
  transcriptRecordStore.setOwner("");
  replaceArray(state.vpbuddyMessages, []);
  pendingVpbuddyChatRequests.clear();
  state.selectedMeetingId = "";
  state.selectedMaterial = "";
  state.selectedDeliverable = "";
  state.selectedDemoVersion = "";
  state.demoVersionPinned = false;
  state.demoVersionMessage = "";
  state.meetingDetailLoading = false;
  state.loadedMeetingDetailId = "";
  state.selectedKnowledge = "";
  state.showAccountMenu = false;
  state.showDeliverableDownloadMenu = false;
  state.downloadBusyMode = "";
  state.downloadProgress = null;
  state.view = "login";
  state.authBusy = false;
  state.authError = message;
  state.apiStatus = "idle";
  state.apiMessage = "尚未登录";
  render();
}

async function submitAuthentication() {
  const email = document.querySelector("[data-field='auth-email']")?.value.trim() || "";
  const password = document.querySelector("[data-field='auth-password']")?.value || "";
  state.authEmail = email;
  state.authError = "";

  if (!email || !email.includes("@")) {
    state.authError = "请输入有效邮箱。";
    render();
    return;
  }
  if (password.length < 6) {
    state.authError = "密码至少需要 6 位。";
    render();
    return;
  }

  state.authBusy = true;
  render();
  try {
    const payload = state.authMode === "register"
      ? await api.register({ email, password })
      : await api.login({ email, password });
    if (!payload?.token) throw new Error("后端未返回登录凭证。");
    window.localStorage?.setItem(authTokenKey, payload.token);
    window.localStorage?.setItem(authEmailKey, payload.email || email);
    applyAuthenticatedUser(payload);
    state.authBusy = false;
    state.authError = "";
    state.view = "workspace";
    setApiStatus("connected", "已登录，正在加载会议");
    render();
    await loadMeetingsFromBackend();
  } catch (error) {
    window.localStorage?.removeItem(authTokenKey);
    state.authBusy = false;
    state.authError = error?.message || `${state.authMode === "register" ? "注册" : "登录"}失败。`;
    render();
  }
}

async function restoreAuthenticatedSession() {
  if (!getAuthToken()) return;
  state.authBusy = true;
  render();
  try {
    const profile = await api.me();
    applyAuthenticatedUser(profile || {});
    state.authBusy = false;
    state.authError = "";
    state.view = "workspace";
    setApiStatus("connected", "已登录，正在加载会议");
    render();
    await loadMeetingsFromBackend();
  } catch (error) {
    if (error?.status === 401 || !getAuthToken()) return;
    state.authBusy = false;
    state.view = "workspace";
    setApiStatus("error", `后端暂时不可用：${error?.message || "连接失败"}`);
    render();
  }
}

function hasBackendSession() {
  return Boolean(getAuthToken());
}

function renderEmptyState(title, description = "", modifier = "") {
  return `
    <div class="empty-state ${modifier}">
      <strong>${title}</strong>
      ${description ? `<p>${description}</p>` : ""}
    </div>
  `;
}

async function loadMeetingsFromBackend() {
  setApiStatus("loading", "连接后端中");
  render();
  try {
    const payload = await api.listMeetings();
    const next = normalizeMeetingsResponse(payload);
    replaceArray(meetings, next);
    if (meetings.length && !meetings.some((item) => item.id === state.selectedMeetingId)) state.selectedMeetingId = meetings[0].id;
    if (!meetings.length) state.selectedMeetingId = "";
    setApiStatus("connected", "已连接后端");
  } catch (error) {
    replaceArray(meetings, []);
    state.selectedMeetingId = "";
    setApiStatus("error", `会议列表加载失败：${error.message}`);
  }
  render();
}

async function loadMeetingDetailFromBackend(meetingId) {
  const loadSequence = ++meetingDetailLoadSequence;
  const materialRevisionAtLoad = meetingMaterialsRevision;
  const hasCachedDetail = state.loadedMeetingDetailId === meetingId;
  state.meetingDetailLoading = !hasCachedDetail;
  if (!hasCachedDetail) {
    restoreTranscriptRecords(meetingId);
    replaceArray(materials, []);
    replaceArray(deliverables, []);
    replaceArray(demoVersions, []);
    replaceArray(meetingUnderstanding, []);
    replaceArray(aiFollowupQuestions, []);
    replaceArray(explanationFindings, []);
    replaceArray(state.vpbuddyMessages, []);
    restorePendingVpbuddyMessage(meetingId);
    state.selectedMaterial = "";
    state.selectedDeliverable = "";
    state.selectedDemoVersion = "";
    state.demoVersionPinned = false;
    state.demoVersionMessage = "";
    state.showComposerHistory = false;
    state.showDeliverableDownloadMenu = false;
    clearPresentationPreview();
    clearMaterialPreviewDownloadCache();
  }
  render();

  const results = await Promise.allSettled([
    api.getMeeting(meetingId),
    api.listTranscriptSegments(meetingId),
    api.listMaterials(meetingId),
    api.listDeliverables(meetingId),
    api.listChatHistory(meetingId),
    api.getMeetingCollab(meetingId),
    api.listDemoVersions(meetingId)
  ]);
  if (loadSequence !== meetingDetailLoadSequence) return;
  if (meetingId !== state.selectedMeetingId) return;
  const canApplyMaterialSnapshot = meetingMaterialsRevision === materialRevisionAtLoad;

  let connected = false;
  let detailHadDeliverables = false;
  const [detail, transcript, materialList, deliverableList, chatHistory, collab, demoVersionList] = results;

  if (detail.status === "fulfilled" && detail.value) {
    connected = true;
    const meeting = normalizeMeeting(detail.value, 0);
    const index = meetings.findIndex((item) => item.id === meetingId);
    if (index >= 0) {
      const current = meetings[index];
      const detailState = detail.value.state || {};
      const hasTitle = Boolean(detail.value.title || detail.value.name || detail.value.project_name || detailState.title || detailState.project_name);
      const hasDescription = Boolean(detail.value.desc || detail.value.description || detail.value.objective || detailState.objective);
      const hasTime = Boolean(detail.value.time || detail.value.startedAt || detail.value.started_at || detail.value.createdAt || detail.value.created_at);
      meetings[index] = {
        ...current,
        ...meeting,
        id: meetingId,
        title: hasTitle ? meeting.title : current.title,
        desc: hasDescription ? meeting.desc : current.desc,
        time: hasTime ? meeting.time : current.time
      };
    }

    const detailTranscripts = normalizeTranscriptResponse(detail.value);
    if (detailTranscripts.length) {
      applyTranscriptSnapshot(detailTranscripts, meetingId);
    }

    const detailDeliverables = normalizeDeliverablesResponse(detail.value);
    if (detailDeliverables.length) {
      detailHadDeliverables = true;
      replaceArray(deliverables, detailDeliverables);
    }

    const detailMaterials = normalizeMaterialsResponse(detail.value);
    if (canApplyMaterialSnapshot && detailMaterials.length) {
      replaceArray(materials, detailMaterials);
    }
    const detailItems = detail.value?.state?.items || detail.value?.items || [];
    if (Array.isArray(detailItems)) replaceArray(meetingUnderstanding, detailItems);
  }

  if (transcript.status === "fulfilled") {
    connected = true;
    const nextRecords = normalizeTranscriptResponse(transcript.value);
    if (nextRecords.length) {
      applyTranscriptSnapshot(nextRecords, meetingId);
    }
    const stateItems = transcript.value?.state?.items || [];
    if (Array.isArray(stateItems)) replaceArray(meetingUnderstanding, stateItems);
  }

  if (deliverableList.status === "fulfilled") {
    connected = true;
    const nextDeliverables = normalizeDeliverablesResponse(deliverableList.value);
    replaceArray(deliverables, nextDeliverables);
  }

  if (demoVersionList.status === "fulfilled") {
    connected = true;
    applyDemoVersions(demoVersionList.value);
  } else {
    state.demoVersionMessage = `Demo 版本加载失败：${demoVersionList.reason?.message || "未知错误"}`;
  }

  if (materialList.status === "fulfilled") {
    connected = true;
    if (canApplyMaterialSnapshot) {
      const nextMaterials = normalizeMaterialsResponse(materialList.value);
      if (nextMaterials.length || !materials.length) {
        replaceArray(materials, nextMaterials);
      }
    }
  }

  if (chatHistory.status === "fulfilled") {
    connected = true;
    applyChatHistory(chatHistory.value);
  }

  if (collab.status === "fulfilled") {
    connected = true;
    replaceArray(aiFollowupQuestions, normalizeCollabQuestions(collab.value));
  }

  if (connected) {
    if (deliverableList.status !== "fulfilled" && !detailHadDeliverables) replaceArray(deliverables, []);
  }

  if (deliverables.length && !state.selectedDeliverable) state.selectedDeliverable = getDefaultDeliverable().id;
  const failedCount = results.filter((item) => item.status === "rejected").length;
  setApiStatus(connected ? "connected" : "error", connected
    ? failedCount ? `已连接后端，${failedCount} 项会议数据暂不可用` : "已连接后端"
    : "会议数据加载失败");
  state.loadedMeetingDetailId = meetingId;
  state.meetingDetailLoading = false;
  render();
}

async function loadKnowledgeFromBackend() {
  setApiStatus("loading", "同步知识库中");
  state.knowledgeMessage = "";
  render();
  try {
    const payload = await api.listKnowledgeDocuments();
    const nextDocs = normalizeKnowledgeResponse(payload);
    replaceArray(knowledgeDocs, nextDocs);
    state.knowledgeLoaded = true;
    state.knowledgeTotal = nextDocs.length;
    state.knowledgeMessage = nextDocs.length ? "" : "后端知识库当前没有文档。";
    state.knowledgeCallable = Object.fromEntries(nextDocs.map((doc) => [doc.id, doc.meetingCallable]));
    state.selectedKnowledge = nextDocs[0]?.id || "";
    setApiStatus("connected", "已连接后端");
  } catch (error) {
    replaceArray(knowledgeDocs, []);
    state.selectedKnowledge = "";
    state.knowledgeLoaded = true;
    state.knowledgeTotal = 0;
    state.knowledgeMessage = `知识库加载失败：${error.message}`;
    setApiStatus("error", "知识库接口请求失败");
  }
  render();
}

async function searchKnowledgeFromBackend() {
  const query = state.knowledgeSearch.trim();
  if (!query) {
    await loadKnowledgeFromBackend();
    return;
  }
  state.knowledgeMessage = "正在搜索个人知识库";
  render();
  try {
    const payload = await api.searchKnowledge({ query, scope: "personal_kb", top_k: 20 });
    const nextDocs = normalizeKnowledgeResponse(payload?.results || payload);
    replaceArray(knowledgeDocs, nextDocs);
    state.knowledgeTotal = nextDocs.length;
    state.selectedKnowledge = nextDocs[0]?.id || "";
    state.knowledgeMessage = nextDocs.length ? "" : "没有找到相关知识内容。";
  } catch (error) {
    replaceArray(knowledgeDocs, []);
    state.selectedKnowledge = "";
    state.knowledgeTotal = 0;
    state.knowledgeMessage = `知识库搜索失败：${error.message}`;
  }
  render();
}

function scheduleKnowledgeSearch() {
  if (knowledgeSearchTimer) window.clearTimeout(knowledgeSearchTimer);
  knowledgeSearchTimer = window.setTimeout(() => {
    knowledgeSearchTimer = 0;
    void searchKnowledgeFromBackend();
  }, 350);
}

function createEmptyPdfPreviewRuntime() {
  return {
    source: "",
    blob: null,
    loadingTask: null,
    loadPromise: null,
    document: null,
    renderTask: null,
    renderPromise: null,
    canvas: null,
    page: 0,
    renderWidth: 0,
    requestedPage: 0,
    requestedWidth: 0
  };
}

function resetPdfPreviewRuntime() {
  const runtime = pdfPreviewRuntime;
  runtime.renderTask?.cancel?.();
  const cleanup = runtime.loadingTask?.destroy?.() || runtime.document?.destroy?.();
  if (cleanup?.catch) cleanup.catch(() => {});
  pdfPreviewRuntime = createEmptyPdfPreviewRuntime();
}

function loadPdfRendererModule() {
  if (!pdfRendererModulePromise) {
    const moduleUrl = new URL("../node_modules/pdfjs-dist/build/pdf.mjs", import.meta.url);
    const workerUrl = new URL("../node_modules/pdfjs-dist/build/pdf.worker.mjs", import.meta.url);
    pdfRendererModulePromise = import(moduleUrl.href).then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.href;
      return pdfjs;
    }).catch((error) => {
      pdfRendererModulePromise = null;
      throw error;
    });
  }
  return pdfRendererModulePromise;
}

function loadHtml2CanvasModule() {
  if (!html2canvasModulePromise) {
    const moduleUrl = new URL("../node_modules/html2canvas/dist/html2canvas.esm.js", import.meta.url);
    html2canvasModulePromise = import(moduleUrl.href).then((module) => module.default || module).catch((error) => {
      html2canvasModulePromise = null;
      throw error;
    });
  }
  return html2canvasModulePromise;
}

async function ensurePdfPreviewMounted() {
  const surface = document.querySelector(".material-pdf-preview[data-pdf-source]");
  if (!surface || !presentationPreviewBlob || !state.presentationMime.includes("pdf")) return;
  const source = surface.dataset.pdfSource;
  const width = Math.max(1, Math.floor(surface.clientWidth));
  const requestedPage = clamp(state.currentSlide, 1, Math.max(1, pdfPreviewRuntime.document?.numPages || 1));
  const runtime = pdfPreviewRuntime;

  if (runtime.source !== source) {
    resetPdfPreviewRuntime();
    pdfPreviewRuntime.source = source;
    const previewBlob = presentationPreviewBlob;
    pdfPreviewRuntime.blob = previewBlob;
    try {
      const pdfjs = await loadPdfRendererModule();
      if (pdfPreviewRuntime.source !== source) return;
      pdfPreviewRuntime.loadingTask = pdfjs.getDocument({ data: new Uint8Array(await previewBlob.arrayBuffer()) });
      pdfPreviewRuntime.document = await pdfPreviewRuntime.loadingTask.promise;
      if (pdfPreviewRuntime.source !== source) return;
      state.presentationPdfPageCount = pdfPreviewRuntime.document.numPages;
      state.currentSlide = clamp(state.currentSlide, 1, state.presentationPdfPageCount);
      render();
    } catch (error) {
      if (pdfPreviewRuntime.source !== source) return;
      state.presentationPdfError = materialPreviewErrorMessage(error);
      state.presentationError = "PDF 无法在当前设备中渲染，请下载原文件查看。";
      render();
      return;
    }
  }

  const activeRuntime = pdfPreviewRuntime;
  const page = clamp(state.currentSlide, 1, activeRuntime.document?.numPages || 1);
  if (!activeRuntime.document || (activeRuntime.page === page && activeRuntime.renderWidth === width)) return;
  const canvas = surface.querySelector(".material-pdf-canvas");
  if (!canvas) return;
  activeRuntime.renderTask?.cancel?.();
  try {
    const pdfPage = await activeRuntime.document.getPage(page);
    if (pdfPreviewRuntime !== activeRuntime || activeRuntime.source !== source) return;
    const baseViewport = pdfPage.getViewport({ scale: 1 });
    const scale = Math.max(0.5, width / baseViewport.width);
    const viewport = pdfPage.getViewport({ scale });
    const ratio = window.devicePixelRatio || 1;
    const scrollTop = surface.scrollTop;
    canvas.width = Math.ceil(viewport.width * ratio);
    canvas.height = Math.ceil(viewport.height * ratio);
    canvas.style.width = `${Math.ceil(viewport.width)}px`;
    canvas.style.height = `${Math.ceil(viewport.height)}px`;
    const context = canvas.getContext("2d", { alpha: false });
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const renderTask = pdfPage.render({ canvasContext: context, viewport });
    activeRuntime.renderTask = renderTask;
    await renderTask.promise;
    if (pdfPreviewRuntime !== activeRuntime || activeRuntime.source !== source) return;
    activeRuntime.page = page;
    activeRuntime.renderWidth = width;
    surface.scrollTop = scrollTop;
  } catch (error) {
    if (error?.name !== "RenderingCancelledException") {
      state.presentationPdfError = materialPreviewErrorMessage(error);
    }
  }
}

function clearPresentationPreview() {
  materialPreviewLoadSequence += 1;
  resetPdfPreviewRuntime();
  if (state.presentationUrl.startsWith("blob:")) URL.revokeObjectURL(state.presentationUrl);
  presentationPreviewBlob = null;
  state.presentationUrl = "";
  state.presentationMime = "";
  state.presentationName = "";
  state.presentationText = "";
  state.presentationLoading = false;
  state.presentationError = "";
  state.presentationPdfPageCount = 0;
  state.presentationPdfError = "";
  state.currentSlide = 1;
}

function getMaterialPreviewCacheKeys(material, meetingId = state.selectedMeetingId, includeName = true) {
  const prefix = String(meetingId || "");
  const keys = [];
  if (material?.id) keys.push(`${prefix}:id:${material.id}`);
  if (includeName && material?.name) keys.push(`${prefix}:name:${String(material.name).trim().toLowerCase()}`);
  return keys;
}

function cacheMaterialPreviewDownload(material, download, meetingId = state.selectedMeetingId, includeName = false) {
  if (!download?.blob) return download;
  const cachedDownload = {
    blob: download.blob,
    filename: download.filename || material?.name || "",
    contentType: download.contentType || download.blob.type || material?.contentType || ""
  };
  for (const key of getMaterialPreviewCacheKeys(material, meetingId, includeName)) {
    materialPreviewDownloadCache.set(key, cachedDownload);
  }
  return cachedDownload;
}

function getCachedMaterialPreviewDownload(material, meetingId = state.selectedMeetingId) {
  for (const key of getMaterialPreviewCacheKeys(material, meetingId)) {
    const cachedDownload = materialPreviewDownloadCache.get(key);
    if (cachedDownload) return cachedDownload;
  }
  return null;
}

function clearMaterialPreviewDownloadCache() {
  materialPreviewDownloadCache.clear();
}

function formatRecordingTime(totalSeconds) {
  const value = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = String(Math.floor(value / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((value % 3600) / 60)).padStart(2, "0");
  const seconds = String(value % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function updateRecordingTimer() {
  if (!state.recordingStartedAt) return;
  state.recordingElapsed = Math.floor((Date.now() - state.recordingStartedAt) / 1000);
  const timer = document.querySelector(".stage-title .timer");
  if (timer) timer.textContent = formatRecordingTime(state.recordingElapsed);
}

function startRecordingTimer() {
  stopRecordingTimer();
  state.recordingStartedAt = Date.now() - state.recordingElapsed * 1000;
  updateRecordingTimer();
  recordingTimer = window.setInterval(updateRecordingTimer, 1000);
}

function stopRecordingTimer() {
  if (recordingTimer) window.clearInterval(recordingTimer);
  recordingTimer = 0;
  updateRecordingTimer();
  state.recordingStartedAt = 0;
}

function resetRecordingState() {
  stopRecordingTimer();
  void realtimeAsrSession?.close();
  realtimeAsrSession = null;
  state.recordingStatus = "idle";
  state.recordingStartedAt = 0;
  state.recordingElapsed = 0;
  state.recordingMessage = "尚未开始录制";
  liveTranscriptIdsByMeeting.clear();
}

function hasActiveRealtimeSession() {
  return Boolean(realtimeAsrSession)
    && ["starting", "recording", "paused", "pausing", "resuming", "stopping"].includes(state.recordingStatus);
}

function preventActiveRecordingMeetingSwitch(nextMeetingId) {
  if (!nextMeetingId || nextMeetingId === state.selectedMeetingId || !hasActiveRealtimeSession()) return false;
  setToast("录音进行中，请先结束当前会议再切换", false);
  render();
  return true;
}

function areMeetingRecordsVisible() {
  return state.stageTab === "deliverable"
    ? state.deliverableLeftTab === "records"
    : state.meetingLeftTab === "records";
}

function appendRealtimeTranscript(message, meetingId = state.selectedMeetingId) {
  if (!meetingId) return;
  const targetRecords = meetingId === state.selectedMeetingId
    ? meetingRecords
    : transcriptRecordStore.read(meetingId);
  const liveTranscriptId = liveTranscriptIdsByMeeting.get(meetingId) || "";
  const next = {
    ...normalizeTranscriptSegment(message, targetRecords.length),
    id: liveTranscriptId || createAnnotationId(),
    live: !message.is_sentence_end,
    source: "realtime"
  };
  if (!next.text) return;
  const last = targetRecords.at(-1);
  if (last?.live && last.id === next.id) targetRecords[targetRecords.length - 1] = next;
  else targetRecords.push(next);
  if (message.is_sentence_end) liveTranscriptIdsByMeeting.delete(meetingId);
  else liveTranscriptIdsByMeeting.set(meetingId, next.id);
  cacheTranscriptRecords(meetingId, targetRecords, { persist: Boolean(message.is_sentence_end) });
  if (meetingId === state.selectedMeetingId && areMeetingRecordsVisible()) render();
}

async function startRealtimeRecording() {
  const meetingId = state.selectedMeetingId;
  const recordingAuthToken = getAuthToken();
  if (!meetingId || state.recordingStatus === "starting" || state.recordingStatus === "recording") return;
  state.recordingStatus = "starting";
  state.recordingMessage = "正在连接麦克风与实时转写";
  render();
  try {
    realtimeAsrSession = createRealtimeAsrSession({
      baseUrl: apiBaseUrl,
      meetingId,
      getToken: getAuthToken,
      onTranscript: (message) => {
        if (!recordingAuthToken || getAuthToken() !== recordingAuthToken) return;
        appendRealtimeTranscript(message, meetingId);
      },
      onStatus: (event) => {
        if (meetingId !== state.selectedMeetingId) return;
        if (event.status === "recording") {
          state.recordingStatus = "recording";
          state.recordingMessage = "实时录音与转写中";
          startRecordingTimer();
          render();
        }
        if (event.status === "paused") {
          stopRecordingTimer();
          state.recordingStatus = "paused";
          state.recordingMessage = "录制已暂停，会议和转写连接保持中";
          render();
        }
      },
      onComplete: () => {
        if (meetingId !== state.selectedMeetingId) return;
        if (state.recordingStatus !== "stopping") {
          realtimeAsrSession = null;
          state.recordingStatus = "stopped";
          stopRecordingTimer();
        }
        state.recordingMessage = "本次录音转写已完成";
        render();
      },
      onError: (error) => {
        if (meetingId !== state.selectedMeetingId) return;
        state.recordingStatus = "error";
        state.recordingMessage = error.message || "实时录音连接失败";
        stopRecordingTimer();
        render();
      }
    });
    let startupTimer = 0;
    try {
      await Promise.race([
        realtimeAsrSession.start(),
        new Promise((_, reject) => {
          startupTimer = window.setTimeout(() => reject(new Error("麦克风授权或实时转写连接超时")), 15000);
        })
      ]);
    } finally {
      if (startupTimer) window.clearTimeout(startupTimer);
    }
  } catch (error) {
    await realtimeAsrSession?.close();
    realtimeAsrSession = null;
    state.recordingStatus = "error";
    state.recordingMessage = error.message || "开始录制失败";
    stopRecordingTimer();
    setToast(`开始录制失败：${state.recordingMessage}`, false);
    render();
  }
}

async function pauseRealtimeRecording() {
  if (state.recordingStatus !== "recording" || !realtimeAsrSession) return;
  state.recordingStatus = "pausing";
  state.recordingMessage = "正在暂停录制";
  render();
  try {
    await realtimeAsrSession.pause();
    setToast("录制已暂停，会议记录已保留");
  } catch (error) {
    state.recordingStatus = realtimeAsrSession?.isRecording() ? "recording" : "error";
    state.recordingMessage = error.message || "暂停录制失败";
    if (state.recordingStatus === "recording") startRecordingTimer();
    setToast(`暂停录制失败：${state.recordingMessage}`, false);
    render();
    throw error;
  }
}

async function resumeRealtimeRecording() {
  if (state.recordingStatus !== "paused" || !realtimeAsrSession) return;
  state.recordingStatus = "resuming";
  state.recordingMessage = "正在恢复录制";
  render();
  try {
    await realtimeAsrSession.resume();
    setToast("录制已继续");
  } catch (error) {
    state.recordingStatus = realtimeAsrSession?.isPaused() ? "paused" : "error";
    state.recordingMessage = error.message || "继续录制失败";
    setToast(`继续录制失败：${state.recordingMessage}`, false);
    render();
    throw error;
  }
}

async function stopRealtimeRecording({ notifyBackend = false } = {}) {
  if (!state.selectedMeetingId || !["starting", "recording", "paused", "pausing", "resuming", "error"].includes(state.recordingStatus)) return;
  const meetingId = state.selectedMeetingId;
  state.recordingStatus = "stopping";
  state.recordingMessage = "正在停止录音并完成转写";
  render();
  const tasks = [];
  if (realtimeAsrSession) tasks.push(realtimeAsrSession.stop());
  if (notifyBackend) tasks.push(api.stopRecording(meetingId));
  const results = await Promise.allSettled(tasks);
  realtimeAsrSession = null;
  stopRecordingTimer();
  cacheTranscriptRecords(meetingId, meetingRecords);
  const failure = results.find((item) => item.status === "rejected");
  state.recordingStatus = failure ? "error" : "stopped";
  state.recordingMessage = failure ? `停止录制异常：${failure.reason?.message || "未知错误"}` : "录音已停止";
  if (!failure) await refreshTranscript(meetingId, { notify: false });
  render();
  if (failure) throw failure.reason;
}

function closeMeetingEvents() {
  if (meetingEventSource) {
    meetingEventSource.close();
    meetingEventSource = null;
  }
}

function startMeetingEvents(meetingId) {
  closeMeetingEvents();
  try {
    meetingEventSource = connectAuthenticatedSse({
      baseUrl: apiBaseUrl,
      meetingId,
      getToken: getAuthToken,
      onEvent: (event) => {
        if (meetingId !== state.selectedMeetingId) return;
        if (event.type === "chat-message") {
          const message = normalizeChatMessage(event.data || {});
          if (addVpbuddyMessage(message)) {
            applyMaterialProcessingStatuses(state.vpbuddyMessages);
            syncActiveMaterialProgress();
            state.showComposerHistory = true;
            render();
          }
        }
        if (event.type === "collab-update") void refreshMeetingCollab(meetingId);
        if (event.type === "doc-update" || event.type === "demo-new-version") void refreshDeliverables(meetingId);
        if (event.type === "recording-disconnected") {
          state.recordingStatus = "error";
          state.recordingMessage = "录音连接已断开";
          stopRecordingTimer();
          render();
        }
        if (event.type === "meeting-complete") {
          const meeting = getSelectedMeeting();
          if (meeting) {
            meeting.status = "已结束";
            rememberMeetingStatus(meeting.id, meeting.status);
          }
          stopRecordingTimer();
          if (!realtimeAsrSession && state.recordingStatus !== "stopped") {
            void refreshTranscript(meetingId, { notify: false });
          }
          void refreshDeliverables(meetingId);
          setToast("会议已完成，交付物和记录正在同步");
          render();
        }
      },
      onError: (error) => {
        if (meetingId === state.selectedMeetingId) state.apiMessage = `实时事件连接异常：${error.message}`;
      }
    });
  } catch (error) {
    closeMeetingEvents();
    state.apiMessage = `实时事件连接失败：${error.message}`;
  }
}

async function refreshMeetingCollab(meetingId) {
  try {
    const payload = await api.getMeetingCollab(meetingId);
    replaceArray(aiFollowupQuestions, normalizeCollabQuestions(payload));
    render();
  } catch {
    // The rest of the meeting remains usable when collaboration is unavailable.
  }
}

async function refreshDeliverables(meetingId) {
  const [deliverableResult, demoVersionResult] = await Promise.allSettled([
    api.listDeliverables(meetingId),
    api.listDemoVersions(meetingId)
  ]);
  if (meetingId !== state.selectedMeetingId) return;
  if (deliverableResult.status === "fulfilled") {
    replaceArray(deliverables, normalizeDeliverablesResponse(deliverableResult.value));
    if (!deliverables.some((item) => item.id === state.selectedDeliverable)) state.selectedDeliverable = getDefaultDeliverable()?.id || "";
  }
  if (demoVersionResult.status === "fulfilled") {
    applyDemoVersions(demoVersionResult.value);
  } else {
    state.demoVersionMessage = `Demo 版本刷新失败：${demoVersionResult.reason?.message || "未知错误"}`;
  }
  render();
}

async function refreshTranscript(meetingId, { notify = true } = {}) {
  try {
    const payload = await api.listTranscriptSegments(meetingId);
    if (meetingId !== state.selectedMeetingId) return;
    const nextRecords = normalizeTranscriptResponse(payload);
    applyTranscriptSnapshot(nextRecords, meetingId);
    const stateItems = payload?.state?.items || [];
    if (Array.isArray(stateItems)) replaceArray(meetingUnderstanding, stateItems);
    if (notify) setToast("会议记录已从后端刷新");
  } catch (error) {
    if (notify) setToast(`会议记录刷新失败：${error.message}`, false);
  }
  render();
}

async function sendVpbuddyChatMessage(text, { optimisticMessageId = "" } = {}) {
  const meetingId = state.selectedMeetingId;
  const content = String(text || "").trim();
  if (isVpbuddyChatBusy(meetingId)) return;
  if (!meetingId) {
    setToast("请先选择一场会议", false);
    render();
    return;
  }
  if (!content) {
    setToast("请输入要发送的问题", false);
    render();
    return;
  }

  const requestId = `vpbuddy-chat-${++vpbuddyChatRequestSequence}`;
  const messageId = optimisticMessageId || `local-${requestId}`;
  let optimisticMessage = state.vpbuddyMessages.find((item) => item.id === messageId);
  if (optimisticMessage) {
    Object.assign(optimisticMessage, {
      text: content,
      status: "sending",
      error: "",
      localOnly: true
    });
  } else {
    optimisticMessage = {
      id: messageId,
      time: nowTime(),
      text: content,
      type: "question",
      status: "sending",
      error: "",
      localOnly: true
    };
    addVpbuddyMessage(optimisticMessage);
  }
  const request = {
    id: requestId,
    meetingId,
    messageId,
    message: optimisticMessage,
    startedAt: globalThis.performance?.now?.() || Date.now()
  };
  pendingVpbuddyChatRequests.set(meetingId, request);
  state.chatBusy = true;
  state.composerText = "";
  state.showComposerHistory = true;
  render();

  try {
    const response = await api.sendChat(meetingId, content);
    const activeRequest = pendingVpbuddyChatRequests.get(meetingId);
    if (activeRequest?.id !== requestId) return;
    const elapsedMs = Math.round((globalThis.performance?.now?.() || Date.now()) - request.startedAt);
    recordClientLog("info", "VPBuddy chat request completed", { meetingId, elapsedMs });
    if (meetingId !== state.selectedMeetingId) return;

    const userMessage = response?.user_message ? normalizeChatMessage(response.user_message) : null;
    const assistantMessage = response?.assistant_message ? normalizeChatMessage(response.assistant_message) : null;
    if (userMessage?.text) {
      removeVpbuddyMessage(messageId);
      addVpbuddyMessage(userMessage);
    } else {
      updateVpbuddyMessage(messageId, { status: "sent", localOnly: false, error: "" });
    }
    if (assistantMessage?.text) addVpbuddyMessage(assistantMessage);
    state.showComposerHistory = true;
    setApiStatus("connected", "已连接后端");
    setToast("问题已发送给 VPBuddy");
  } catch (error) {
    const activeRequest = pendingVpbuddyChatRequests.get(meetingId);
    if (activeRequest?.id !== requestId || meetingId !== state.selectedMeetingId) return;
    updateVpbuddyMessage(messageId, {
      status: "failed",
      error: error?.message || "发送失败",
      localOnly: true
    });
    if (!state.composerText.trim()) state.composerText = content;
    state.showComposerHistory = true;
    setToast(`问题发送失败：${error.message}`, false);
  } finally {
    if (pendingVpbuddyChatRequests.get(meetingId)?.id === requestId) {
      pendingVpbuddyChatRequests.delete(meetingId);
    }
    state.chatBusy = isVpbuddyChatBusy();
    if (meetingId === state.selectedMeetingId) render();
  }
}

function getSettingsPayload() {
  return {
    provider: state.settings.provider,
    model: state.settings.model,
    base_url: state.settings.endpoint.trim(),
    api_key: state.settings.apiKey.trim()
  };
}

function getSelectedModelPreset() {
  return modelPresets.find((item) => item.id === state.settings.modelPreset) || modelPresets[0];
}

function applyModelPreset(presetId) {
  const preset = modelPresets.find((item) => item.id === presetId) || modelPresets[0];
  state.settings = {
    ...state.settings,
    modelPreset: preset.id,
    provider: preset.provider,
    model: preset.model,
    endpoint: preset.baseUrl,
    apiKeyEnv: preset.apiKeyEnv,
    status: "idle",
    message: `Hermes: model=${preset.model}, base_url=${preset.baseUrl}`
  };
}

function updateSettingsFromInputs() {
  const apiKey = document.querySelector(".settings-api-key")?.value ?? state.settings.apiKey;
  const endpoint = document.querySelector(".settings-endpoint")?.value ?? state.settings.endpoint;
  state.settings = { ...state.settings, apiKey, endpoint };
}

function updateBackendApiBaseFromInput() {
  const value = document.querySelector(".settings-api-base")?.value?.trim();
  if (value !== undefined) state.apiBaseUrl = value;
}

function saveBackendApiBase() {
  const value = state.apiBaseUrl.trim();
  if (!/^https?:\/\//i.test(value)) {
    setToast("后端 API 地址必须以 http:// 或 https:// 开头", false);
    render();
    return;
  }
  window.localStorage?.setItem("vpbuddy.apiBaseUrl", value.replace(/\/$/, ""));
  setToast("后端 API 地址已保存，正在刷新客户端", false);
  render();
  window.setTimeout(() => window.location.reload(), 600);
}

async function loadAISettings() {
  state.settings.status = "idle";
  state.settings.message = "正在读取后端 AI 配置";
  render();
  try {
    const payload = await api.getAISettings();
    const preset = modelPresets.find((item) => item.provider === payload?.provider && item.model === payload?.model)
      || modelPresets.find((item) => item.model === payload?.model)
      || getSelectedModelPreset();
    state.settings = {
      ...state.settings,
      apiKey: "",
      apiKeyConfigured: Boolean(payload?.api_key_configured),
      modelPreset: preset.id,
      provider: payload?.provider || preset.provider,
      model: payload?.model || preset.model,
      endpoint: payload?.base_url || preset.baseUrl,
      apiKeyEnv: preset.apiKeyEnv,
      status: "idle",
      message: payload?.api_key_configured
        ? `后端已保存凭证 ${payload.api_key_masked || ""}`.trim()
        : "后端尚未配置 AI 凭证"
    };
  } catch (error) {
    state.settings.status = "error";
    state.settings.message = `AI 配置读取失败：${error.message}`;
  }
  render();
}

async function testAISettings() {
  updateSettingsFromInputs();
  state.settings.status = "testing";
  state.settings.message = "正在调用后端测试接口";
  render();
  try {
    const result = await api.testAIConnection();
    if (!result?.connected) throw new Error(result?.error || "后端未能连接所配置的 AI 服务");
    state.settings.status = "connected";
    state.settings.message = `连接成功${result.model ? `：${result.model}` : ""}`;
    setToast("AI 连接测试通过");
  } catch (error) {
    state.settings.status = "error";
    state.settings.message = `AI 连接测试失败：${error.message}`;
    setToast("AI 连接测试失败", false);
  }
  render();
}

async function saveAISettings() {
  updateSettingsFromInputs();
  if (!state.settings.apiKey.trim()) {
    state.settings.status = "error";
    state.settings.message = "为避免清空后端已有凭证，请输入 API Key 后再保存。";
    setToast("请输入 API Key", false);
    render();
    return;
  }
  state.settings.status = "saving";
  state.settings.message = "正在调用后端保存接口";
  render();
  try {
    await api.saveAISettings(getSettingsPayload());
    state.settings.status = "connected";
    state.settings.message = "AI 配置已由后端保存";
    setApiStatus("connected", "已连接后端");
    setToast("AI 设置已保存到后端");
  } catch (error) {
    state.settings.status = "error";
    state.settings.message = `后端保存接口调用失败：${error.message}`;
    setToast("AI 设置保存失败", false);
  }
  render();
}

function beginMeetingTitleEdit() {
  const meeting = getSelectedMeeting();
  if (!meeting || state.meetingDetailLoading || state.meetingTitleSaving) return;
  state.meetingTitleEditing = true;
  state.meetingTitleDraft = meeting.title || "";
  state.meetingTitleSelectOnFocus = true;
  render();
}

function resetMeetingTitleEditState() {
  state.meetingTitleEditing = false;
  state.meetingTitleDraft = "";
  state.meetingTitleSaving = false;
  state.meetingTitleSelectOnFocus = false;
}

function cancelMeetingTitleEdit() {
  resetMeetingTitleEditState();
  render();
}

async function saveMeetingTitle() {
  const meeting = getSelectedMeeting();
  const nextTitle = state.meetingTitleDraft.trim();
  if (!meeting || state.meetingTitleSaving || !state.meetingTitleEditing) return;
  if (!nextTitle) {
    setToast("会议名称不能为空", false);
    state.meetingTitleSelectOnFocus = true;
    render();
    return;
  }
  if (nextTitle === meeting.title) {
    cancelMeetingTitleEdit();
    return;
  }

  state.meetingTitleSaving = true;
  render();
  try {
    const response = await api.updateMeeting(meeting.id, { project_name: nextTitle });
    meeting.title = String(response?.project_name || nextTitle).trim() || nextTitle;
    resetMeetingTitleEditState();
    setToast("会议名称已保存到后端");
  } catch (error) {
    state.meetingTitleSaving = false;
    state.meetingTitleSelectOnFocus = false;
    setToast(`会议名称保存失败：${error.message}`, false);
  }
  render();
}

async function startNewMeetingFromForm() {
  if (hasActiveRealtimeSession()) {
    setToast("录音进行中，请先结束当前会议再创建新会议", false);
    render();
    return;
  }
  const title = document.querySelector("[data-field='meeting-title']")?.value.trim() || "";
  const projectName = document.querySelector("[data-field='meeting-project']")?.value.trim() || "";
  if (!title) {
    setToast("请输入会议名称", false);
    render();
    return;
  }

  try {
    const payload = await api.createMeeting({ projectName: title, audioSource: "web" });
    const meeting = {
      ...normalizeMeeting(payload?.meeting || payload, 0),
      title,
      desc: projectName || "会议协同与交付生成",
      status: "进行中"
    };
    rememberMeetingStatus(meeting.id, meeting.status);
    upsertMeeting(meeting);
    state.selectedMeetingId = meeting.id;
    state.showCreate = false;
    state.view = "meeting";
    state.stageTab = "presentation";
    state.meetingLeftTab = "records";
    state.deliverableLeftTab = "deliverables";
    state.meetingDetailLoading = state.loadedMeetingDetailId !== meeting.id;
    resetRecordingState();
    setApiStatus("connected", "新会议已由后端创建");
    render();
    startMeetingEvents(meeting.id);
    await loadMeetingDetailFromBackend(meeting.id);
  } catch (error) {
    setToast(`会议创建失败：${error.message}`, false);
    setApiStatus("error", "会议创建失败");
    render();
  }
}

async function endCurrentMeeting() {
  const meeting = getSelectedMeeting();
  if (!meeting || state.endingMeeting) return;
  state.endingMeeting = true;
  render();
  try {
    const hadRealtimeSession = Boolean(realtimeAsrSession);
    let finalizedByRealtime = false;
    if (["starting", "recording", "paused", "pausing", "resuming", "error"].includes(state.recordingStatus)) {
      try {
        await stopRealtimeRecording();
        finalizedByRealtime = hadRealtimeSession;
      } catch (recordingError) {
        recordClientLog("error", "Realtime recording stop failed; falling back to meeting close", {
          meeting_id: meeting.id,
          error: recordingError?.message || String(recordingError)
        });
      }
    }
    if (!finalizedByRealtime) await api.archiveMeeting(meeting.id);
    meeting.status = "已结束";
    rememberMeetingStatus(meeting.id, meeting.status);
    state.endingMeeting = false;
    closeMeetingEvents();
    state.view = "summary";
    setToast("会议已结束，后端正在生成交付物");
    render();
    await refreshDeliverables(meeting.id);
  } catch (error) {
    state.endingMeeting = false;
    setToast(`结束会议失败：${error.message}`, false);
    render();
  }
}

async function deleteMeetingById(meetingId) {
  const meeting = meetings.find((item) => item.id === meetingId);
  if (!meeting) return;
  try {
    await api.deleteMeeting(meetingId);
    const index = meetings.findIndex((item) => item.id === meetingId);
    if (index >= 0) meetings.splice(index, 1);
    forgetMeetingStatus(meetingId);
    transcriptRecordStore.remove(meetingId);
    if (state.selectedMeetingId === meetingId) {
      state.selectedMeetingId = meetings[0]?.id || "";
      resetRecordingState();
      closeMeetingEvents();
    }
    if (state.loadedMeetingDetailId === meetingId) state.loadedMeetingDetailId = "";
    setToast("会议已删除");
  } catch (error) {
    setToast(`会议删除失败：${error.message}`, false);
  }
  render();
}

function saveApiDownload(download, fallbackName) {
  if (!download?.blob) throw new Error("后端未返回可下载文件");
  const url = URL.createObjectURL(download.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = download.filename || fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadCurrentDeliverable(id) {
  if (state.downloadBusyMode || state.downloadBusyId) return;
  const current = deliverables.find((item) => item.id === id) || deliverables[0];
  if (!current?.kind) return;
  const kind = canonicalDeliverableKind(current.kind);
  const spec = deliverableArchiveSpecs.find((item) => item.kind === kind);
  state.showDeliverableDownloadMenu = false;
  state.downloadBusyMode = "single";
  state.downloadBusyId = current.id;
  render();
  try {
    const download = await api.downloadDeliverable(state.selectedMeetingId, kind);
    saveApiDownload(download, spec?.filename || `${kind}.${kind === "demo" ? "html" : "md"}`);
    setToast(`${current.name} 已开始下载`);
  } catch (error) {
    setToast(`交付物下载失败：${error.message}`, false);
  } finally {
    state.downloadBusyId = "";
    state.downloadBusyMode = "";
  }
  render();
}

async function downloadAllDeliverables() {
  if (state.downloadBusyMode || !state.selectedMeetingId) return;
  const progress = { current: 0, total: deliverableArchiveSpecs.length };
  state.showDeliverableDownloadMenu = false;
  state.downloadBusyMode = "all";
  state.downloadProgress = progress;
  render();

  try {
    const results = await Promise.all(deliverableArchiveSpecs.map(async (spec) => {
      try {
        const download = await api.downloadDeliverable(state.selectedMeetingId, spec.kind);
        return {
          ok: true,
          name: spec.filename,
          data: new Uint8Array(await download.blob.arrayBuffer())
        };
      } catch (error) {
        return { ok: false, label: spec.label, error };
      } finally {
        progress.current += 1;
        render();
      }
    }));

    const failed = results.filter((item) => !item.ok);
    if (failed.length) {
      throw new Error(`以下文件暂不可用：${failed.map((item) => item.label).join("、")}`);
    }

    const archive = createZipBlob(results.map((item) => ({ name: item.name, data: item.data })));
    const meeting = getSelectedMeeting();
    const safeMeetingName = String(meeting?.title || state.selectedMeetingId)
      .replace(/[<>:"/\\|?*]+/g, "-")
      .slice(0, 80);
    saveApiDownload({
      blob: archive,
      filename: `${safeMeetingName}-全部交付物.zip`
    }, `${safeMeetingName}-全部交付物.zip`);
    setToast("六份交付物已打包并开始下载");
  } catch (error) {
    setToast(`全部交付物下载失败：${error.message}`, false);
  } finally {
    state.downloadBusyMode = "";
    state.downloadProgress = null;
    render();
  }
}

const materialPreviewMimeByExtension = Object.freeze({
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  txt: "text/plain",
  log: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  xml: "application/xml",
  html: "text/html"
});

function normalizePreviewMime(value) {
  const mime = String(value || "").split(";", 1)[0].trim().toLowerCase();
  if (mime === "application/pdf") return mime;
  if (["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp"].includes(mime)) return mime;
  if (mime.startsWith("text/")) return mime;
  if (["application/json", "application/xml"].includes(mime)) return mime;
  return "";
}

function resolveMaterialPreviewMime(material, download) {
  const explicitMime = [download?.contentType, download?.blob?.type, material?.contentType]
    .map(normalizePreviewMime)
    .find(Boolean);
  if (explicitMime) return explicitMime;
  const extension = String(material?.name || download?.filename || "").split(".").pop().toLowerCase();
  return materialPreviewMimeByExtension[extension] || (material?.type === "pdf" ? "application/pdf" : "");
}

function isTextMaterialPreview(mime) {
  return mime.startsWith("text/") || ["application/json", "application/xml"].includes(mime);
}

function normalizeMaterialPreviewText(text, mime) {
  const value = String(text ?? "").replace(/\r\n?/g, "\n");
  if (mime !== "application/json") return value;
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function materialPreviewErrorMessage(error) {
  const message = String(error?.message || error || "未知错误");
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(message)) {
    return "后端未能返回材料原文件，请重试；若持续失败，请检查材料下载接口。";
  }
  return `材料读取失败：${message}`;
}

async function loadMaterialPreview(materialId) {
  const material = materials.find((item) => item.id === materialId);
  if (!material) return;
  clearPresentationPreview();
  const loadSequence = materialPreviewLoadSequence;
  state.presentationName = material.name;
  state.presentationLoading = true;
  render();
  try {
    let download = getCachedMaterialPreviewDownload(material);
    if (!download) {
      download = await api.downloadMaterial(materialId);
      if (loadSequence !== materialPreviewLoadSequence) return;
      download = cacheMaterialPreviewDownload(material, download);
    }
    if (loadSequence !== materialPreviewLoadSequence) return;
    const resolvedMime = resolveMaterialPreviewMime(material, download);
    state.presentationMime = resolvedMime;
    if (isTextMaterialPreview(resolvedMime)) {
      const previewBlob = download.blob.slice(0, download.blob.size, resolvedMime);
      state.presentationText = normalizeMaterialPreviewText(await previewBlob.text(), resolvedMime);
    } else if (resolvedMime) {
      const previewBlob = download.blob.slice(0, download.blob.size, resolvedMime);
      presentationPreviewBlob = previewBlob;
      state.presentationUrl = URL.createObjectURL(previewBlob);
    } else {
      state.presentationError = "当前格式暂不支持在线阅读，可下载原文件查看。";
    }
    setToast(state.presentationUrl || isTextMaterialPreview(resolvedMime)
      ? `${material.name} 已投屏`
      : `${material.name} 已选中；当前格式暂不支持在线阅读`);
  } catch (error) {
    if (loadSequence !== materialPreviewLoadSequence) return;
    state.presentationError = materialPreviewErrorMessage(error);
    recordClientLog("error", "Material preview failed", {
      meeting_id: state.selectedMeetingId,
      material_id: material.id,
      filename: material.name,
      message: error?.message || String(error)
    });
    setToast(state.presentationError, false);
  } finally {
    if (loadSequence !== materialPreviewLoadSequence) return;
    state.presentationLoading = false;
    render();
  }
}

async function presentMaterial(materialId) {
  const material = materials.find((item) => item.id === materialId);
  if (!material) return;
  state.selectedMaterial = material.id;
  state.stageTab = "presentation";
  await loadMaterialPreview(material.id);
}

async function toggleStageFullscreen() {
  const target = document.querySelector(".center-card");
  if (!target) {
    setToast("未找到可全屏展示的内容");
    render();
    return;
  }
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      setToast("已退出全屏");
      render();
    } else if (state.stageFullscreen) {
      state.stageFullscreen = false;
      document.body.classList.remove("stage-fullscreen-active");
      setToast("已退出全屏");
      render();
    } else if (document.fullscreenEnabled) {
      await target.requestFullscreen();
      state.toast = "已进入全屏";
    } else {
      state.stageFullscreen = true;
      document.body.classList.add("stage-fullscreen-active");
      setToast("已进入全屏");
      render();
    }
  } catch (error) {
    state.stageFullscreen = true;
    document.body.classList.add("stage-fullscreen-active");
    setToast("已进入全屏");
    render();
  }
}

function getKnowledgeDocById(id) {
  return knowledgeDocs.find((item) => item.id === id) || getSelectedKnowledgeDoc();
}

function saveKnowledgeRename(id) {
  const doc = getKnowledgeDocById(id);
  const name = document.querySelector(".knowledge-rename-input")?.value.trim();
  if (!doc || !name) {
    setToast("请输入新的文档名称", false);
    render();
    return;
  }
  doc.name = name;
  setToast("名称仅在当前页面更新；后端暂缺知识库元数据更新接口", false);
  render();
}

async function downloadKnowledgeSource(id) {
  const doc = getKnowledgeDocById(id);
  if (!doc) return;
  try {
    const download = await api.downloadKnowledgeDocument(doc.id);
    saveApiDownload(download, doc.name);
    setToast("知识库源文件已开始下载", false);
  } catch (error) {
    setToast(`知识库文件下载失败：${error.message}`, false);
  }
  render();
}

async function deleteKnowledgeDocument(id) {
  const doc = knowledgeDocs.find((item) => item.id === id);
  if (!doc) return;
  state.deletingKnowledgeId = doc.id;
  render();
  try {
    const response = await api.deleteKnowledgeDocument(doc.id);
    if (response?.status !== undefined && Number(response.status) !== 200) {
      throw new Error(`后端返回状态 ${response.status}`);
    }
    if (response?.doc_id && String(response.doc_id) !== String(doc.id)) {
      throw new Error("后端返回的文档 ID 与删除请求不一致");
    }
    const index = knowledgeDocs.findIndex((item) => item.id === doc.id);
    if (index >= 0) knowledgeDocs.splice(index, 1);
    state.selectedKnowledge = knowledgeDocs[0]?.id || "";
    state.knowledgeTotal = Math.max(0, Number(state.knowledgeTotal || 0) - 1);
    state.pendingDeleteKnowledgeId = "";
    state.modal = "";
    recordClientLog("info", "Knowledge document deleted", { doc_id: response?.doc_id || doc.id });
    setToast("知识文档已从后端删除");
  } catch (error) {
    setToast(`知识文档删除失败：${error.message}`, false);
  } finally {
    state.deletingKnowledgeId = "";
  }
  render();
}

function renderLogin() {
  const isRegister = state.authMode === "register";
  return `
    <main class="login-page">
      <section class="login-hero">
        <div class="login-copy">
          ${logo()}
          <h1>AI 会议协同与交付生成系统</h1>
          <p>把无数人的项目经验，变成你的交付伙伴</p>
          <div class="feature-pills">
            <span>${icon("mic")}本地录音</span>
            <span>${icon("book")}知识索引</span>
            <span>${icon("sparkle")}经验沉淀</span>
            <span>${icon("send")}持续交付</span>
          </div>
        </div>
      </section>
      <section class="login-card panel">
        <header class="login-card-head">
          <span>测试版</span>
          <h2>${isRegister ? "注册账号" : "账号登录"}</h2>
          <p>使用邮箱和密码${isRegister ? "创建 VPBuddy 账号" : "进入 VPBuddy"}。</p>
        </header>
        <div class="login-tabs" aria-label="认证方式">
          <button class="${isRegister ? "" : "active"}" data-action="auth-mode" data-mode="login">账号登录</button>
          <button class="${isRegister ? "active" : ""}" data-action="auth-mode" data-mode="register">注册账号</button>
        </div>
        <label class="field with-icon">
          ${icon("user")}
          <input data-field="auth-email" type="email" value="${escapeHtml(state.authEmail)}" placeholder="请输入邮箱" autocomplete="email" ${state.authBusy ? "disabled" : ""} />
        </label>
        <label class="field with-icon">
          ${icon("lock")}
          <input data-field="auth-password" type="password" value="" placeholder="请输入密码（至少 6 位）" autocomplete="${isRegister ? "new-password" : "current-password"}" ${state.authBusy ? "disabled" : ""} />
        </label>
        <button class="primary wide" data-action="auth-submit" ${state.authBusy ? "disabled" : ""}>${state.authBusy ? "请稍候…" : isRegister ? "注册并登录" : "登录"}</button>
        <p class="login-note" aria-live="polite">${state.authError ? escapeHtml(state.authError) : "账号由 VPBuddy 后端统一认证。"}</p>
      </section>
      <footer class="login-status">
        <span><i class="status-dot"></i>客户端已就绪</span>
        <span>${icon("mic", 18)}麦克风将在录制时授权</span>
        <span>设备状态将在会议中检测</span>
      </footer>
    </main>
  `;
}

function renderShell(content) {
  return `
    <main class="app-shell">
      <aside class="sidebar">
        ${logo(true)}
        <nav class="side-nav">
          ${navItems.map(([view, label, iconName]) => `
            <button class="${state.view === view ? "active" : ""}" data-action="nav" data-view="${view}">
              ${icon(iconName)}<span>${label}</span>
            </button>
          `).join("")}
        </nav>
        <div class="account-menu-wrap">
          ${state.showAccountMenu ? `
            <div class="account-menu" role="menu" aria-label="个人账号菜单">
              <button data-action="download-log" role="menuitem">
                ${icon("download", 20)}
                <span><strong>下载 Log</strong><small>导出客户端运行诊断</small></span>
              </button>
              <button class="danger" data-action="logout" role="menuitem">
                ${icon("power", 20)}
                <span><strong>退出登录</strong><small>结束当前账号会话</small></span>
              </button>
            </div>
          ` : ""}
          <button class="user-card" data-action="toggle-account-menu" title="打开个人账号菜单" aria-expanded="${state.showAccountMenu}">
            <span class="avatar">${escapeHtml((user.name || "VP").slice(0, 2).toUpperCase())}</span>
            <span class="user-card-copy"><strong title="${escapeHtml(user.name)}">${escapeHtml(user.name)}</strong><em>个人账号</em></span>
            <span class="account-chevron ${state.showAccountMenu ? "open" : ""}">${icon("chevronDown", 18)}</span>
          </button>
        </div>
      </aside>
      <section class="shell-main">${content}</section>
    </main>
  `;
}

function renderWorkspace() {
  const body = `
    <header class="page-header">
      <div>
        <h1>工作台</h1>
        <p class="api-state ${state.apiStatus}">${state.apiMessage}</p>
      </div>
      <div class="page-actions">
        <button class="ghost icon-only" data-action="refresh-meetings" title="刷新会议" aria-label="刷新会议">${icon("refresh")}</button>
        <button class="primary" data-action="open-create">${icon("plus")}新建会议</button>
      </div>
    </header>
    <section class="meeting-grid">
      ${meetings.length
        ? meetings.map(renderMeetingCard).join("")
        : renderEmptyState(
            "暂无会议",
            state.apiStatus === "error" ? state.apiMessage : "后端当前没有会议数据。点击新建会议可以创建一条真实会议。",
            "meeting-empty"
          )}
    </section>
    ${state.showCreate ? renderCreateModal() : ""}
  `;
  return renderShell(body);
}

function renderMeetingCard(meeting) {
  const running = meeting.status === "进行中";
  const coverStyle = meeting.cover ? `style="background-image:url('${escapeHtml(meeting.cover)}')"` : "";
  return `
    <article class="meeting-card panel">
      <div class="meeting-cover ${meeting.cover ? "" : "empty-cover"}" ${coverStyle}>
        ${meeting.cover ? "" : `<span class="meeting-cover-brand">${logo(true)}</span>`}
        <span class="status-chip ${running ? "live" : "done"}"><i></i>${escapeHtml(meeting.status)}</span>
        <button class="meeting-delete" data-action="delete-meeting" data-id="${escapeHtml(meeting.id)}" title="删除会议" aria-label="删除会议">${icon("close", 16)}</button>
      </div>
      <div class="meeting-info">
        <h2>${escapeHtml(meeting.title)}</h2>
        <p>${escapeHtml(meeting.desc)}</p>
        <div class="meeting-actions">
          <span>${icon("calendar", 18)}${escapeHtml(meeting.time)}</span>
          <button class="${running ? "primary compact" : "ghost compact"}" data-action="${running ? "open-meeting" : "open-summary"}" data-id="${escapeHtml(meeting.id)}">
            ${running ? "进入会议" : "查看总结"} ${icon(running ? "arrowRight" : "file", 18)}
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderCreateModal() {
  return `
    <div class="modal-backdrop">
      <section class="create-modal">
        <button class="modal-close" data-action="close-create">${icon("close")}</button>
        <div class="modal-main">
          <h2>快速新建会议</h2>
          <label>会议名称 <strong>*</strong><input data-field="meeting-title" maxlength="50" placeholder="请输入会议名称" /></label>
          <label>项目/客户（可选）<input data-field="meeting-project" maxlength="50" placeholder="请输入项目或客户名称（可选）" /></label>
        </div>
        <div class="device-box">
          <div class="device-item">${icon("mic", 34)}<span><strong>麦克风</strong><em>录制时授权</em></span></div>
          <div class="device-item">${icon("bot", 34)}<span><strong>录音</strong><em>等待开始</em></span></div>
        </div>
        <footer class="modal-actions">
          <button class="light" data-action="close-create">取消</button>
          <button class="primary" data-action="start-meeting">${icon("play")}开始会议</button>
        </footer>
      </section>
    </div>
  `;
}

function renderMeetingLoadingColumns() {
  const rows = Array.from({ length: 5 }, (_, index) => `
    <span class="loading-row ${index === 4 ? "short" : ""}"></span>
  `).join("");
  return `
    <aside class="meeting-left panel meeting-loading-panel">
      <div class="loading-tab-row"><span></span><span></span></div>
      <div class="loading-stack">${rows}</div>
    </aside>
    <section class="stage-center">
      <div class="center-card panel meeting-loading-center">
        <div class="loading-tab-row"><span></span><span class="short"></span></div>
        <div class="meeting-loading-message" role="status" aria-live="polite">
          <i class="meeting-loading-spinner"></i>
          <strong>正在加载会议内容</strong>
          <p>正在同步会议记录、材料和交付物</p>
        </div>
      </div>
      ${renderVpbuddyComposer()}
    </section>
    <aside class="ai-panel panel meeting-loading-panel">
      <div class="loading-tab-row"><span></span></div>
      <div class="loading-stack">${rows}</div>
    </aside>
  `;
}

function renderMeetingStage() {
  const meeting = getSelectedMeeting();
  const running = meeting?.status !== "已结束";
  const recording = state.recordingStatus === "recording";
  const paused = state.recordingStatus === "paused";
  const recordingBusy = ["starting", "pausing", "resuming", "stopping"].includes(state.recordingStatus);
  const recordingLabel = state.recordingStatus === "starting"
    ? "连接中"
    : state.recordingStatus === "pausing"
      ? "暂停中"
      : state.recordingStatus === "resuming"
        ? "恢复中"
    : state.recordingStatus === "stopping"
      ? "停止中"
      : recording
        ? "暂停录制"
        : paused
          ? "继续录制"
        : state.recordingStatus === "error" ? "重试录制" : "开始录制";
  const recordingControlLabel = running ? recordingLabel : "已结束";
  const recordingAriaLabel = running
    ? `${recordingControlLabel}：${state.recordingMessage}`
    : "会议已结束，无法录制";
  return `
    <main class="stage-screen">
      <header class="stage-topbar">
        <div class="stage-left">
          ${logo(true)}
          <button class="ghost back" data-action="nav" data-view="workspace">${icon("arrowLeft")}返回工作台</button>
        </div>
        <div class="stage-title">
          ${state.meetingTitleEditing ? `
            <label class="stage-title-editor">
              <input
                class="stage-title-input"
                value="${escapeHtml(state.meetingTitleDraft)}"
                maxlength="50"
                aria-label="会议名称"
                ${state.meetingTitleSaving ? "disabled" : ""}
              />
              <button class="stage-title-edit-action save" data-action="save-meeting-title" title="保存会议名称" aria-label="保存会议名称" ${state.meetingTitleSaving ? "disabled" : ""}>${icon("check", 17)}</button>
              <button class="stage-title-edit-action cancel" data-action="cancel-meeting-title" title="取消修改" aria-label="取消修改" ${state.meetingTitleSaving ? "disabled" : ""}>${icon("close", 17)}</button>
            </label>
          ` : `<h1 class="stage-meeting-title" data-role="meeting-title" title="双击修改会议名称">${escapeHtml(meeting?.title || "会议空间")}</h1>`}
          <button
            class="recording ${recording ? "active" : ""} ${state.recordingStatus}"
            data-action="toggle-recording"
            data-recording-state="${state.recordingStatus}"
            title="${escapeHtml(state.recordingMessage)}"
            aria-label="${escapeHtml(recordingAriaLabel)}"
            aria-pressed="${recording}"
            aria-busy="${recordingBusy}"
            aria-describedby="recording-timer"
            ${!running || recordingBusy || state.meetingDetailLoading ? "disabled" : ""}
          ><i aria-hidden="true"></i><span class="recording-label">${recordingControlLabel}</span></button>
          <span class="timer" id="recording-timer" role="timer">${formatRecordingTime(state.recordingElapsed)}</span>
        </div>
        <div class="stage-actions">
          <button class="danger" data-action="end-meeting" ${state.endingMeeting || state.meetingDetailLoading ? "disabled" : ""}>${icon("power")}${state.endingMeeting ? "结束中" : "结束会议"}</button>
        </div>
      </header>
      <section class="stage-layout ${state.meetingDetailLoading ? "meeting-detail-loading" : ""}" ${state.meetingDetailLoading ? 'aria-busy="true"' : ""}>
        ${state.meetingDetailLoading ? renderMeetingLoadingColumns() : `
          ${renderMeetingLeftPanel()}
          <section class="stage-center">
            <div class="center-card panel ${state.stageFullscreen ? "is-fullscreen" : ""}">
              <div class="center-tabs">
                <button class="${state.stageTab === "presentation" ? "active" : ""}" data-action="stage-tab" data-tab="presentation">投屏内容</button>
                <button class="${state.stageTab === "deliverable" ? "active" : ""}" data-action="stage-tab" data-tab="deliverable">交付物</button>
              </div>
              ${state.stageTab === "presentation" ? renderPresentationCanvas() : renderDeliverableCanvas()}
            </div>
            ${renderVpbuddyComposer()}
          </section>
          ${renderAIPanel()}
        `}
      </section>
    </main>
  `;
}

function renderMeetingLeftPanel() {
  if (state.stageTab === "deliverable") return renderDeliverableListPanel();

  const tab = state.meetingLeftTab === "understanding" && !uiVisibility.meetingUnderstandingTab
    ? "records"
    : state.meetingLeftTab;
  return `
    <aside class="meeting-left panel">
      <div class="panel-tabs">
        <button class="${tab === "records" ? "active" : ""}" data-action="left-tab" data-tab="records">会议记录</button>
        <button class="${tab === "materials" ? "active" : ""}" data-action="left-tab" data-tab="materials">会议资料</button>
        ${uiVisibility.meetingUnderstandingTab ? `<button class="${tab === "understanding" ? "active" : ""}" data-action="left-tab" data-tab="understanding">会议理解</button>` : ""}
      </div>
      ${tab === "records" ? renderMeetingRecords() : tab === "understanding" ? renderUnderstanding() : renderMaterialsList()}
    </aside>
  `;
}

function isUploadInProgress() {
  return state.uploadProgress?.status === "uploading";
}

function startUploadProgress(context, name, total) {
  const progress = {
    context,
    name,
    current: 0,
    total,
    status: "uploading",
    materialIds: [],
    failureKind: ""
  };
  state.uploadProgress = progress;
  return progress;
}

function syncActiveMaterialProgress() {
  const progress = state.uploadProgress;
  if (!progress || progress.status !== "parsing" || !progress.materialIds.length) return;
  const phase = aggregateMaterialProcessingPhase(materials, state.vpbuddyMessages, progress.materialIds);
  if (phase === "uploaded") return;
  progress.status = phase === "parsed" ? "complete" : "error";
  progress.failureKind = phase === "parse-error" ? "parse" : "";
}

function scheduleCompletedUploadProgressClear(progress) {
  if (progress.status !== "complete") return;
  window.setTimeout(() => {
    if (state.uploadProgress === progress && progress.status === "complete") {
      state.uploadProgress = null;
      render();
    }
  }, 1800);
}

function renderUploadProgress(context) {
  const progress = state.uploadProgress;
  if (!progress || progress.context !== context) return "";
  const percent = progress.total ? Math.round((progress.current / progress.total) * 100) : 0;
  const isSending = context === "vpbuddy-material";
  const isKnowledge = context === "knowledge";
  const isProminent = isSending || isKnowledge;
  const activeItem = Math.min(progress.total, progress.current + (progress.status === "uploading" ? 1 : 0));
  const isParsing = progress.status === "parsing";
  const isParseError = progress.status === "error" && progress.failureKind === "parse";
  const statusText = progress.status === "complete"
    ? `${progress.name} ${isSending ? "发送完成" : "上传完成"}`
    : progress.status === "error"
      ? `${progress.name} ${isParseError ? "解析失败" : isSending ? "发送失败" : "上传失败"}`
      : isParsing
        ? `${progress.name} 上传成功，正在解析`
      : `${isSending ? "正在发送" : "正在上传"} ${progress.name}`;
  const progressTitle = progress.status === "complete"
    ? (isSending ? "材料发送完成" : "知识文档上传完成")
    : progress.status === "error"
      ? (isParseError ? "材料解析失败" : isSending ? "材料发送失败" : "知识文档上传失败")
      : isParsing
        ? "上传成功，正在解析"
      : (isSending ? "正在发送材料" : "正在上传知识文档");
  const progressState = progress.status === "complete"
    ? "100%"
    : progress.status === "error"
      ? "失败"
      : isParsing
        ? "解析中"
      : (isSending ? "发送中" : "上传中");
  return `
    <div class="upload-progress ${isKnowledge ? "knowledge-upload-progress" : ""} ${isSending ? "vpbuddy-send-progress" : ""} ${progress.status} ${progress.status === "uploading" ? "indeterminate" : ""}" role="progressbar" aria-live="polite" aria-label="${escapeHtml(statusText)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}">
      ${isProminent ? `
        <div class="upload-progress-head">
          <span class="upload-progress-icon">${icon(progress.status === "complete" ? "check" : progress.status === "error" ? "close" : "upload", 20)}</span>
          <span class="upload-progress-copy">
            <strong>${progressTitle}</strong>
            <em title="${escapeHtml(progress.name)}">${escapeHtml(progress.name)}</em>
          </span>
          <b>${progressState}</b>
        </div>
      ` : ""}
      <div class="upload-progress-track"><i style="width:${percent}%"></i></div>
      ${isProminent ? `
        <div class="upload-progress-meta">
          <span>${progress.status === "uploading" ? `${isSending ? "正在发送" : "正在处理"}第 ${activeItem} 个${isSending ? "材料" : "文档"}` : escapeHtml(statusText)}</span>
          <span>${progress.current}/${progress.total} 已完成</span>
        </div>
        ${progress.status === "error" ? `<button class="ghost compact" data-action="retry-upload" data-context="${escapeHtml(context)}">${isParseError ? "重新上传" : "重试"}</button>` : ""}
      ` : `<span>${escapeHtml(statusText)} · ${progress.current}/${progress.total}</span>`}
    </div>
  `;
}

function renderDemoVersionControl() {
  const selected = getSelectedDemoVersion();
  if (!selected || !demoVersions.length) return "";
  return `
    <label class="deliverable-version-control demo-version-control" data-action="demo-version-control" title="${escapeHtml(selected.displayLabel || selected.label)}">
      <span>Demo 版本</span>
      <select class="demo-version-select" aria-label="切换 Demo 版本">
        ${demoVersions.map((item) => `
          <option value="${item.version}" title="${escapeHtml(item.displayLabel || item.label)}" ${item.version === selected.version ? "selected" : ""}>${escapeHtml(item.displayLabel || item.label)}</option>
        `).join("")}
      </select>
    </label>
  `;
}

function renderDeliverableDownloadMenu(current) {
  const busy = Boolean(state.downloadBusyMode);
  const allProgress = state.downloadBusyMode === "all" && state.downloadProgress
    ? `${state.downloadProgress.current}/${state.downloadProgress.total}`
    : "";
  return `
    <div class="deliverable-download-wrap">
      <button
        class="ghost small deliverable-download-trigger"
        data-action="toggle-deliverable-download-menu"
        aria-haspopup="menu"
        aria-expanded="${state.showDeliverableDownloadMenu}"
        ${busy ? "disabled" : ""}
      >
        ${icon("download", 16)}
        ${state.downloadBusyMode === "all" ? `打包中 ${allProgress}` : state.downloadBusyMode === "single" ? "下载中" : "下载"}
        ${icon("chevronDown", 14)}
      </button>
      ${state.showDeliverableDownloadMenu ? `
        <div class="deliverable-download-menu" role="menu">
          <button data-action="download-current-deliverable" data-id="${escapeHtml(current.id)}" role="menuitem">
            ${icon("file", 18)}
            <span><strong>下载单个文件</strong><em>${escapeHtml(current.name)}</em></span>
          </button>
          <button data-action="download-all-deliverables" role="menuitem">
            ${icon("download", 18)}
            <span><strong>下载全部交付物</strong><em>六份文件打包为 ZIP</em></span>
          </button>
        </div>
      ` : ""}
    </div>
  `;
}

function renderDeliverableListPanel() {
  const tab = state.deliverableLeftTab === "records" ? "records" : "deliverables";
  return `
    <aside class="meeting-left panel" data-sidebar="deliverable">
      <div class="panel-tabs" role="tablist" aria-label="交付物侧栏">
        <button class="${tab === "records" ? "active" : ""}" data-action="deliverable-left-tab" data-tab="records" role="tab" aria-selected="${tab === "records"}">会议记录</button>
        <button class="${tab === "deliverables" ? "active" : ""}" data-action="deliverable-left-tab" data-tab="deliverables" role="tab" aria-selected="${tab === "deliverables"}">交付物列表</button>
      </div>
      ${tab === "records" ? renderMeetingRecords() : renderDeliverableList()}
    </aside>
  `;
}

function renderDeliverableList() {
  const orderedDeliverables = getOrderedDeliverables();
  return `
    <header class="deliverable-list-head">
      <h2>交付物列表</h2>
      <p>会中持续生成，可切换版本并回到会议证据。</p>
    </header>
    <div class="deliverable-stack">
      ${orderedDeliverables.length ? orderedDeliverables.map((item) => `
        <button class="deliverable-row ${canonicalDeliverableKind(item.kind) === "demo" ? "is-demo" : ""} ${state.selectedDeliverable === item.id ? "active" : ""}" data-action="select-deliverable" data-id="${escapeHtml(item.id)}">
          ${docBadge(item.type)}
          <span><strong>${escapeHtml(item.name)}</strong><em>${escapeHtml(item.status)} · ${escapeHtml(item.time)}</em></span>
          ${canonicalDeliverableKind(item.kind) === "demo" ? `<small>${escapeHtml(getSelectedDemoVersion()?.label || item.version)}</small>` : ""}
        </button>
      `).join("") : renderEmptyState("暂无交付物", "后端尚未生成本次会议的交付物。", "stack-empty")}
    </div>
  `;
}

function renderMaterialsList() {
  const uploadBusy = isUploadInProgress();
  const materialUploading = state.uploadProgress?.context === "material" && uploadBusy;
  return `
    ${uiVisibility.meetingMaterialUploadButton ? `<button class="primary wide upload-button" data-action="open-upload" data-context="material" ${uploadBusy ? "disabled" : ""} aria-busy="${materialUploading}">${icon("upload")}${materialUploading ? "上传中" : "上传材料"}</button>` : ""}
    ${renderUploadProgress("material")}
    <div class="material-stack">
      ${materials.length
        ? materials.map((item, index) => `
          <button class="material-row ${state.selectedMaterial === item.id ? "active" : ""}" data-action="select-material" data-id="${escapeHtml(item.id)}" title="单击选中，双击投屏">
            ${docBadge(item.type)}
            <span><strong>${escapeHtml(item.name)}</strong><em>${escapeHtml(item.size)}</em></span>
          </button>
        `).join("")
        : renderEmptyState(
            "暂无本次会议材料",
            "当前会议没有材料记录。上传成功后这里会显示会议级材料。",
            "stack-empty"
          )}
    </div>
  `;
}

function renderMeetingRecords() {
  const recordStatusText = state.recordingStatus === "recording"
    ? "实时转写中"
    : state.recordingStatus === "paused"
      ? "录制已暂停"
    : state.recordingStatus === "starting"
      ? "正在连接转写"
      : state.recordingStatus === "error" ? "转写连接异常" : state.recordingStatus === "stopped" ? "录制已结束" : "录音未开始";
  return `
    <section class="record-panel">
      <header class="record-head">
        <span class="${state.recordingStatus}"><i></i>${recordStatusText}</span>
        <button data-action="refresh-transcript">${icon("refresh", 16)}同步</button>
      </header>
      <div class="record-stream">
        ${meetingRecords.length
          ? meetingRecords.map((item) => `
            <article class="record-item">
              <time>${escapeHtml(item.time)}</time>
              <p>${escapeHtml(item.text)}</p>
            </article>
          `).join("")
          : renderEmptyState(
              "暂无转写记录",
              state.recordingStatus === "recording" ? "正在等待后端 ASR 返回说话人、时间和内容分段。" : "点击顶部“开始录制”后，实时转写会显示在这里。",
              "stack-empty"
            )}
      </div>
    </section>
  `;
}

function renderUnderstanding() {
  if (!meetingUnderstanding.length) {
    return renderEmptyState(
      "暂无会议理解数据",
      "后端尚未返回会议需求、目标、风险或待确认事项。",
      "understanding-empty"
    );
  }

  const groups = [
    ["需求与目标", "blue", meetingUnderstanding.filter((item) => ["req", "goal", "feat"].includes(item.type))],
    ["待确认事项", "yellow", meetingUnderstanding.filter((item) => item.type === "que" || item.status === "pending")],
    ["风险事项", "green", meetingUnderstanding.filter((item) => item.type === "risk")]
  ].filter(([, , items]) => items.length);
  return groups.map(([title, tone, items]) => `
    <section class="understand-card ${tone}">
      <h3><i></i>${title}</h3>
      ${items.map((item) => `<p><span>•</span>${escapeHtml(item.text || "")}</p>`).join("")}
    </section>
  `).join("");
}

function renderAnnotationLayer() {
  const svg = state.annotations.map((item) => {
    if (item.type === "pen") {
      const points = item.points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
      return `<path data-action="annotation-hit" data-annotation-id="${item.id}" d="${points}" stroke="${item.color}" stroke-width="${item.size}" fill="none" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" />`;
    }
    if (item.type === "rect") {
      const x = Math.min(item.x, item.x2);
      const y = Math.min(item.y, item.y2);
      const width = Math.abs(item.x2 - item.x);
      const height = Math.abs(item.y2 - item.y);
      return `<rect data-action="annotation-hit" data-annotation-id="${item.id}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${height.toFixed(2)}" rx="0.8" stroke="${item.color}" stroke-width="${item.size}" fill="rgba(47, 140, 255, 0.08)" vector-effect="non-scaling-stroke" />`;
    }
    return "";
  }).join("");

  const textNotes = state.annotations.filter((item) => item.type === "text").map((item) => `
    <button class="annotation-text-note" data-action="annotation-hit" data-annotation-id="${item.id}" style="left:${item.x}%;top:${item.y}%;color:${item.color}">
      ${escapeHtml(item.text)}
    </button>
  `).join("");

  return { svg, textNotes };
}

function renderMaterialPreviewContent(selectedMaterial) {
  const materialName = state.presentationName || selectedMaterial?.name || "会议材料";
  if (state.presentationLoading) {
    return `
      <div class="material-preview-status" role="status" aria-live="polite" aria-busy="true">
        <i class="meeting-loading-spinner"></i>
        <strong>正在准备投屏预览</strong>
        <span>正在读取 ${escapeHtml(materialName)}</span>
      </div>
    `;
  }
  if (state.presentationUrl && state.presentationMime.startsWith("image/")) {
    return `<img src="${state.presentationUrl}" alt="${escapeHtml(materialName)}" />`;
  }
  if (state.presentationUrl && state.presentationMime.includes("pdf")) {
    return `
      <div
        class="material-pdf-preview"
        data-stable-stage-surface="material-preview"
        data-stable-stage-source="${escapeHtml(state.presentationUrl)}"
        data-pdf-source="${escapeHtml(state.presentationUrl)}"
        aria-label="${escapeHtml(materialName)}"
      ><canvas class="material-pdf-canvas"></canvas></div>
    `;
  }
  if (isTextMaterialPreview(state.presentationMime)) {
    if (state.presentationMime === "text/markdown") {
      return `<article class="material-text-preview markdown-body">${renderMarkdown(state.presentationText)}</article>`;
    }
    return `<pre class="material-text-preview material-plain-text">${escapeHtml(state.presentationText || "（空文档）")}</pre>`;
  }
  if (state.presentationError) {
    return `
      <div class="stage-empty material-preview-error empty-state">
        <strong>${escapeHtml(materialName)}</strong>
        <p>${escapeHtml(state.presentationError)}</p>
        ${selectedMaterial ? `<button class="ghost" data-action="retry-material-preview" data-id="${escapeHtml(selectedMaterial.id)}">${icon("refresh", 16)}重试读取</button>` : ""}
      </div>
    `;
  }
  return renderEmptyState(
    state.presentationName || selectedMaterial?.name || "暂无投屏内容",
    selectedMaterial ? "双击左侧材料以读取原文件；当前格式如无法直接预览，需要后端补充页面转换接口。" : "上传本次会议材料后，可从左侧清单选择并投屏。",
    "stage-empty"
  );
}

function renderPresentationCanvas() {
  const annotations = renderAnnotationLayer();
  const selectedMaterial = materials.find((item) => item.id === state.selectedMaterial);
  const uploadBusy = isUploadInProgress();
  const screenshotUploading = state.uploadProgress?.context === "vpbuddy-material" && uploadBusy;
  const colors = ["#2f8cff", "#09dba1", "#ffc94c", "#ff4f64"];
  const tools = [
    ["cursor", "指针", "arrowRight"],
    ["pen", "画笔", "pen"],
    ["text", "文字", ""],
    ["rect", "矩形", ""],
    ["eraser", "橡皮", "close"]
  ];
  return `
    <div class="canvas-toolbar">
      <div class="tool-group">
        ${tools.map(([tool, label, iconName]) => `
          <button class="tool-button ${state.activeTool === tool ? "active" : ""}" title="${label}" aria-label="${label}" data-action="tool" data-tool="${tool}">
            ${tool === "text" ? "<strong>T</strong>" : tool === "rect" ? "<i class=\"rect-symbol\"></i>" : icon(iconName)}
          </button>
        `).join("")}
      </div>
      <div class="tool-group">
        ${colors.map((color) => `<button class="color-swatch ${state.annotationColor === color ? "active" : ""}" title="批注颜色" data-action="annotation-color" data-color="${color}" style="--swatch:${color}"></button>`).join("")}
        <button class="size-step" data-action="annotation-size" data-size="-1">-</button>
        <strong class="pen-size">${state.penSize}px</strong>
        <button class="size-step" data-action="annotation-size" data-size="1">+</button>
      </div>
      <div class="tool-group">
        <button title="撤销批注" aria-label="撤销批注" data-action="annotation-undo" ${state.annotationUndoStack.length ? "" : "disabled"}>${icon("undo")}</button>
        <button title="重做批注" aria-label="重做批注" data-action="annotation-redo" ${state.annotationRedoStack.length ? "" : "disabled"}>${icon("redo")}</button>
        <button title="清空批注" data-action="annotation-clear">${icon("close")}</button>
      </div>
      <div class="tool-group slide-tools">
        <button title="上一页" data-action="slide-step" data-step="-1">${icon("arrowLeft")}</button>
        <button title="下一页" data-action="slide-step" data-step="1">${icon("arrowRight")}</button>
      </div>
      <div class="zoom-control"><button data-action="zoom" data-step="-10">-</button><strong>${state.zoom}%</strong><button data-action="zoom" data-step="10">+</button></div>
      <button class="fullscreen-corners" data-action="toggle-fullscreen" title="全屏展示" aria-label="全屏展示">⛶</button>
    </div>
    <div class="slide-frame annotation-canvas tool-${state.activeTool}">
      <div class="stage-zoom-layer stage-render-surface" style="--stage-zoom:${state.zoom / 100}">
        ${renderMaterialPreviewContent(selectedMaterial)}
        <svg class="annotation-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="会议批注层">${annotations.svg}</svg>
        <div class="annotation-text-layer">
          ${annotations.textNotes}
          ${state.textDraft ? `<input class="annotation-text-input" value="${escapeHtml(state.textDraft.value)}" style="left:${state.textDraft.x}%;top:${state.textDraft.y}%" placeholder="输入批注" />` : ""}
        </div>
      </div>
      <button class="stage-capture-button" data-action="capture-screenshot" title="截屏上传" aria-label="截屏上传" ${uploadBusy ? "disabled" : ""} aria-busy="${screenshotUploading}">
        ${icon("camera", 30)}
        <span>截屏</span>
      </button>
    </div>
    ${selectedMaterial ? "" : `<div class="thumb-strip"><span class="thumb-empty">选择材料后显示页面导航</span></div>`}
  `;
}

function renderDeliverableCanvas() {
  const current = getSelectedDeliverable();
  if (!current) return renderEmptyState("暂无交付物", "后端生成文档后会自动显示在这里。", "deliverable-empty");
  const deliverableKind = canonicalDeliverableKind(current.kind);
  const isDemoDeliverable = deliverableKind === "demo";
  const isTextOnlyDeliverable = ["req", "arch", "tasks", "api", "risk"].includes(deliverableKind);
  const selectedDemo = isDemoDeliverable ? getSelectedDemoVersion() || demoVersions[0] : null;
  const bodyContent = String(current.content || "").trim();
  const hasTextBody = isTextOnlyDeliverable && Boolean(bodyContent);
  const headerDescription = [selectedDemo?.summary, current.desc, current.subtitle]
    .map((value) => String(value || "").trim())
    .find((value) => value && value !== bodyContent) || "后端生成文档";
  const displayedVersion = selectedDemo?.label || current.version;
  const previewFile = selectedDemo?.file || "demo_latest.html";
  const demoPreview = isDemoDeliverable ? getDemoPreviewState(current) : null;
  const demoPreviewUrl = demoPreview?.url || "";
  return `
    <div class="deliverable-head">
      <h2>${escapeHtml(current.name)}（${escapeHtml(current.subtitle)}）</h2>
      <div class="deliverable-head-actions">
        ${demoPreviewUrl ? `<button class="ghost small demo-fullscreen-button" data-action="toggle-fullscreen" title="全屏展示 Demo">${icon("maximize", 16)}全屏展示</button>` : ""}
        ${isDemoDeliverable ? renderDemoVersionControl() : ""}
        ${renderDeliverableDownloadMenu(current)}
      </div>
    </div>
    <section class="deliverable-doc ${demoPreviewUrl ? "demo-deliverable-doc" : ""}">
      ${hasTextBody ? "" : `
        <header class="${isTextOnlyDeliverable ? "text-only-deliverable-header" : ""}">
          ${isTextOnlyDeliverable ? "" : docBadge(current.type)}
          <div><h3>${escapeHtml(current.name)}</h3><p>${escapeHtml(headerDescription)}</p></div>
          ${isDemoDeliverable || isTextOnlyDeliverable ? "" : `<span>${escapeHtml(displayedVersion)}</span>`}
        </header>
      `}
      ${demoPreviewUrl
        ? `<iframe
            class="deliverable-demo-preview"
            src="${escapeHtml(demoPreviewUrl)}"
            data-stable-demo-frame="meeting-demo"
            title="${escapeHtml(`${current.name} ${displayedVersion} 预览`)}"
            sandbox="allow-scripts allow-forms allow-modals allow-same-origin"
            referrerpolicy="no-referrer"
          ></iframe>`
        : current.content
        ? isTextOnlyDeliverable
          ? `<article class="deliverable-content markdown-content">${renderMarkdown(current.content)}</article>`
          : `<pre class="deliverable-content">${escapeHtml(current.content)}</pre>`
        : renderEmptyState("暂无在线正文预览", canonicalDeliverableKind(current.kind) === "demo" ? "交互 Demo 请下载 HTML 文件查看。" : "文档正文尚未生成或后端列表仅返回元数据。", "deliverable-empty")}
    </section>
  `;
}

function renderVpbuddyComposer() {
  const messageCount = state.vpbuddyMessages.length;
  const chatBusy = isVpbuddyChatBusy();
  const uploadBusy = isUploadInProgress();
  const materialProgressVisible = state.uploadProgress?.context === "vpbuddy-material";
  const materialSending = state.uploadProgress?.context === "vpbuddy-material" && state.uploadProgress.status === "uploading";
  const messageMarkup = state.vpbuddyMessages.map((item) => {
    const type = ["question", "answer", "material"].includes(item.type) ? item.type : "answer";
    const sender = type === "answer" ? "VPBuddy" : type === "material" ? "我 · 材料" : "我";
    const text = type === "answer" ? stripAssistantReasoning(item.text) : String(item.text || "");
    const renderedText = type === "answer" ? renderMarkdown(text) : escapeHtml(text);
    const body = type === "answer"
      ? `<div class="message-body markdown-content">${renderedText}</div>`
      : `<p class="message-body">${type === "material" ? icon("upload", 15) : ""}<span>${renderedText}</span></p>`;
    const messageStatus = item.status === "sending"
      ? `<span class="message-status sending" role="status">发送中...</span>`
      : item.status === "failed"
        ? `<button class="message-status failed" data-action="retry-vpbuddy-message" data-message-id="${escapeHtml(String(item.id || ""))}" title="${escapeHtml(item.error || "发送失败，点击重试")}" ${chatBusy ? "disabled" : ""}>发送失败 · 重试</button>`
        : "";
    return `
      <article class="chat-message ${type} ${item.status ? `is-${escapeHtml(item.status)}` : ""}">
        <div class="message-meta">
          <strong>${sender}</strong>
          <span class="message-meta-tail"><time>${escapeHtml(item.time || "")}</time>${messageStatus}</span>
        </div>
        ${body}
      </article>
    `;
  }).join("");
  return `
    <section class="send-box center-send-box panel ${state.showComposerHistory ? "is-expanded" : "is-collapsed"} ${materialProgressVisible ? "has-material-progress" : ""}">
      <header>
        <h3>${icon("send")}发送给 VPBuddy</h3>
        <button class="composer-toggle ${state.showComposerHistory ? "open" : ""}" data-action="toggle-composer-history">
          ${state.showComposerHistory ? "收起记录" : `展开记录${messageCount ? ` · ${messageCount}` : ""}`}
        </button>
      </header>
      <div class="composer-history" aria-label="与 VPBuddy 的对话记录">
        ${messageCount ? messageMarkup : `<p class="empty-history">暂无发送记录</p>`}
      </div>
      <div class="composer-row">
        <textarea class="vpbuddy-input" maxlength="500" placeholder="输入你的问题、补充说明或交付要求...">${escapeHtml(state.composerText)}</textarea>
        <div class="composer-actions">
          <span class="composer-count">${state.composerText.length}/500</span>
          <button class="primary" data-action="send-vpbuddy-message" aria-busy="${chatBusy}" ${chatBusy ? "disabled" : ""}>${icon("send", 16)}${chatBusy ? "发送中" : "发送问题"}</button>
          <button class="secondary" data-action="send-vpbuddy-material" ${materialSending ? "disabled" : uploadBusy ? "disabled" : ""} aria-busy="${materialSending}">${icon("upload", 16)}${materialSending ? "发送中" : "发送材料"}</button>
        </div>
      </div>
      ${renderUploadProgress("vpbuddy-material")}
    </section>
  `;
}

function renderAIPanel() {
  const followups = aiFollowupQuestions;
  const explanations = explanationFindings;
  return `
    <aside class="ai-panel panel">
      <header class="ai-panel-head">
        <h2>AI 协同</h2>
        <button data-action="refresh-collab" title="刷新 AI 协同内容">${icon("refresh", 16)}刷新</button>
      </header>
      <div class="followup-list">
        ${followups.length
          ? followups.map((item) => {
            const question = renderCollabMarkdown(item.question);
            return `
              <article class="question-row followup-row ${state.selectedFollowup === item.id ? "active" : ""}" data-action="open-followup" data-id="${escapeHtml(item.id)}" role="button" tabindex="0">
                ${icon("bot", 16)}
                <div class="followup-content">
                  <div class="followup-markdown markdown-content">${question}</div>
                  ${item.time ? `<time class="followup-time">${escapeHtml(item.time)}</time>` : ""}
                </div>
              </article>
            `;
          }).join("")
          : renderEmptyState(
              "实时展示 Agent 协调内容",
              "自主提出会议问题",
              "compact-empty"
            )}
      </div>
      ${uiVisibility.explanationMaterials ? `<section class="explain-box">
        <div class="box-title">${icon("file")}<strong>解释材料</strong></div>
        <div class="explanation-list">
          ${explanations.length
            ? explanations.map((item) => `
              <button class="explanation-row ${state.selectedExplanation === item.id ? "active" : ""}" data-action="open-explanation" data-id="${item.id}">
                <time>${escapeHtml(item.time)}</time>
                <span class="${item.status.includes("需") ? "pending" : "done"}">${escapeHtml(item.status)}</span>
                <strong>${escapeHtml(item.title)}</strong>
                <p>${escapeHtml(item.summary)}</p>
                <em>${escapeHtml(item.lookupTargets.join(" / "))}</em>
              </button>
            `).join("")
            : renderEmptyState(
                "暂无解释材料",
                "后端尚未提供客户问题到检索证据、解释草稿和提交状态的结构化接口。",
                "compact-empty"
              )}
        </div>
        ${explanations.length ? `<button class="link-more" data-action="modal" data-modal="all-explanations">查看全部解释材料 ${icon("arrowRight", 16)}</button>` : ""}
      </section>` : ""}
    </aside>
  `;
}

function renderTimeline() {
  return `
    <section class="timeline panel">
      <h2>${icon("calendar")}会议时间线</h2>
      ${timeline.length ? `<div class="timeline-track">${timeline.map((item) => `
        <article><span></span><time>${escapeHtml(item.time)}</time><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.desc)}</p></article>
      `).join("")}</div>` : renderEmptyState("暂无会议时间线", "后端尚未提供会议事件时间线接口。", "timeline-empty")}
    </section>
  `;
}

function renderSummaryLoading(meeting) {
  const loadingRows = Array.from({ length: 3 }, (_, index) => `
    <div class="summary-loading-card">
      <span class="loading-row short"></span>
      <span class="loading-row"></span>
      <span class="loading-row ${index === 2 ? "short" : ""}"></span>
    </div>
  `).join("");
  return `
    <main class="summary-page" aria-busy="true">
      <header class="summary-header">
        <button class="ghost back" data-action="nav" data-view="workspace">${icon("arrowLeft")}返回工作台</button>
        <h1>${escapeHtml(meeting?.title || "会议总结")}</h1>
        <span class="ended-chip">${escapeHtml(meeting?.status || "已结束")}</span>
        <p>${escapeHtml(meeting?.time || "会议已结束")}</p>
        <div class="summary-loading-actions"><span class="loading-row"></span></div>
      </header>
      <section class="panel summary-detail-loading">
        <div class="summary-loading-panel" role="status" aria-live="polite">
          <div class="summary-loading-status">
            <i class="meeting-loading-spinner"></i>
            <strong>正在加载交付物</strong>
            <span>正在同步 Demo 与会议交付文档</span>
          </div>
          <div class="summary-loading-grid">${loadingRows}</div>
        </div>
      </section>
    </main>
  `;
}

function renderSummaryDeliverable(item) {
  const kind = canonicalDeliverableKind(item.kind);
  const isDemo = kind === "demo";
  const content = String(item.content || "").trim();
  if (isDemo) {
    const preview = getDemoPreviewState(item);
    return `
      <article class="summary-deliverable-card summary-demo-card" data-kind="demo">
        <header class="summary-deliverable-head">
          <div>
            <h3>${escapeHtml(item.name || "Demo")}</h3>
            <p>${escapeHtml(item.status)}${item.time ? ` · ${escapeHtml(item.time)}` : ""}</p>
          </div>
          ${renderDemoVersionControl()}
        </header>
        ${preview.url
          ? `<iframe
              class="summary-demo-preview"
              src="${escapeHtml(preview.url)}"
              data-stable-demo-frame="summary-demo"
              title="${escapeHtml(`${item.name || "Demo"} ${preview.versionLabel} 预览`)}"
              sandbox="allow-scripts allow-forms allow-modals allow-same-origin"
              referrerpolicy="no-referrer"
            ></iframe>`
          : renderEmptyState(
              "Demo 暂不可预览",
              state.demoVersionMessage || `${item.status || "后端尚未生成可用版本"}`,
              "summary-deliverable-empty"
            )}
      </article>
    `;
  }
  return `
    <article class="summary-deliverable-card summary-text-card" data-kind="${escapeHtml(kind)}" data-has-content="${Boolean(content)}">
      <header class="summary-deliverable-head">
        <div>
          <h3>${escapeHtml(item.name)}</h3>
          <p>${escapeHtml(item.status)}${item.time ? ` · ${escapeHtml(item.time)}` : ""}</p>
        </div>
      </header>
      ${content
        ? `<div class="summary-doc-content markdown-content">${renderMarkdown(content)}</div>`
        : renderEmptyState("正文尚未生成", "后端当前仅返回了该交付物的元数据。", "summary-deliverable-empty")}
    </article>
  `;
}

function renderSummary() {
  const meeting = getSelectedMeeting();
  if (state.meetingDetailLoading) return renderSummaryLoading(meeting);
  const orderedDeliverables = getOrderedDeliverables();
  const downloadProgress = state.downloadBusyMode === "all" && state.downloadProgress
    ? `${state.downloadProgress.current}/${state.downloadProgress.total}`
    : "";
  return `
      <main class="summary-page">
        <header class="summary-header">
          <button class="ghost back" data-action="nav" data-view="workspace">${icon("arrowLeft")}返回工作台</button>
          <h1>${escapeHtml(meeting?.title || "会议总结")}</h1>
          <span class="ended-chip">${meeting?.status || "已结束"}</span>
          <p>${escapeHtml(meeting?.time || "会议已结束")}</p>
          <div class="summary-header-actions">
            <button class="ghost icon-only" data-action="refresh-deliverables" title="刷新交付物" aria-label="刷新交付物">${icon("refresh")}</button>
            <button class="primary" data-action="download-all-deliverables" ${state.downloadBusyMode || !orderedDeliverables.length ? "disabled" : ""}>
              ${icon("download")}${state.downloadBusyMode === "all" ? `打包中 ${downloadProgress}` : "下载"}
            </button>
          </div>
        </header>
        <section class="panel delivery-strip">
          <h2>${icon("grid")}交付物</h2>
          <div class="summary-deliverable-list">
            ${orderedDeliverables.length
              ? orderedDeliverables.map(renderSummaryDeliverable).join("")
              : renderEmptyState("暂无交付物", "后端尚未返回本会议交付物列表。", "summary-empty")}
          </div>
        </section>
      </main>
  `;
}

function renderKnowledge() {
  const visibleDocs = getKnowledgeDocsForCurrentTab();
  const selected = getSelectedKnowledgeDoc();
  const callable = selected ? isKnowledgeCallable(selected) : false;
  const uploadBusy = isUploadInProgress();
  const totalText = state.knowledgeLoaded && state.knowledgeTotal !== null ? state.knowledgeTotal : visibleDocs.length;
  const body = `
    <header class="page-header knowledge-head">
      <h1>知识库</h1>
      <p>共 ${totalText} 个文档</p>
    </header>
    <section class="knowledge-layout ${uiVisibility.knowledgeDetailPanel ? "" : "list-only"}">
      <div class="knowledge-main">
        <div class="kb-toolbar">
          <label class="field search-field"><input class="knowledge-search-input" value="${escapeHtml(state.knowledgeSearch)}" placeholder="搜索文档名称或关键词" />${icon("search")}</label>
          <button class="primary" data-action="open-upload" data-context="knowledge" ${uploadBusy ? "disabled" : ""}>${icon("upload")}上传文档</button>
        </div>
        ${renderUploadProgress("knowledge")}
        <div class="kb-table panel">
          <div class="kb-row kb-head">
            <span class="kb-name-heading">名称</span>
            <span class="kb-type-heading">类型</span>
            <span class="kb-updated-heading">更新时间</span>
            <span class="kb-status-heading">状态</span>
            <span class="kb-action-heading">操作</span>
          </div>
          ${visibleDocs.length ? visibleDocs.map((doc) => {
            const docCallable = isKnowledgeCallable(doc);
            const deleting = state.deletingKnowledgeId === doc.id;
            return `<div class="kb-document-row ${doc.id === selected?.id ? "active" : ""} ${deleting ? "deleting" : ""}">
              <button class="kb-row-main" data-action="knowledge-select" data-id="${escapeHtml(doc.id)}">
                <span class="kb-name-cell">${docBadge(doc.type)}${escapeHtml(doc.name)}</span>
                <span class="kb-type-cell">${escapeHtml(doc.type.toUpperCase())}</span>
                <span class="kb-updated-cell">${escapeHtml(doc.updated)}</span>
                <span class="kb-status-cell"><i class="status-dot ${docCallable ? "on" : "off"}" aria-hidden="true"></i><span class="kb-status-label">${docCallable ? "可供会议检索" : "当前未启用"}</span></span>
              </button>
              <button class="kb-delete-button" data-action="delete-knowledge" data-id="${escapeHtml(doc.id)}" title="删除 ${escapeHtml(doc.name)}" aria-label="删除 ${escapeHtml(doc.name)}" ${deleting ? "disabled" : ""}>${icon("trash", 17)}</button>
            </div>`;
          }).join("") : `<div class="kb-empty">${state.knowledgeMessage || "没有匹配的知识文档"}</div>`}
          <footer>
            <span class="kb-pagination-total">共 ${visibleDocs.length} 条</span>
            <nav class="kb-pagination-controls" aria-label="知识库分页">
              <button data-action="toast" data-message="已经是第一页" aria-label="上一页">‹</button>
              <button data-action="toast" data-message="当前第 1 页" aria-label="第 1 页">1</button>
              <button data-action="toast" data-message="没有更多页" aria-label="下一页">›</button>
            </nav>
          </footer>
        </div>
      </div>
      ${uiVisibility.knowledgeDetailPanel ? (selected ? `<aside class="knowledge-detail panel">
        <header>${docBadge(selected.type)}<div><h2>${escapeHtml(selected.name)}</h2><p>${escapeHtml(selected.type.toUpperCase())} · ${escapeHtml(selected.size)}</p></div></header>
        <h3>会议中可调用</h3>
        <p>个人知识库属于当前账号，可在所有会议中被检索引用。</p>
        <div class="knowledge-callable">
          <button class="switch ${callable ? "on" : "off"}" data-action="toggle-knowledge-callable" data-id="${selected.id}" aria-pressed="${callable}"><i></i></button>
          <span>${callable ? "已开启，AI 可在会议中引用" : "当前页面已关闭调用"}</span>
        </div>
        <footer>
          <button class="ghost" data-action="modal" data-modal="knowledge-preview" data-id="${selected.id}">${icon("monitor")}预览</button>
          <button class="primary" data-action="modal" data-modal="knowledge-more" data-id="${selected.id}">更多操作</button>
        </footer>
      </aside>` : `<aside class="knowledge-detail panel empty-detail"><h2>未选择文档</h2><p>${escapeHtml(state.knowledgeMessage || "上传个人知识文档或调整搜索关键词后查看详情。")}</p></aside>`) : ""}
    </section>
  `;
  return renderShell(body);
}

function renderSettings() {
  const preset = getSelectedModelPreset();
  const statusClass = state.settings.status === "connected" ? "on" : state.settings.status === "error" ? "off" : "pending";
  const statusText = {
    connected: "已连接",
    error: "连接失败",
    testing: "测试中",
    saving: "保存中",
    idle: "未测试"
  }[state.settings.status] || "未测试";
  const body = `
    <header class="page-header"><h1>设置</h1></header>
    <section class="settings-card panel backend-settings-card">
      <header>${icon("monitor", 34)}<div><h2>后端 API</h2><p>桌面客户端只加载本地界面，会议、知识库、AI 和交付物能力全部通过该 API 地址调用。</p></div></header>
      <label>API 地址 <strong>*</strong><input class="settings-api-base" value="${escapeHtml(state.apiBaseUrl)}" placeholder="https://api.vpbuddy.example.com" /></label>
      <footer>
        <div><i class="status-dot ${state.apiStatus === "connected" ? "on" : state.apiStatus === "loading" ? "pending" : "off"}"></i><strong>${state.apiStatus === "connected" ? "已连接" : state.apiStatus === "loading" ? "连接中" : "未连接"}</strong><p>${state.apiMessage}</p></div>
        <button class="primary" data-action="save-api-base">${icon("file")}保存并重载</button>
      </footer>
    </section>
    <section class="settings-card panel">
      <header>${icon("sparkle", 34)}<div><h2>AI 配置</h2><p>配置 AI 模型与接口，驱动智能问答与内容生成</p></div></header>
      <label>API Key <strong>*</strong><textarea class="settings-api-key" placeholder="${state.settings.apiKeyConfigured ? "后端已有凭证；修改配置时请重新输入" : "请输入您的 API Key"}">${escapeHtml(state.settings.apiKey)}</textarea></label>
      <label>AI 模型 <strong>*</strong><select class="settings-model">
        ${modelPresets.map((item) => `<option value="${item.id}" ${state.settings.modelPreset === item.id ? "selected" : ""}>${item.label}</option>`).join("")}
      </select></label>
      <label>Base URL <strong>*</strong><input class="settings-endpoint" value="${escapeHtml(state.settings.endpoint)}" placeholder="https://api.openai.com/v1" /></label>
      <div class="hermes-fields">
        <span><strong>provider</strong>${preset.provider}</span>
        <span><strong>model</strong>${state.settings.model}</span>
        <span><strong>api_key_env</strong>${state.settings.apiKeyEnv}</span>
      </div>
      <footer>
        <div><i class="status-dot ${statusClass}"></i><strong>${statusText}</strong><p>${state.settings.message}</p></div>
        <button class="ghost" data-action="test-ai-settings">${icon("refresh")}测试连接</button>
        <button class="primary" data-action="save-ai-settings">${icon("file")}保存设置</button>
      </footer>
    </section>
  `;
  return renderShell(body);
}

function renderToast() {
  if (!state.toast) return "";
  return `<div class="toast">${icon("check", 16)}${state.toast}<button data-action="clear-toast">${icon("close", 14)}</button></div>`;
}

function renderActionModal() {
  if (!state.modal) return "";
  const selectedExplanation = explanationFindings.find((item) => item.id === state.selectedExplanation) || explanationFindings[0];
  const selectedFollowup = aiFollowupQuestions.find((item) => item.id === state.selectedFollowup) || aiFollowupQuestions[0];
  const selectedDeliverable = deliverables.find((item) => item.id === state.selectedDeliverable) || deliverables[0];
  const selectedKnowledge = getSelectedKnowledgeDoc() || knowledgeDocs[0];
  const selectedKnowledgeCallable = isKnowledgeCallable(selectedKnowledge);

  if (state.modal === "delete-meeting") {
    const meeting = meetings.find((item) => item.id === state.pendingDeleteMeetingId);
    return `
      <div class="modal-backdrop action-backdrop">
        <section class="action-modal panel">
          <button class="modal-close" data-action="close-modal">${icon("close")}</button>
          <h2>删除会议</h2>
          <p>确定删除“${escapeHtml(meeting?.title || "该会议")}”及其后端会议数据吗？此操作不可撤销。</p>
          <footer>
            <button class="ghost" data-action="close-modal">取消</button>
            <button class="danger" data-action="confirm-delete-meeting">确认删除</button>
          </footer>
        </section>
      </div>
    `;
  }

  if (state.modal === "delete-knowledge") {
    const doc = knowledgeDocs.find((item) => item.id === state.pendingDeleteKnowledgeId);
    const deleting = state.deletingKnowledgeId === state.pendingDeleteKnowledgeId;
    return `
      <div class="modal-backdrop action-backdrop">
        <section class="action-modal panel">
          <button class="modal-close" data-action="close-modal" ${deleting ? "disabled" : ""}>${icon("close")}</button>
          <h2>删除知识文档</h2>
          <p>确定从个人知识库删除“${escapeHtml(doc?.name || "该文档")}”吗？此操作不可撤销。</p>
          <footer>
            <button class="ghost" data-action="close-modal" ${deleting ? "disabled" : ""}>取消</button>
            <button class="danger" data-action="confirm-delete-knowledge" ${deleting ? "disabled" : ""}>${deleting ? "删除中…" : "确认删除"}</button>
          </footer>
        </section>
      </div>
    `;
  }

  if (state.modal === "followup-detail") {
    const questionMarkup = renderCollabMarkdown(selectedFollowup?.question);
    return `
      <div class="modal-backdrop action-backdrop">
        <section class="action-modal panel followup-detail-modal">
          <button class="modal-close" data-action="close-modal">${icon("close")}</button>
          <header>
            <h2>内容详情</h2>
            ${selectedFollowup?.time ? `<time>${escapeHtml(selectedFollowup.time)}</time>` : ""}
          </header>
          <article class="detail-question">
            <strong>内容</strong>
            <div class="modal-markdown markdown-content">${questionMarkup}</div>
          </article>
          <footer>
            <button class="ghost" data-action="close-modal">关闭</button>
          </footer>
        </section>
      </div>
    `;
  }

  if (state.modal === "all-explanations") {
    return `
      <div class="modal-backdrop action-backdrop">
        <section class="action-modal panel list-modal">
          <button class="modal-close" data-action="close-modal">${icon("close")}</button>
          <header>
            <h2>全部解释材料</h2>
            <p>根据会议对话触发检索后生成的解释材料列表。</p>
          </header>
          <div class="modal-list">
            ${explanationFindings.map((item) => `
              <button class="explanation-row" data-action="open-explanation" data-id="${escapeHtml(item.id)}">
                <time>${escapeHtml(item.time)}</time>
                <span class="${item.status.includes("需") ? "pending" : "done"}">${escapeHtml(item.status)}</span>
                <strong>${escapeHtml(item.title)}</strong>
                <p>${escapeHtml(item.summary)}</p>
                <em>${escapeHtml(item.lookupTargets.join(" / "))}</em>
              </button>
            `).join("")}
          </div>
        </section>
      </div>
    `;
  }

  if (state.modal === "explanation-detail") {
    return `
      <div class="modal-backdrop action-backdrop">
        <section class="action-modal panel explanation-detail-modal">
          <button class="modal-close" data-action="close-modal">${icon("close")}</button>
          <header>
            <span>${escapeHtml(selectedExplanation.time)}</span>
            <h2>${escapeHtml(selectedExplanation.title)}</h2>
            <em class="${selectedExplanation.status.includes("需") ? "pending" : "done"}">${escapeHtml(selectedExplanation.status)}</em>
          </header>
          <p class="question-context"><strong>触发原话</strong>${escapeHtml(selectedExplanation.trigger)}</p>
          <div class="lookup-meta">
            ${selectedExplanation.lookupTargets.map((target) => `<em>${escapeHtml(target)}</em>`).join("")}
          </div>
          <div class="concept-list">
            ${selectedExplanation.keywords.map((keyword) => `<button data-action="concept-search" data-concept="${escapeHtml(keyword)}">${escapeHtml(keyword)}</button>`).join("")}
          </div>
          <article class="explain-summary">
            <strong>解释建议</strong>
            <p>${escapeHtml(selectedExplanation.explanation)}</p>
          </article>
          <div class="evidence-list">
            ${selectedExplanation.evidence.map((source, index) => `
              <article class="evidence-row">
                <span>${String(index + 1).padStart(2, "0")}</span>
                <strong>${escapeHtml(source.title)}</strong>
                <em>${escapeHtml(source.source)} · ${escapeHtml(source.confidence)}</em>
                <small>${escapeHtml(source.ref)}</small>
              </article>
            `).join("")}
          </div>
          <footer>
            <button class="ghost" data-action="close-modal">关闭</button>
          </footer>
        </section>
      </div>
    `;
  }

  if (state.modal === "knowledge-preview") {
    const snippets = selectedKnowledge.preview ? [selectedKnowledge.preview] : knowledgePreviewSnippets[selectedKnowledge.id] || [];
    return `
      <div class="modal-backdrop action-backdrop">
        <section class="action-modal panel knowledge-preview-modal">
          <button class="modal-close" data-action="close-modal">${icon("close")}</button>
          <header>
            ${docBadge(selectedKnowledge.type)}
            <div>
              <span>${escapeHtml(selectedKnowledge.updated)}</span>
              <h2>知识预览</h2>
              <p>${escapeHtml(selectedKnowledge.name)}</p>
            </div>
          </header>
          <div class="knowledge-preview-meta">
            <em>${selectedKnowledge.type.toUpperCase()}</em>
            <em>${escapeHtml(selectedKnowledge.size)}</em>
            <em>${selectedKnowledgeCallable ? "本次会议可调用" : "本次会议不可调用"}</em>
          </div>
          <div class="preview-snippets">
            ${snippets.map((text, index) => `
              <article>
                <span>${String(index + 1).padStart(2, "0")}</span>
                <p>${escapeHtml(text)}</p>
              </article>
            `).join("")}
          </div>
          <footer>
            <button class="ghost" data-action="close-modal">关闭</button>
            <button class="primary" data-action="toggle-knowledge-callable" data-id="${escapeHtml(selectedKnowledge.id)}">
              ${selectedKnowledgeCallable ? "关闭本次调用" : "开启本次调用"}
            </button>
          </footer>
        </section>
      </div>
    `;
  }

  if (state.modal === "knowledge-more") {
    return `
      <div class="modal-backdrop action-backdrop">
        <section class="action-modal panel knowledge-more-modal">
          <button class="modal-close" data-action="close-modal">${icon("close")}</button>
          <header>
            <h2>更多操作</h2>
            <p>${escapeHtml(selectedKnowledge.name)}</p>
          </header>
          <div class="knowledge-op-list">
            <section>
              <div>${icon("file", 18)}<span><strong>重命名</strong><em>调整知识文档名称</em></span></div>
              <div class="knowledge-op-control">
                <input class="knowledge-rename-input" value="${escapeHtml(selectedKnowledge.name)}" />
                <button class="primary compact" data-action="knowledge-rename-save" data-id="${escapeHtml(selectedKnowledge.id)}">保存</button>
              </div>
            </section>
            <section>
              <div>${icon("download", 18)}<span><strong>下载源文件</strong><em>${escapeHtml(selectedKnowledge.type.toUpperCase())} · ${escapeHtml(selectedKnowledge.size)}</em></span></div>
              <button class="ghost compact" data-action="knowledge-download" data-id="${escapeHtml(selectedKnowledge.id)}">下载</button>
            </section>
            <section>
              <div>${icon("close", 18)}<span><strong>删除文档</strong><em>从当前账号的个人知识库移除</em></span></div>
              <button class="danger compact" data-action="delete-knowledge" data-id="${escapeHtml(selectedKnowledge.id)}">删除</button>
            </section>
          </div>
          <footer>
            <button class="ghost" data-action="close-modal">关闭</button>
          </footer>
        </section>
      </div>
    `;
  }

  const map = {
    "profile": ["当前账号", `${user.name}。后端 GET /api/auth/me 当前仅返回用户 ID、邮箱和创建时间。`],
    "upload-material": ["上传会议材料", "选择 PPT、PDF、Word、Excel 或图片后，调用 POST /api/meetings/:id/materials 上传。"],
    "storage": ["会议空间", "后端暂未提供账号存储用量与清理策略接口。"],
    "fullscreen": ["会议室全屏展示", "进入全屏展示时隐藏复杂控制区，仅保留翻页、批注和临时呼出 AI 的浮动工具。"],
    "deliverable-open": ["打开交付物", `${selectedDeliverable.name} 会在会议交互空间中打开，并把本次打开事件写入会议时间线。`],
    "concept-search": ["索引依据", `基于会议原话“${selectedExplanation.trigger}”检索：${selectedExplanation.keywords.join("、")}。当前索引来源包括：${selectedExplanation.lookupTargets.join("、")}。`],
    "ai-more": ["更多 AI 反问", "这里展示 AI 根据会议转写、材料上下文和客户诉求生成的反问队列，支持按对象、状态和触发片段筛选。"],
    "send-material": ["发送材料", "将当前解释材料或交付物提交到会议空间，供后续交付物归档。"],
    "upload-knowledge": ["上传知识文档", "上传后调用 POST /api/kb/upload，后端解析、切片、向量化并返回可用状态。"],
    "knowledge-preview": ["知识预览", "预览当前文档的解析文本、切片和可被本次会议调用的状态。"],
    "knowledge-more": ["知识更多操作", "包含重命名和源文件下载。"]
  };
  const [title, body] = map[state.modal] || ["操作", "当前后端未提供该功能接口，本次未执行任何数据操作。"];
  return `
    <div class="modal-backdrop action-backdrop">
      <section class="action-modal panel">
        <button class="modal-close" data-action="close-modal">${icon("close")}</button>
        <h2>${title}</h2>
        <p>${body}</p>
        <footer>
          <button class="ghost" data-action="close-modal">取消</button>
          <button class="primary" data-action="confirm-modal">确认</button>
        </footer>
      </section>
    </div>
  `;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createAnnotationId() {
  return `ann-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getAnnotationSurfaceRect() {
  return document.querySelector(".stage-render-surface")?.getBoundingClientRect() || null;
}

function updateAnnotationViewport() {
  void ensurePdfPreviewMounted();
}

function getCanvasPoint(event) {
  const rect = getAnnotationSurfaceRect();
  if (!rect) return null;
  if (event.clientX < rect.left || event.clientX > rect.left + rect.width || event.clientY < rect.top || event.clientY > rect.top + rect.height) {
    return null;
  }
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
    y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100)
  };
}

function cloneAnnotations(annotations = state.annotations) {
  return structuredClone(annotations);
}

function saveAnnotationHistory() {
  state.annotationUndoStack.push(cloneAnnotations());
  if (state.annotationUndoStack.length > 100) state.annotationUndoStack.shift();
  state.annotationRedoStack = [];
}

function restoreAnnotationHistory(from, to) {
  const snapshot = from.pop();
  if (!snapshot) return false;
  to.push(cloneAnnotations());
  state.annotations = snapshot;
  state.textDraft = null;
  return true;
}

function commitTextDraft() {
  if (!state.textDraft) return;
  const text = state.textDraft.value.trim();
  if (text) {
    saveAnnotationHistory();
    state.annotations.push({
      id: createAnnotationId(),
      type: "text",
      x: state.textDraft.x,
      y: state.textDraft.y,
      color: state.annotationColor,
      text
    });
  }
  state.textDraft = null;
}

function removeAnnotation(id) {
  saveAnnotationHistory();
  state.annotations = state.annotations.filter((item) => item.id !== id);
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function drawStageAnnotations(ctx, width, height) {
  state.annotations.forEach((item) => {
    ctx.save();
    ctx.strokeStyle = item.color;
    ctx.fillStyle = item.color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, item.size * (width / 1200));

    if (item.type === "pen" && item.points?.length) {
      ctx.beginPath();
      item.points.forEach((point, index) => {
        const x = (point.x / 100) * width;
        const y = (point.y / 100) * height;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    if (item.type === "rect") {
      const x = (Math.min(item.x, item.x2) / 100) * width;
      const y = (Math.min(item.y, item.y2) / 100) * height;
      const rectWidth = (Math.abs(item.x2 - item.x) / 100) * width;
      const rectHeight = (Math.abs(item.y2 - item.y) / 100) * height;
      ctx.fillStyle = "rgba(47, 140, 255, 0.10)";
      ctx.fillRect(x, y, rectWidth, rectHeight);
      ctx.strokeRect(x, y, rectWidth, rectHeight);
    }

    if (item.type === "text") {
      const x = (item.x / 100) * width;
      const y = (item.y / 100) * height;
      const fontSize = Math.max(22, Math.round(width * 0.022));
      ctx.font = `700 ${fontSize}px "Microsoft YaHei", Arial, sans-serif`;
      ctx.lineWidth = Math.max(3, fontSize * 0.12);
      ctx.strokeStyle = "rgba(2, 11, 29, 0.82)";
      ctx.strokeText(item.text, x, y);
      ctx.fillStyle = item.color;
      ctx.fillText(item.text, x, y);
    }

    ctx.restore();
  });
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.92));
}

async function captureStageScreenshot() {
  if (isUploadInProgress()) return;
  const meetingId = state.selectedMeetingId;
  if (!meetingId) {
    setToast("请先创建或选择一场会议", false);
    render();
    return;
  }
  const stage = document.querySelector(".annotation-canvas");
  const surface = document.querySelector(".stage-render-surface");
  if (!stage || !surface) {
    setToast("当前投屏区域尚未就绪，请稍后重试", false);
    render();
    return;
  }
  let blob = null;
  try {
    const html2canvas = await loadHtml2CanvasModule();
    const captureCanvas = await html2canvas(stage, {
      backgroundColor: "#061225",
      scale: Math.min(2, window.devicePixelRatio || 1),
      useCORS: true,
      ignoreElements: (element) => element.matches?.(".stage-capture-button")
    });
    blob = await canvasToPngBlob(captureCanvas);
  } catch (error) {
    const rect = stage.getBoundingClientRect();
    const fallback = document.createElement("canvas");
    fallback.width = Math.max(1, Math.round(rect.width));
    fallback.height = Math.max(1, Math.round(rect.height));
    const context = fallback.getContext("2d");
    context.fillStyle = "#061225";
    context.fillRect(0, 0, fallback.width, fallback.height);
    const previewCanvas = surface.querySelector("canvas");
    const image = surface.querySelector("img");
    if (previewCanvas) context.drawImage(previewCanvas, 0, 0, fallback.width, fallback.height);
    else if (image?.complete) context.drawImage(image, 0, 0, fallback.width, fallback.height);
    drawStageAnnotations(context, fallback.width, fallback.height);
    blob = await canvasToPngBlob(fallback);
    recordClientLog("warn", "Stage screenshot used visual fallback", { message: error?.message || String(error) });
  }
  if (meetingId !== state.selectedMeetingId) return;
  if (!blob) {
    setToast("截屏生成失败，请重试");
    render();
    return;
  }
  if (isUploadInProgress()) return;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const file = new File([blob], `投屏截图-${stamp}.png`, { type: "image/png" });
  const progress = startUploadProgress("vpbuddy-material", file.name, 1);
  state.meetingLeftTab = "materials";
  render();
  try {
    const uploaded = await api.uploadMaterial(meetingId, file);
    if (meetingId !== state.selectedMeetingId) {
      if (state.uploadProgress === progress) state.uploadProgress = null;
      return;
    }
    meetingMaterialsRevision += 1;
    const uploadedMaterial = normalizeUploadedMaterialResponse(uploaded, materials.length);
    if (/^Material \d+$/.test(uploadedMaterial.name)) uploadedMaterial.name = file.name;
    uploadedMaterial.type = "image";
    uploadedMaterial.contentType = "image/png";
    cacheMaterialPreviewDownload(uploadedMaterial, {
      blob: file,
      filename: file.name,
      contentType: file.type
    }, meetingId, true);
    replaceArray(materials, mergeMaterials(materials, [uploadedMaterial]));
    addVpbuddyMessage({
      time: nowTime(),
      text: `[上传了材料: ${uploadedMaterial.name}]`,
      type: "material",
      source: "material-upload",
      materialId: uploadedMaterial.id
    });
    state.showComposerHistory = true;
    progress.current = 1;
    progress.materialIds = [uploadedMaterial.id];
    progress.status = "parsing";
    syncActiveMaterialProgress();
    render();

    const refreshRevision = meetingMaterialsRevision;
    const [materialList, chatHistory] = await Promise.allSettled([
      api.listMaterials(meetingId),
      api.listChatHistory(meetingId)
    ]);
    if (meetingId !== state.selectedMeetingId) {
      if (state.uploadProgress === progress) state.uploadProgress = null;
      return;
    }
    if (materialList.status === "fulfilled" && meetingMaterialsRevision === refreshRevision) {
      const refreshedMaterials = normalizeMaterialsResponse(materialList.value);
      replaceArray(materials, mergeMaterials(refreshedMaterials, [uploadedMaterial]));
      syncActiveMaterialProgress();
    } else if (materialList.status === "rejected") {
      recordClientLog("warn", "截屏已上传，但会议材料清单刷新失败", { message: materialList.reason?.message || "unknown" });
    }
    if (chatHistory.status === "fulfilled") {
      applyChatHistory(chatHistory.value);
    } else {
      recordClientLog("warn", "截屏已上传，但 VPBuddy 对话记录刷新失败", { message: chatHistory.reason?.message || "unknown" });
    }

    const uploadedId = uploadedMaterial.id;
    state.selectedMaterial = materials.some((item) => item.id === uploadedId)
      ? uploadedId
      : materials.at(-1)?.id || materials[0]?.id || "";
    state.meetingLeftTab = "materials";
    state.showComposerHistory = true;
    setToast(`截屏已上传为会议材料：${file.name}`);
  } catch (error) {
    if (meetingId !== state.selectedMeetingId) {
      if (state.uploadProgress === progress) state.uploadProgress = null;
      return;
    }
    progress.current = 1;
    progress.status = "error";
    progress.failureKind = "upload";
    setToast(`截屏上传失败：${error.message}`, false);
  }
  render();
  scheduleCompletedUploadProgressClear(progress);
}

document.addEventListener("click", async (event) => {
  const clickedMaterialRow = event.target.closest(".material-row[data-id]");
  if (state.view === "meeting" && state.selectedMaterial && !clickedMaterialRow) {
    state.selectedMaterial = "";
    document.querySelectorAll(".material-row.active").forEach((row) => row.classList.remove("active"));
  }
  const target = event.target.closest("[data-action]");
  if (!target) {
    let shouldRender = false;
    if (state.showAccountMenu && !event.target.closest(".account-menu-wrap")) {
      state.showAccountMenu = false;
      shouldRender = true;
    }
    if (state.showDeliverableDownloadMenu && !event.target.closest(".deliverable-download-wrap")) {
      state.showDeliverableDownloadMenu = false;
      shouldRender = true;
    }
    if (shouldRender) render();
    return;
  }
  const action = target.dataset.action;

  if (action === "demo-version-control") return;

  if (action === "toggle-deliverable-download-menu") {
    state.showDeliverableDownloadMenu = !state.showDeliverableDownloadMenu;
    state.showAccountMenu = false;
    render();
    return;
  }
  state.showDeliverableDownloadMenu = false;

  if (action !== "tool" && action !== "annotation-hit") commitTextDraft();

  if (action === "toggle-account-menu") {
    state.showAccountMenu = !state.showAccountMenu;
    render();
    return;
  }
  if (action === "download-log") {
    downloadClientLog();
    return;
  }
  state.showAccountMenu = false;

  if (action === "auth-mode") {
    state.authEmail = document.querySelector("[data-field='auth-email']")?.value.trim() || state.authEmail;
    state.authMode = target.dataset.mode === "register" ? "register" : "login";
    state.authError = "";
    render();
    return;
  }
  if (action === "auth-submit") {
    await submitAuthentication();
    return;
  }
  if (action === "logout") {
    if (window.confirm("确定退出当前 VPBuddy 账号吗？")) {
      resetRecordingState();
      resetAuthenticatedSession();
    }
    return;
  }
  if (action === "nav") {
    state.view = target.dataset.view;
    if (state.view !== "meeting") {
      resetMeetingTitleEditState();
      meetingDetailLoadSequence += 1;
      state.meetingDetailLoading = false;
      closeMeetingEvents();
      state.stageFullscreen = false;
      document.body.classList.remove("stage-fullscreen-active");
    }
    render();
    if (state.view === "knowledge") await loadKnowledgeFromBackend();
    if (state.view === "settings") await loadAISettings();
    return;
  }
  if (action === "modal") {
    if (target.dataset.id) state.selectedKnowledge = target.dataset.id;
    state.modal = target.dataset.modal;
  }
  if (action === "close-modal") {
    state.modal = "";
    state.pendingDeleteMeetingId = "";
    state.pendingDeleteKnowledgeId = "";
  }
  if (action === "confirm-modal") setToast("当前后端未提供该功能接口，本次未执行数据操作");
  if (action === "toast") setToast(target.dataset.message || "操作已触发");
  if (action === "clear-toast") state.toast = "";
  if (action === "open-create") state.showCreate = true;
  if (action === "close-create") state.showCreate = false;
  if (action === "start-meeting") {
    await startNewMeetingFromForm();
    return;
  }
  if (action === "refresh-meetings") {
    await loadMeetingsFromBackend();
    return;
  }
  if (action === "delete-meeting") {
    state.pendingDeleteMeetingId = target.dataset.id;
    state.modal = "delete-meeting";
    render();
    return;
  }
  if (action === "confirm-delete-meeting") {
    const meetingId = state.pendingDeleteMeetingId;
    state.modal = "";
    state.pendingDeleteMeetingId = "";
    await deleteMeetingById(meetingId);
    return;
  }
  if (action === "delete-knowledge") {
    state.pendingDeleteKnowledgeId = target.dataset.id;
    state.modal = "delete-knowledge";
    render();
    return;
  }
  if (action === "confirm-delete-knowledge") {
    const docId = state.pendingDeleteKnowledgeId;
    await deleteKnowledgeDocument(docId);
    return;
  }
  if (action === "open-meeting") {
    resetMeetingTitleEditState();
    const nextMeetingId = target.dataset.id || state.selectedMeetingId;
    if (preventActiveRecordingMeetingSwitch(nextMeetingId)) return;
    const preserveActiveRecording = nextMeetingId === state.selectedMeetingId
      && Boolean(realtimeAsrSession)
      && ["starting", "recording", "paused", "pausing", "resuming"].includes(state.recordingStatus);
    state.selectedMeetingId = nextMeetingId;
    if (!preserveActiveRecording) resetRecordingState();
    state.stageTab = "presentation";
    state.stageFullscreen = false;
    document.body.classList.remove("stage-fullscreen-active");
    state.meetingLeftTab = "records";
    state.deliverableLeftTab = "deliverables";
    state.view = "meeting";
    state.meetingDetailLoading = state.loadedMeetingDetailId !== state.selectedMeetingId;
    render();
    startMeetingEvents(state.selectedMeetingId);
    await loadMeetingDetailFromBackend(state.selectedMeetingId);
    return;
  }
  if (action === "open-summary") {
    resetMeetingTitleEditState();
    const nextMeetingId = target.dataset.id || state.selectedMeetingId;
    if (preventActiveRecordingMeetingSwitch(nextMeetingId)) return;
    state.selectedMeetingId = nextMeetingId;
    state.view = "summary";
    state.meetingDetailLoading = state.loadedMeetingDetailId !== state.selectedMeetingId;
    closeMeetingEvents();
    render();
    await loadMeetingDetailFromBackend(state.selectedMeetingId);
    return;
  }
  if (action === "toggle-recording") {
    if (state.recordingStatus === "recording") {
      try {
        await pauseRealtimeRecording();
      } catch (error) {
        setToast(`暂停录制失败：${error.message}`, false);
      }
    } else if (state.recordingStatus === "paused") {
      await resumeRealtimeRecording();
    } else {
      await startRealtimeRecording();
    }
    return;
  }
  if (action === "end-meeting") {
    await endCurrentMeeting();
    return;
  }
  if (action === "save-meeting-title") {
    await saveMeetingTitle();
    return;
  }
  if (action === "cancel-meeting-title") {
    cancelMeetingTitleEdit();
    return;
  }
  if (action === "stage-tab") {
    state.stageTab = target.dataset.tab;
    if (state.stageTab === "deliverable") {
      state.deliverableLeftTab = "deliverables";
      state.selectedDeliverable = getDefaultDeliverable()?.id || "";
    }
  }
  if (action === "left-tab") state.meetingLeftTab = target.dataset.tab;
  if (action === "deliverable-left-tab") {
    state.deliverableLeftTab = target.dataset.tab === "records" ? "records" : "deliverables";
  }
  if (action === "knowledge-select") state.selectedKnowledge = target.dataset.id;
  if (action === "toggle-knowledge-callable") {
    const doc = knowledgeDocs.find((item) => item.id === target.dataset.id) || getSelectedKnowledgeDoc();
    state.selectedKnowledge = doc.id;
    const next = !isKnowledgeCallable(doc);
    state.knowledgeCallable[doc.id] = next;
    setToast(`${next ? "已开启" : "已关闭"}当前页面调用状态；后端暂缺知识库元数据更新接口`, false);
  }
  if (action === "knowledge-rename-save") {
    saveKnowledgeRename(target.dataset.id);
    return;
  }
  if (action === "knowledge-download") {
    await downloadKnowledgeSource(target.dataset.id);
    return;
  }
  if (action === "open-upload") {
    const context = target.dataset.context || "material";
    openFilePicker(
      context,
      context === "knowledge"
        ? ".txt,.md,.pdf"
        : ".ppt,.pptx,.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
    );
    return;
  }
  if (action === "capture-screenshot") {
    if (isUploadInProgress()) return;
    await captureStageScreenshot();
    return;
  }
  if (action === "select-material") {
    state.selectedMaterial = target.dataset.id;
    document.querySelectorAll(".material-row.active").forEach((row) => row.classList.remove("active"));
    target.closest(".material-row[data-id]")?.classList.add("active");
    setToast("材料已选中，双击可投屏");
    return;
  }
  if (action === "retry-material-preview") {
    const materialId = target.dataset.id || state.selectedMaterial;
    if (materialId) void loadMaterialPreview(materialId);
    return;
  }
  if (action === "download-material") {
    const material = materials.find((item) => item.id === target.dataset.id);
    if (material) {
      try {
        saveApiDownload(await api.downloadMaterial(material.id), material.name);
        setToast(`${material.name} 已开始下载`);
      } catch (error) {
        setToast(`材料下载失败：${error.message}`, false);
      }
      render();
    }
    return;
  }
  if (action === "select-deliverable") state.selectedDeliverable = target.dataset.id;
  if (action === "download-current-deliverable") {
    await downloadCurrentDeliverable(target.dataset.id);
    return;
  }
  if (action === "download-all-deliverables") {
    await downloadAllDeliverables();
    return;
  }
  if (action === "download-deliverable") {
    await downloadCurrentDeliverable(target.dataset.id);
    return;
  }
  if (action === "select-followup") state.selectedFollowup = target.dataset.id;
  if (action === "toggle-composer-history") state.showComposerHistory = !state.showComposerHistory;
  if (action === "retry-vpbuddy-message") {
    const message = state.vpbuddyMessages.find((item) => item.id === target.dataset.messageId);
    if (message?.status === "failed") {
      await sendVpbuddyChatMessage(message.text, { optimisticMessageId: message.id });
    }
    return;
  }
  if (action === "send-vpbuddy-message") {
    const text = state.composerText.trim();
    await sendVpbuddyChatMessage(text);
    return;
  }
  if (action === "send-vpbuddy-material") {
    openFilePicker("vpbuddy-material", ".txt,.md,.pdf,.png,.jpg,.jpeg,.gif,.webp");
    return;
  }
  if (action === "retry-upload") {
    const context = target.dataset.context || state.uploadProgress?.context || "vpbuddy-material";
    state.uploadProgress = null;
    render();
    openFilePicker(
      context,
      context === "knowledge"
        ? ".txt,.md,.pdf"
        : context === "vpbuddy-material"
          ? ".txt,.md,.pdf,.png,.jpg,.jpeg,.gif,.webp"
          : ".ppt,.pptx,.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
    );
    return;
  }
  if (action === "refresh-collab") {
    await refreshMeetingCollab(state.selectedMeetingId);
    return;
  }
  if (action === "refresh-transcript") {
    await refreshTranscript(state.selectedMeetingId);
    return;
  }
  if (action === "refresh-deliverables") {
    await refreshDeliverables(state.selectedMeetingId);
    setToast("交付物状态已刷新");
    return;
  }
  if (action === "open-followup") {
    state.selectedFollowup = target.dataset.id;
    state.modal = "followup-detail";
  }
  if (action === "open-explanation") {
    state.selectedExplanation = target.dataset.id;
    state.modal = "explanation-detail";
  }
  if (action === "tool") {
    state.activeTool = target.dataset.tool;
    const labelMap = { cursor: "指针", pen: "画笔", text: "文字", rect: "矩形", eraser: "橡皮" };
    setToast(`已切换到${labelMap[target.dataset.tool] || "批注"}工具`);
  }
  if (action === "annotation-color") state.annotationColor = target.dataset.color;
  if (action === "annotation-size") state.penSize = clamp(state.penSize + Number(target.dataset.size), 2, 10);
  if (action === "annotation-undo") {
    if (restoreAnnotationHistory(state.annotationUndoStack, state.annotationRedoStack)) setToast("已撤销上一处批注");
  }
  if (action === "annotation-redo") {
    if (restoreAnnotationHistory(state.annotationRedoStack, state.annotationUndoStack)) setToast("已重做批注");
  }
  if (action === "annotation-clear") {
    if (state.annotations.length) saveAnnotationHistory();
    state.annotations = [];
    state.textDraft = null;
    setToast("已清空当前页批注");
  }
  if (action === "annotation-hit" && state.activeTool === "eraser") {
    removeAnnotation(target.dataset.annotationId);
    setToast("已擦除批注");
  }
  if (action === "zoom") {
    state.zoom = Math.max(60, Math.min(160, state.zoom + Number(target.dataset.step)));
  }
  if (action === "toggle-fullscreen") {
    await toggleStageFullscreen();
    return;
  }
  if (action === "select-slide") state.currentSlide = Number(target.dataset.slide);
  if (action === "slide-step") {
    if (state.presentationMime.includes("pdf") && state.presentationPdfPageCount) {
      state.currentSlide = clamp(state.currentSlide + Number(target.dataset.step), 1, state.presentationPdfPageCount);
    } else {
      setToast("当前材料暂不支持翻页", false);
    }
  }
  if (action === "concept-search") {
    state.modal = "concept-search";
  }
  if (action === "test-ai-settings") {
    await testAISettings();
    return;
  }
  if (action === "save-ai-settings") {
    await saveAISettings();
    return;
  }
  if (action === "save-api-base") {
    updateBackendApiBaseFromInput();
    saveBackendApiBase();
    return;
  }

  render();
});

document.addEventListener("dblclick", async (event) => {
  const meetingTitle = event.target.closest(".stage-meeting-title[data-role='meeting-title']");
  if (meetingTitle) {
    event.preventDefault();
    beginMeetingTitleEdit();
    return;
  }
  const row = event.target.closest(".material-row[data-id]");
  if (!row) return;
  event.preventDefault();
  await presentMaterial(row.dataset.id);
});

document.addEventListener("input", (event) => {
  if (event.target.matches(".stage-title-input")) {
    state.meetingTitleDraft = event.target.value;
    return;
  }
  if (event.target.matches(".knowledge-search-input")) {
    state.knowledgeSearch = event.target.value;
    scheduleKnowledgeSearch();
    return;
  }
  if (event.target.matches(".settings-api-key, .settings-endpoint")) {
    updateSettingsFromInputs();
    return;
  }
  if (event.target.matches(".settings-api-base")) {
    updateBackendApiBaseFromInput();
    return;
  }
  if (event.target.matches(".vpbuddy-input")) {
    state.composerText = event.target.value;
    const counter = document.querySelector(".composer-count");
    if (counter) counter.textContent = `${state.composerText.length}/500`;
    return;
  }
  if (!event.target.matches(".annotation-text-input") || !state.textDraft) return;
  state.textDraft.value = event.target.value;
});

document.addEventListener("change", async (event) => {
  if (event.target.matches(".demo-version-select")) {
    const version = Number(event.target.value);
    if (demoVersions.some((item) => item.version === version)) {
      state.selectedDemoVersion = version;
      state.demoVersionPinned = true;
    }
    render();
    return;
  }
  if (event.target.matches(".settings-model")) {
    updateSettingsFromInputs();
    applyModelPreset(event.target.value);
    render();
    return;
  }
  if (!event.target.matches(".native-file-input")) return;
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  if (isUploadInProgress()) {
    event.target.value = "";
    return;
  }
  const meetingId = state.selectedMeetingId;
  if (event.target.dataset.meetingId && event.target.dataset.meetingId !== meetingId) {
    event.target.value = "";
    return;
  }
  const names = files.map((file) => file.name).join("、");
  const context = event.target.dataset.context || state.fileUploadContext;
  const progressContext = context;
  if (!meetingId) {
    setToast(context === "knowledge"
      ? "当前后端的个人知识库上传仍要求 meeting_id，请先创建或选择一场会议"
      : "请先创建或选择一场会议", false);
    event.target.value = "";
    render();
    return;
  }

  const progress = startUploadProgress(progressContext, files[0].name, files.length);
  let succeeded = 0;
  const errors = [];
  const uploadedMaterials = [];
  render();
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    progress.name = file.name;
    render();
    try {
      if (context !== "knowledge") {
        const uploaded = await api.uploadMaterial(meetingId, file);
        if (meetingId !== state.selectedMeetingId) {
          if (state.uploadProgress === progress) state.uploadProgress = null;
          event.target.value = "";
          return;
        }
        meetingMaterialsRevision += 1;
        const uploadedMaterial = normalizeUploadedMaterialResponse(uploaded, materials.length);
        if (/^Material \d+$/.test(uploadedMaterial.name)) uploadedMaterial.name = file.name;
        if (!uploadedMaterial.contentType) uploadedMaterial.contentType = file.type;
        cacheMaterialPreviewDownload(uploadedMaterial, {
          blob: file,
          filename: file.name,
          contentType: file.type
        }, meetingId, true);
        uploadedMaterials.push(uploadedMaterial);
        replaceArray(materials, mergeMaterials(materials, [uploadedMaterial]));
        state.selectedMaterial = uploadedMaterial.id;
        state.meetingLeftTab = "materials";
        if (context === "vpbuddy-material") {
          addVpbuddyMessage({
            time: nowTime(),
            text: `[上传了材料: ${uploadedMaterial.name}]`,
            type: "material",
            source: "material-upload",
            materialId: uploadedMaterial.id
          });
          state.showComposerHistory = true;
        }
        progress.materialIds.push(uploadedMaterial.id);
        progress.current = index + 1;
        if (progress.current === progress.total) {
          progress.status = "parsing";
          syncActiveMaterialProgress();
        }
        render();
      } else {
        await api.uploadKnowledgeDocument(file, {
          meetingId,
          scope: "personal_kb",
          meetingCallable: true
        });
        if (meetingId !== state.selectedMeetingId) {
          if (state.uploadProgress === progress) state.uploadProgress = null;
          event.target.value = "";
          return;
        }
      }
      succeeded += 1;
    } catch (error) {
      if (meetingId !== state.selectedMeetingId) {
        if (state.uploadProgress === progress) state.uploadProgress = null;
        event.target.value = "";
        return;
      }
      errors.push(`${file.name}：${error.message}`);
    }
    progress.current = index + 1;
    render();
  }

  if (context === "knowledge" && succeeded) {
    await loadKnowledgeFromBackend();
    if (meetingId !== state.selectedMeetingId) {
      if (state.uploadProgress === progress) state.uploadProgress = null;
      event.target.value = "";
      return;
    }
  }
  if (context === "vpbuddy-material" && succeeded) {
    const refreshRevision = meetingMaterialsRevision;
    const [materialList, chatHistory] = await Promise.allSettled([
      api.listMaterials(meetingId),
      api.listChatHistory(meetingId)
    ]);
    if (meetingId !== state.selectedMeetingId) {
      if (state.uploadProgress === progress) state.uploadProgress = null;
      event.target.value = "";
      return;
    }
    if (materialList.status === "fulfilled" && meetingMaterialsRevision === refreshRevision) {
      const refreshedMaterials = normalizeMaterialsResponse(materialList.value);
      replaceArray(materials, mergeMaterials(refreshedMaterials, uploadedMaterials));
      syncActiveMaterialProgress();
    } else {
      if (materialList.status === "rejected") {
        recordClientLog("warn", "材料已上传，但会议资料列表刷新失败", { message: materialList.reason?.message || "unknown" });
      }
    }

    if (chatHistory.status === "fulfilled") {
      applyChatHistory(chatHistory.value);
    } else {
      recordClientLog("warn", "材料已上传，但 VPBuddy 对话记录刷新失败", { message: chatHistory.reason?.message || "unknown" });
    }
    state.selectedMaterial = uploadedMaterials.at(-1)?.id || state.selectedMaterial;
    state.meetingLeftTab = "materials";
    state.showComposerHistory = true;
  }
  if (context === "material" && succeeded) {
    const refreshRevision = meetingMaterialsRevision;
    try {
      const payload = await api.listMaterials(meetingId);
      if (meetingId !== state.selectedMeetingId) {
        if (state.uploadProgress === progress) state.uploadProgress = null;
        event.target.value = "";
        return;
      }
      if (meetingMaterialsRevision === refreshRevision) {
        const refreshedMaterials = normalizeMaterialsResponse(payload);
        replaceArray(materials, mergeMaterials(refreshedMaterials, uploadedMaterials));
        syncActiveMaterialProgress();
      }
      state.selectedMaterial = uploadedMaterials.at(-1)?.id || state.selectedMaterial;
    } catch (error) {
      if (meetingId !== state.selectedMeetingId) {
        if (state.uploadProgress === progress) state.uploadProgress = null;
        event.target.value = "";
        return;
      }
      recordClientLog("warn", "材料已上传，但会议资料列表刷新失败", { message: error.message });
    }
  }
  if (errors.length) {
    progress.status = "error";
    progress.failureKind = "upload";
  } else if (context === "knowledge") {
    progress.status = "complete";
  } else if (succeeded) {
    progress.status = "parsing";
    syncActiveMaterialProgress();
  }
  setToast(errors.length
    ? `${succeeded}/${files.length} 个文件${context === "vpbuddy-material" ? "发送" : "上传"}成功；${errors[0]}`
    : `${names} ${context === "vpbuddy-material" ? "发送" : "上传"}成功`, false);
  event.target.value = "";
  render();
  scheduleCompletedUploadProgressClear(progress);
});

document.addEventListener("keydown", (event) => {
  const followupAction = event.target.closest?.('[data-action="open-followup"][role="button"]');
  if (followupAction && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    followupAction.click();
    return;
  }
  if (event.target.matches(".stage-title-input")) {
    if (event.key === "Enter") {
      event.preventDefault();
      void saveMeetingTitle();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelMeetingTitleEdit();
    }
    return;
  }
  if (event.key === "Escape" && state.showAccountMenu) {
    state.showAccountMenu = false;
    render();
    return;
  }
  if (event.key === "Escape" && state.stageFullscreen) {
    state.stageFullscreen = false;
    document.body.classList.remove("stage-fullscreen-active");
    setToast("已退出全屏");
    render();
    return;
  }
  if (event.target.matches("[data-field='auth-email'], [data-field='auth-password']") && event.key === "Enter") {
    event.preventDefault();
    void submitAuthentication();
    return;
  }
  if (!event.target.matches(".annotation-text-input")) return;
  if (event.key === "Enter") {
    event.preventDefault();
    commitTextDraft();
    render();
  }
  if (event.key === "Escape") {
    state.textDraft = null;
    render();
  }
});

document.addEventListener("pointerdown", (event) => {
  const canvas = event.target.closest(".annotation-canvas");
  if (!canvas || event.target.closest(".annotation-text-input, .stage-capture-button")) return;
  if (state.stageTab !== "presentation") return;

  const point = getCanvasPoint(event);
  if (!point) return;

  if (state.activeTool === "cursor") return;

  if (state.activeTool === "eraser") {
    const hit = event.target.closest("[data-annotation-id]");
    if (hit) {
      removeAnnotation(hit.dataset.annotationId);
      render();
    }
    return;
  }

  event.preventDefault();
  commitTextDraft();

  if (state.activeTool === "text") {
    state.textDraft = { x: point.x, y: point.y, value: "" };
    render();
    return;
  }

  const id = createAnnotationId();
  saveAnnotationHistory();
  if (state.activeTool === "pen") {
    state.annotations.push({
      id,
      type: "pen",
      color: state.annotationColor,
      size: state.penSize,
      points: [point]
    });
  }
  if (state.activeTool === "rect") {
    state.annotations.push({
      id,
      type: "rect",
      color: state.annotationColor,
      size: state.penSize,
      x: point.x,
      y: point.y,
      x2: point.x,
      y2: point.y
    });
  }
  state.drawingAnnotationId = id;
  render();
});

document.addEventListener("pointermove", (event) => {
  if (!state.drawingAnnotationId) return;
  const point = getCanvasPoint(event);
  const annotation = state.annotations.find((item) => item.id === state.drawingAnnotationId);
  if (!point || !annotation) return;

  event.preventDefault();
  if (annotation.type === "pen") {
    const last = annotation.points.at(-1);
    if (!last || Math.abs(last.x - point.x) + Math.abs(last.y - point.y) > 0.35) {
      annotation.points.push(point);
    }
  }
  if (annotation.type === "rect") {
    annotation.x2 = point.x;
    annotation.y2 = point.y;
  }
  render();
});

document.addEventListener("pointerup", () => {
  state.drawingAnnotationId = "";
});

window.addEventListener("resize", updateAnnotationViewport);

render();
void restoreAuthenticatedSession();
