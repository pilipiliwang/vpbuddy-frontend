export function createVpbuddyApi({ baseUrl, getToken, transport = fetch }) {
  const root = baseUrl.replace(/\/$/, "");

  async function request(path, options = {}) {
    const token = getToken?.();
    const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
    const headers = isFormData ? { ...options.headers } : {
      "Content-Type": "application/json",
      ...options.headers
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await transport(`${root}${path}`, {
      ...options,
      headers
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `VPBuddy API error: ${response.status}`);
    }

    if (response.status === 204) return null;
    return response.json();
  }

  return {
    login: (input) => request("/auth/login", { method: "POST", body: JSON.stringify(input) }),
    startSso: (input) => request("/auth/sso/start", { method: "POST", body: JSON.stringify(input) }),
    completeSso: (input) => request("/auth/sso/complete", { method: "POST", body: JSON.stringify(input) }),
    requestPasswordReset: (input) => request("/auth/password-reset", { method: "POST", body: JSON.stringify(input) }),
    me: () => request("/auth/me"),
    getDeviceStatus: () => request("/client/device-status"),
    listDevices: () => request("/client/devices"),
    getWorkspaceStorage: () => request("/workspace/storage"),
    listMeetings: () => request("/meetings"),
    createMeeting: (input) => request("/meetings", { method: "POST", body: JSON.stringify(input) }),
    getMeeting: (id) => request(`/meetings/${id}`),
    startRecording: (meetingId) => request(`/meetings/${meetingId}/recording/start`, { method: "POST" }),
    stopRecording: (meetingId) => request(`/meetings/${meetingId}/recording/stop`, { method: "POST" }),
    listMeetingEvents: (meetingId) => request(`/meetings/${meetingId}/events`),
    listTranscriptSegments: (meetingId) => request(`/meetings/${meetingId}/transcript-segments`),
    getPresentationState: (meetingId) => request(`/meetings/${meetingId}/presentation-state`),
    openInStage: (meetingId, input) =>
      request(`/meetings/${meetingId}/stage/open`, { method: "POST", body: JSON.stringify(input) }),
    updatePresentationState: (meetingId, input) =>
      request(`/meetings/${meetingId}/presentation-state`, { method: "PATCH", body: JSON.stringify(input) }),
    captureStageSnapshot: (meetingId) => request(`/meetings/${meetingId}/stage/snapshots`, { method: "POST" }),
    listMaterials: (meetingId) => request(`/meetings/${meetingId}/materials`),
    getMaterial: (materialId) => request(`/materials/${materialId}`),
    listMaterialVersions: (materialId) => request(`/materials/${materialId}/versions`),
    uploadMaterial: (meetingId, file) => {
      const data = new FormData();
      data.append("file", file);
      return request(`/meetings/${meetingId}/materials`, {
        method: "POST",
        body: data,
        headers: {}
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
    listCustomerQuestions: (meetingId) => request(`/meetings/${meetingId}/customer-questions`),
    updateCustomerQuestion: (questionId, input) =>
      request(`/customer-questions/${questionId}`, { method: "PATCH", body: JSON.stringify(input) }),
    listAIQuestions: (meetingId) => request(`/meetings/${meetingId}/ai/questions`),
    sendAIQuestion: (meetingId, text) =>
      request(`/meetings/${meetingId}/ai/questions`, { method: "POST", body: JSON.stringify({ text }) }),
    searchConcepts: (meetingId, input) =>
      request(`/meetings/${meetingId}/concept-search`, { method: "POST", body: JSON.stringify(input) }),
    generateExplanation: (meetingId, sourceId) =>
      request(`/meetings/${meetingId}/ai/explanations`, { method: "POST", body: JSON.stringify({ sourceId }) }),
    submitExplanation: (questionId, input) =>
      request(`/customer-questions/${questionId}/explanation`, { method: "POST", body: JSON.stringify(input) }),
    sendCustomerMessage: (meetingId, input) =>
      request(`/meetings/${meetingId}/customer-messages`, { method: "POST", body: JSON.stringify(input) }),
    listDeliverables: (meetingId) => request(`/meetings/${meetingId}/deliverables`),
    getDeliverable: (deliverableId) => request(`/deliverables/${deliverableId}`),
    generateDeliverable: (meetingId, input) =>
      request(`/meetings/${meetingId}/deliverables/generate`, { method: "POST", body: JSON.stringify(input) }),
    listDeliverableVersions: (deliverableId) => request(`/deliverables/${deliverableId}/versions`),
    updateDeliverableVersion: (deliverableId, version) =>
      request(`/deliverables/${deliverableId}/version`, { method: "PATCH", body: JSON.stringify({ version }) }),
    archiveMeeting: (meetingId) => request(`/meetings/${meetingId}/archive`, { method: "POST" }),
    exportArchive: (meetingId, input) =>
      request(`/meetings/${meetingId}/archive/export`, { method: "POST", body: JSON.stringify(input) }),
    createShareLink: (meetingId, input) =>
      request(`/meetings/${meetingId}/share-links`, { method: "POST", body: JSON.stringify(input) }),
    listKnowledge: (scope) => request(`/knowledge${scope ? `?scope=${scope}` : ""}`),
    getKnowledgeDocument: (id) => request(`/knowledge/documents/${id}`),
    uploadKnowledgeDocument: (file, metadata) => {
      const data = new FormData();
      data.append("file", file);
      data.append("metadata", JSON.stringify(metadata || {}));
      return request("/knowledge/documents", { method: "POST", body: data });
    },
    addKnowledgeTag: (id, tag) =>
      request(`/knowledge/documents/${id}/tags`, { method: "POST", body: JSON.stringify({ tag }) }),
    updateKnowledgeMeetingCallable: (id, meetingCallable) =>
      request(`/knowledge/documents/${id}/meeting-callable`, { method: "PATCH", body: JSON.stringify({ meetingCallable }) }),
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
    create: "POST /meetings",
    detail: "GET /meetings/:id",
    startRecording: "POST /meetings/:id/recording/start",
    stopRecording: "POST /meetings/:id/recording/stop",
    events: "GET /meetings/:id/events",
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
    questions: "GET/POST /meetings/:id/ai/questions",
    customerQuestions: "GET /meetings/:id/customer-questions",
    conceptSearch: "POST /meetings/:id/concept-search",
    explanations: "POST /meetings/:id/ai/explanations",
    submitExplanation: "POST /customer-questions/:id/explanation",
    customerMessages: "POST /meetings/:id/customer-messages"
  },
  deliverables: {
    list: "GET /meetings/:id/deliverables",
    detail: "GET /deliverables/:id",
    generate: "POST /meetings/:id/deliverables/generate",
    versions: "GET /deliverables/:id/versions",
    version: "PATCH /deliverables/:id/version"
  },
  knowledge: {
    list: "GET /knowledge?scope=personal|enterprise|industry",
    detail: "GET /knowledge/documents/:id",
    upload: "POST /knowledge/documents",
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
