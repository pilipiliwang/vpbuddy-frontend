/**
 * @typedef {Object} VpbuddyDownload
 * @property {Blob} blob Authenticated response body.
 * @property {string} filename Filename from Content-Disposition, or an empty string.
 * @property {string} contentType Response MIME type.
 */

export function createVpbuddyApi({ baseUrl = "", getToken, onUnauthorized, onDiagnostic, transport = fetch, timeoutMs = 15000 } = {}) {
  const root = baseUrl.replace(/\/$/, "");

  function emitDiagnostic(level, message, details) {
    try {
      onDiagnostic?.({ level, message, details });
    } catch {
      // Diagnostics must never interrupt the user request that produced them.
    }
  }

  function buildUrl(path) {
    if (/^https?:\/\//i.test(path)) return path;
    return `${root}${path}`;
  }

  function withQuery(path, params = {}) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === "") continue;
      query.set(key, String(value));
    }
    const suffix = query.toString();
    return suffix ? `${path}?${suffix}` : path;
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

  async function performRequest(path, options = {}) {
    const { timeoutMs: requestTimeoutMs = timeoutMs, auth = true, ...fetchOptions } = options;
    const startedAt = Date.now();
    const method = String(fetchOptions.method || "GET").toUpperCase();
    const diagnosticPath = String(path).split("?", 1)[0];
    const token = auth ? getToken?.() : "";
    const isFormData = typeof FormData !== "undefined" && fetchOptions.body instanceof FormData;
    const headers = isFormData
      ? { ...fetchOptions.headers }
      : { "Content-Type": "application/json", ...fetchOptions.headers };
    if (token) headers.Authorization = `Bearer ${token}`;

    let timeout = 0;
    let timedOut = false;
    let signal = fetchOptions.signal;
    if (!signal && requestTimeoutMs && typeof AbortController !== "undefined") {
      const controller = new AbortController();
      signal = controller.signal;
      timeout = globalThis.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, requestTimeoutMs);
    }

    try {
      const response = await transport(buildUrl(path), {
        ...fetchOptions,
        headers,
        signal
      });
      emitDiagnostic(response.ok ? "info" : "error", "API request completed", {
        method,
        path: diagnosticPath,
        status: response.status,
        duration_ms: Date.now() - startedAt
      });
      return { response, auth, token };
    } catch (error) {
      const requestError = timedOut
        ? Object.assign(new Error(`请求超时（${requestTimeoutMs}ms），请检查后端服务或代理网络`), { code: "ETIMEDOUT" })
        : error;
      emitDiagnostic("error", "API request failed", {
        method,
        path: diagnosticPath,
        duration_ms: Date.now() - startedAt,
        error: requestError?.message || String(requestError)
      });
      throw requestError;
    } finally {
      if (timeout) globalThis.clearTimeout(timeout);
    }
  }

  async function throwResponseError(response, auth, requestToken) {
    const payload = await readJsonResponse(response);
    const detail = payload?.detail;
    const message = payload?.error
      || payload?.message
      || detail?.error
      || detail?.message
      || (typeof detail === "string" ? detail : "")
      || (typeof payload === "string" ? payload : payload ? JSON.stringify(payload) : `VPBuddy API error: ${response.status}`);
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    const activeToken = auth ? getToken?.() || "" : "";
    if (auth && response.status === 401 && requestToken && activeToken === requestToken) {
      onUnauthorized?.(error);
    }
    throw error;
  }

  async function request(path, options = {}) {
    const { response, auth, token } = await performRequest(path, options);
    if (!response.ok) await throwResponseError(response, auth, token);
    if (response.status === 204) return null;
    return readJsonResponse(response);
  }

  function responseFilename(response) {
    const disposition = response.headers?.get?.("content-disposition") || "";
    const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
    if (encoded) {
      try {
        return decodeURIComponent(encoded);
      } catch {
        return encoded;
      }
    }
    return /filename="?([^";]+)"?/i.exec(disposition)?.[1] || "";
  }

  /** @returns {Promise<VpbuddyDownload>} */
  async function requestBlob(path, options = {}) {
    const { response, auth, token } = await performRequest(path, options);
    if (!response.ok) await throwResponseError(response, auth, token);
    const blob = typeof response.blob === "function"
      ? await response.blob()
      : new Blob([await response.arrayBuffer()], {
        type: response.headers?.get?.("content-type") || "application/octet-stream"
      });
    return {
      blob,
      filename: responseFilename(response),
      contentType: response.headers?.get?.("content-type") || blob.type || "application/octet-stream"
    };
  }

  function unsupported(feature) {
    const error = new Error(`${feature} is not available in the current VPBuddy backend API`);
    error.code = "VPBUDDY_API_UNSUPPORTED";
    return Promise.reject(error);
  }

  function createMeeting(input = {}) {
    const meetingId = input.meeting_id ?? input.meetingId;
    const audioSource = input.audio_source ?? input.audioSource;
    const projectName = input.project_name ?? input.projectName ?? input.title;
    const path = withQuery("/api/meetings/stream_start", {
      meeting_id: meetingId,
      audio_source: audioSource,
      project_name: projectName
    });
    return request(path, {
      method: "POST",
      body: JSON.stringify(projectName ? { project_name: projectName } : {})
    });
  }

  function knowledgeListPath(input) {
    const meetingId = typeof input === "string"
      ? input
      : input?.meeting_id ?? input?.meetingId;
    return withQuery("/api/kb/list", { meeting_id: meetingId });
  }

  function collabAsk(meetingId, sectionOrInput, question, asker = "agent") {
    const input = typeof sectionOrInput === "object" && sectionOrInput !== null
      ? sectionOrInput
      : { section: sectionOrInput, question, asker };
    const path = withQuery(`/api/meetings/${encodeURIComponent(meetingId)}/collab/ask`, {
      section: input.section,
      question: input.question,
      asker: input.asker ?? "agent"
    });
    return request(path, { method: "POST" });
  }

  function collabAnswer(meetingId, qidOrInput, answer, answerer = "VP") {
    const input = typeof qidOrInput === "object" && qidOrInput !== null
      ? qidOrInput
      : { qid: qidOrInput, answer, answerer };
    const path = withQuery(`/api/meetings/${encodeURIComponent(meetingId)}/collab/answer`, {
      qid: input.qid,
      answer: input.answer,
      answerer: input.answerer ?? "VP"
    });
    return request(path, { method: "POST" });
  }

  return {
    baseUrl: root,
    eventsUrl: (meetingId) => buildUrl(`/api/meetings/${encodeURIComponent(meetingId)}/events`),
    register: (input) => request("/api/auth/register", { method: "POST", body: JSON.stringify(input), auth: false }),
    login: (input) => request("/api/auth/login", { method: "POST", body: JSON.stringify(input), auth: false }),
    me: () => request("/api/auth/me"),
    getDeviceStatus: () => request("/api/client/device-status"),

    listMeetings: () => request("/api/meetings"),
    checkMeetingId: (id) => request(withQuery("/api/meetings/check_id", { id })),
    checkMeeting: (id) => request(withQuery("/api/meetings/check_id", { id })),
    createMeeting,
    getMeeting: (meetingId) => request(`/api/meetings/${encodeURIComponent(meetingId)}`),
    getMeetingAggregate: (meetingId) => request(`/api/meetings/${encodeURIComponent(meetingId)}/aggregate`),
    updateMeeting: (meetingId, input) => request(`/api/meetings/${encodeURIComponent(meetingId)}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    }),
    patchMeeting: (meetingId, input) => request(`/api/meetings/${encodeURIComponent(meetingId)}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    }),
    deleteMeeting: (meetingId) => request(`/api/meetings/${encodeURIComponent(meetingId)}`, { method: "DELETE" }),
    startRecording: (meetingId) => request(`/meetings/${encodeURIComponent(meetingId)}/recording/start`, { method: "POST" }),
    stopRecording: (meetingId) => request(`/meetings/${encodeURIComponent(meetingId)}/recording/stop`, { method: "POST" }),
    closeMeeting: (meetingId) => request(`/api/meetings/${encodeURIComponent(meetingId)}/close`, { method: "POST" }),
    archiveMeeting: (meetingId) => request(`/api/meetings/${encodeURIComponent(meetingId)}/close`, { method: "POST" }),
    listMeetingEvents: (meetingId) => request(`/api/meetings/${encodeURIComponent(meetingId)}/events`),
    listTranscriptSegments: (meetingId) => request(`/api/meetings/${encodeURIComponent(meetingId)}/state`),

    getPresentationState: () => unsupported("Presentation state persistence"),
    openInStage: () => unsupported("Presentation stage persistence"),
    updatePresentationState: () => unsupported("Presentation state persistence"),
    captureStageSnapshot: () => unsupported("Stage snapshot persistence"),

    listMaterials: (meetingId) => request(`/api/meetings/${encodeURIComponent(meetingId)}/materials`),
    getMaterial: (materialId) => request(`/api/materials/${encodeURIComponent(materialId)}`),
    uploadMaterial: (meetingId, file) => {
      const data = new FormData();
      data.append("file", file);
      return request(`/api/meetings/${encodeURIComponent(meetingId)}/materials`, {
        method: "POST",
        body: data,
        headers: {},
        timeoutMs: 120000
      });
    },
    deleteMaterial: (materialId) => request(`/api/materials/${encodeURIComponent(materialId)}`, { method: "DELETE" }),
    downloadMaterial: (materialId) => requestBlob(`/api/materials/${encodeURIComponent(materialId)}/file`, { timeoutMs: 120000 }),
    downloadMaterialFile: (materialId) => requestBlob(`/api/materials/${encodeURIComponent(materialId)}/file`, { timeoutMs: 120000 }),
    getMaterialFile: (materialId) => requestBlob(`/api/materials/${encodeURIComponent(materialId)}/file`, { timeoutMs: 120000 }),

    sendChat: (meetingId, message, role = "user") => request(`/api/meetings/${encodeURIComponent(meetingId)}/chat`, {
      method: "POST",
      body: JSON.stringify({ message, role }),
      timeoutMs: 120000
    }),
    sendChatAttachment: (meetingId, file, text = "") => {
      const data = new FormData();
      if (text) data.append("text", text);
      data.append("files", file);
      return request(`/api/meetings/${encodeURIComponent(meetingId)}/chat`, {
        method: "POST",
        body: data,
        headers: {},
        timeoutMs: 120000
      });
    },
    listChatHistory: (meetingId) => request(`/api/meetings/${encodeURIComponent(meetingId)}/chat/history`),
    getMeetingCollab: (meetingId) => request(`/api/meetings/${encodeURIComponent(meetingId)}/collab`),
    askCollab: collabAsk,
    answerCollab: collabAnswer,

    listDeliverables: (meetingId) => request(`/api/meetings/${encodeURIComponent(meetingId)}/docs`),
    getMeetingDocument: (meetingId, kind) => request(`/api/meetings/${encodeURIComponent(meetingId)}/docs/${encodeURIComponent(kind)}`),
    getDocument: (meetingId, kind) => request(`/api/meetings/${encodeURIComponent(meetingId)}/docs/${encodeURIComponent(kind)}`),
    getDeliverable: (meetingId, kind) => request(`/api/meetings/${encodeURIComponent(meetingId)}/docs/${encodeURIComponent(kind)}`),
    downloadMeetingDocument: (meetingId, kind) => requestBlob(`/api/meetings/${encodeURIComponent(meetingId)}/docs/${encodeURIComponent(kind)}/download`, { timeoutMs: 120000 }),
    downloadDocument: (meetingId, kind) => requestBlob(`/api/meetings/${encodeURIComponent(meetingId)}/docs/${encodeURIComponent(kind)}/download`, { timeoutMs: 120000 }),
    downloadDeliverable: (meetingId, kind) => requestBlob(`/api/meetings/${encodeURIComponent(meetingId)}/docs/${encodeURIComponent(kind)}/download`, { timeoutMs: 120000 }),
    listDemoVersions: (meetingId) => request(`/api/meetings/${encodeURIComponent(meetingId)}/demo/versions`),
    getDemoVersions: (meetingId) => request(`/api/meetings/${encodeURIComponent(meetingId)}/demo/versions`),

    listKnowledge: (input) => request(knowledgeListPath(input)),
    listKnowledgeDocuments: (input) => request(knowledgeListPath(input)),
    searchKnowledge: (input = {}) => {
      const payload = {
        ...input,
        query: input.query ?? input.q ?? "",
        meeting_id: input.meeting_id ?? input.meetingId
      };
      delete payload.q;
      delete payload.meetingId;
      return request("/api/kb/search", { method: "POST", body: JSON.stringify(payload), timeoutMs: 30000 });
    },
    uploadKnowledgeDocument: (file, input = {}) => {
      const meetingId = input.meeting_id ?? input.meetingId;
      if (!meetingId) throw new TypeError("meeting_id is required for knowledge uploads");
      const labels = Array.isArray(input.labels) ? input.labels.join(",") : input.labels ?? "";
      const meetingCallableInput = input.meeting_callable ?? input.meetingCallable ?? true;
      const meetingCallable = typeof meetingCallableInput === "string"
        ? meetingCallableInput.toLowerCase() === "true"
        : Boolean(meetingCallableInput);
      const data = new FormData();
      data.append("meeting_id", String(meetingId));
      data.append("scope", String(input.scope ?? "personal_kb"));
      data.append("labels", String(labels));
      data.append("meeting_callable", String(Boolean(meetingCallable)));
      data.append("file", file);
      return request("/api/kb/upload", {
        method: "POST",
        body: data,
        headers: {},
        timeoutMs: 120000
      });
    },
    deleteKnowledgeDocument: (docId) => request(`/api/kb/${encodeURIComponent(docId)}`, { method: "DELETE" }),
    deleteKnowledge: (docId) => request(`/api/kb/${encodeURIComponent(docId)}`, { method: "DELETE" }),
    downloadKnowledgeDocument: (docId) => requestBlob(`/api/kb/${encodeURIComponent(docId)}/file`, { timeoutMs: 120000 }),
    downloadKnowledgeFile: (docId) => requestBlob(`/api/kb/${encodeURIComponent(docId)}/file`, { timeoutMs: 120000 }),
    getKnowledgeFile: (docId) => requestBlob(`/api/kb/${encodeURIComponent(docId)}/file`, { timeoutMs: 120000 }),

    getAISettings: () => request("/api/settings/ai", { timeoutMs: 15000 }),
    loadAISettings: () => request("/api/settings/ai", { timeoutMs: 15000 }),
    saveAISettings: (input) => request("/api/settings/ai", {
      method: "PUT",
      body: JSON.stringify(input),
      timeoutMs: 30000
    }),
    testAIConnection: () => request("/api/settings/ai/test", { method: "POST", timeoutMs: 120000 }),

    requestBlob
  };
}

