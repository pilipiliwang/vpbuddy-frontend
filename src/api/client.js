export function createVpbuddyApi({ baseUrl = "", getToken, transport = fetch, timeoutMs = 3200 } = {}) {
  const root = baseUrl.replace(/\/$/, "");

  function buildUrl(path) {
    if (/^https?:\/\//i.test(path)) return path;
    return `${root}${path}`;
  }

  async function readJsonResponse(response) {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async function request(path, options = {}) {
    const { timeoutMs: requestTimeoutMs = timeoutMs, ...fetchOptions } = options;
    const token = getToken?.();
    const isFormData = typeof FormData !== "undefined" && fetchOptions.body instanceof FormData;
    const headers = isFormData ? { ...fetchOptions.headers } : {
      "Content-Type": "application/json",
      ...fetchOptions.headers
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    let timeout = 0;
    let signal = fetchOptions.signal;
    if (!signal && requestTimeoutMs && typeof AbortController !== "undefined") {
      const controller = new AbortController();
      signal = controller.signal;
      timeout = globalThis.setTimeout(() => controller.abort(), requestTimeoutMs);
    }

    let response;
    try {
      response = await transport(buildUrl(path), {
        ...fetchOptions,
        headers,
        signal
      });
    } finally {
      if (timeout) globalThis.clearTimeout(timeout);
    }

    const payload = await readJsonResponse(response);

    if (!response.ok) {
      const message = payload?.error || payload?.message || payload || `VPBuddy API error: ${response.status}`;
      throw new Error(message);
    }

    if (response.status === 204) return null;
    return payload;
  }

  return {
    baseUrl: root,
    eventsUrl: (meetingId) => buildUrl(`/api/meetings/${meetingId}/events`),
    login: (input) => request("/auth/login", { method: "POST", body: JSON.stringify(input) }),
    startSso: (input) => request("/auth/sso/start", { method: "POST", body: JSON.stringify(input) }),
    completeSso: (input) => request("/auth/sso/complete", { method: "POST", body: JSON.stringify(input) }),
    requestPasswordReset: (input) => request("/auth/password-reset", { method: "POST", body: JSON.stringify(input) }),
    me: () => request("/auth/me"),
    getDeviceStatus: () => request("/client/device-status"),
    listDevices: () => request("/client/devices"),
    getWorkspaceStorage: () => request("/workspace/storage"),
    listMeetings: () => request("/meetings"),
    createMeeting: (input = {}) => {
      const query = input.meetingId || input.meeting_id ? `?meeting_id=${encodeURIComponent(input.meetingId || input.meeting_id)}` : "";
      return request(`/api/meetings/stream_start${query}`, { method: "POST" });
    },
    getMeeting: (id) => request(`/meetings/${id}`),
    startRecording: (meetingId) => request(`/meetings/${meetingId}/recording/start`, { method: "POST" }),
    stopRecording: (meetingId) => request(`/meetings/${meetingId}/recording/stop`, { method: "POST" }),
    listMeetingEvents: (meetingId) => request(`/api/meetings/${meetingId}/events`),
    listTranscriptSegments: (meetingId) => request(`/meetings/${meetingId}/transcript-segments`),
    getPresentationState: (meetingId) => request(`/meetings/${meetingId}/presentation-state`),
    openInStage: (meetingId, input) =>
      request(`/meetings/${meetingId}/stage/open`, { method: "POST", body: JSON.stringify(input) }),
    updatePresentationState: (meetingId, input) =>
      request(`/meetings/${meetingId}/presentation-state`, { method: "PATCH", body: JSON.stringify(input) }),
    captureStageSnapshot: (meetingId) => request(`/meetings/${meetingId}/stage/snapshots`, { method: "POST" }),
    listMaterials: (meetingId) => request(`/api/meetings/${meetingId}/materials`),
    getMaterial: (materialId) => request(`/api/materials/${materialId}`),
    listMaterialVersions: (materialId) => request(`/materials/${materialId}/versions`),
    uploadMaterial: (meetingId, file) => {
      const data = new FormData();
      data.append("file", file);
      return request(`/api/meetings/${meetingId}/materials`, {
        method: "POST",
        body: data,
        headers: {},
        timeoutMs: 15000
      });
    },
    updateMaterialVisibility: (materialId, visibleInMeeting) =>
      request(`/materials/${materialId}/visibility`, {
        method: "PATCH",
        body: JSON.stringify({ visibleInMeeting })
      }),
    createAnnotation: (materialId, input) =>
      request(`/materials/${materialId}/annotations`, { method: "POST", body: JSON.stringify(input) }),
    appendMeetingEvent: (meetingId, event) =>
      request(`/meetings/${meetingId}/events`, { method: "POST", body: JSON.stringify(event) }),
    sendChat: (meetingId, message, role = "user") =>
      request(`/api/meetings/${meetingId}/chat`, { method: "POST", body: JSON.stringify({ message, role }) }),
    sendChatAttachment: (meetingId, file, text = "") => {
      const data = new FormData();
      if (text) data.append("text", text);
      data.append("files", file);
      return request(`/api/meetings/${meetingId}/chat`, {
        method: "POST",
        body: data,
        headers: {},
        timeoutMs: 30000
      });
    },
    listChatHistory: (meetingId) => request(`/api/meetings/${meetingId}/chat/history`),
    listDeliverables: (meetingId) => request(`/meetings/${meetingId}/deliverables`),
    getDeliverable: (deliverableId) => request(`/deliverables/${deliverableId}`),
    listDeliverableVersions: (deliverableId) => request(`/deliverables/${deliverableId}/versions`),
    updateDeliverableVersion: (deliverableId, version) =>
      request(`/deliverables/${deliverableId}/version`, { method: "PATCH", body: JSON.stringify({ version }) }),
    archiveMeeting: (meetingId) => request(`/meetings/${meetingId}/archive`, { method: "POST" }),
    listKnowledge: (meetingId) => request(`/api/kb/list${meetingId ? `?meeting_id=${encodeURIComponent(meetingId)}` : ""}`),
    searchKnowledge: (input) =>
      request("/api/kb/search", { method: "POST", body: JSON.stringify(input) }),
    listKnowledgeDocuments: (meetingId) =>
      request(`/api/kb/list${meetingId ? `?meeting_id=${encodeURIComponent(meetingId)}` : ""}`),
    uploadKnowledgeDocument: (file, metadata) => {
      const data = new FormData();
      data.append("file", file);
      const meetingId = metadata?.meetingId || metadata?.meeting_id;
      const query = meetingId ? `?meeting_id=${encodeURIComponent(meetingId)}` : "";
      return request(`/api/kb/upload${query}`, { method: "POST", body: data, timeoutMs: 15000 });
    },
    saveAISettings: (input) => request("/settings/ai", { method: "PUT", body: JSON.stringify(input) }),
    testAIConnection: (input) => request("/settings/ai/test", { method: "POST", body: JSON.stringify(input) })
  };
}

export const endpoints = {
  auth: {
    login: "POST /auth/login",
    ssoStart: "POST /auth/sso/start",
    ssoComplete: "POST /auth/sso/complete",
    passwordReset: "POST /auth/password-reset",
    me: "GET /auth/me"
  },
  client: {
    deviceStatus: "GET /client/device-status",
    devices: "GET /client/devices",
    storage: "GET /workspace/storage"
  },
  meetings: {
    list: "GET /meetings",
    create: "POST /api/meetings/stream_start",
    detail: "GET /meetings/:id",
    startRecording: "POST /meetings/:id/recording/start",
    stopRecording: "POST /meetings/:id/recording/stop",
    events: "GET /api/meetings/:id/events",
    transcript: "GET /meetings/:id/transcript-segments",
    presentationState: "GET/PATCH /meetings/:id/presentation-state",
    openStage: "POST /meetings/:id/stage/open",
    snapshot: "POST /meetings/:id/stage/snapshots",
    appendEvent: "POST /meetings/:id/events",
    archive: "POST /meetings/:id/archive"
  },
  materials: {
    list: "GET /meetings/:id/materials",
    detail: "GET /materials/:id",
    versions: "GET /materials/:id/versions",
    upload: "POST /meetings/:id/materials",
    visibility: "PATCH /materials/:id/visibility",
    annotations: "POST /materials/:id/annotations"
  },
  ai: {
    chat: "POST /api/meetings/:id/chat",
    chatAttachment: "POST /api/meetings/:id/chat multipart/form-data",
    chatHistory: "GET /api/meetings/:id/chat/history",
    kbSearch: "POST /api/kb/search"
  },
  deliverables: {
    list: "GET /meetings/:id/deliverables",
    detail: "GET /deliverables/:id",
    generate: "POST /meetings/:id/deliverables/generate",
    versions: "GET /deliverables/:id/versions",
    version: "PATCH /deliverables/:id/version"
  },
  knowledge: {
    list: "GET /api/kb/list?meeting_id=:id",
    search: "POST /api/kb/search",
    upload: "POST /api/kb/upload?meeting_id=:id",
    tags: "POST /knowledge/documents/:id/tags",
    meetingCallable: "PATCH /knowledge/documents/:id/meeting-callable"
  },
  archive: {
    archive: "POST /meetings/:id/archive",
    export: "POST /meetings/:id/archive/export",
    shareLink: "POST /meetings/:id/share-links"
  },
  settings: {
    saveAI: "PUT /settings/ai",
    testAI: "POST /settings/ai/test"
  }
};