export const endpoints = {
  auth: {
    register: "POST /api/auth/register",
    login: "POST /api/auth/login",
    me: "GET /api/auth/me"
  },
  client: {
    deviceStatus: "GET /api/client/device-status"
  },
  meetings: {
    list: "GET /api/meetings",
    checkId: "GET /api/meetings/check_id",
    create: "POST /api/meetings/stream_start",
    detail: "GET /api/meetings/:id",
    update: "PATCH /api/meetings/:id",
    delete: "DELETE /api/meetings/:id",
    aggregate: "GET /api/meetings/:id/aggregate",
    startRecording: "POST /meetings/:id/recording/start",
    stopRecording: "POST /meetings/:id/recording/stop",
    state: "GET /api/meetings/:id/state",
    events: "GET /api/meetings/:id/events",
    close: "POST /api/meetings/:id/close"
  },
  materials: {
    list: "GET /api/meetings/:id/materials",
    upload: "POST /api/meetings/:id/materials",
    detail: "GET /api/materials/:id",
    delete: "DELETE /api/materials/:id",
    file: "GET /api/materials/:id/file"
  },
  chat: {
    send: "POST /api/meetings/:id/chat",
    history: "GET /api/meetings/:id/chat/history"
  },
  collaboration: {
    read: "GET /api/meetings/:id/collab",
    ask: "POST /api/meetings/:id/collab/ask",
    answer: "POST /api/meetings/:id/collab/answer"
  },
  documents: {
    list: "GET /api/meetings/:id/docs",
    detail: "GET /api/meetings/:id/docs/:kind",
    download: "GET /api/meetings/:id/docs/:kind/download",
    demoVersions: "GET /api/meetings/:id/demo/versions"
  },
  knowledge: {
    list: "GET /api/kb/list",
    search: "POST /api/kb/search",
    upload: "POST /api/kb/upload",
    delete: "DELETE /api/kb/:id",
    file: "GET /api/kb/:id/file"
  },
  settings: {
    getAI: "GET /api/settings/ai",
    saveAI: "PUT /api/settings/ai",
    testAI: "POST /api/settings/ai/test"
  }
};
