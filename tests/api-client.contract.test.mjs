import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import test from "node:test";

const repoRoot = process.env.VPBUDDY_FRONTEND_ROOT
  ? path.resolve(process.env.VPBUDDY_FRONTEND_ROOT)
  : fileURLToPath(new URL("../", import.meta.url));
const clientPath = path.join(repoRoot, "src", "api", "client.js");
const clientSource = await readFile(clientPath, "utf8");
const { createVpbuddyApi, endpoints } = await import(pathToFileURL(clientPath).href);

const backendOrigin = "https://backend.example";
const meetingId = "meeting-42";
const jwt = "contract-test.jwt";

function makeResponse(payload = { ok: true }) {
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify(payload);
    }
  };
}

function makeErrorResponse(status, payload = { error: "unauthorized" }) {
  return {
    ok: false,
    status,
    async text() {
      return JSON.stringify(payload);
    }
  };
}

function makeHarness(token = jwt) {
  const calls = [];
  const transport = async (url, options = {}) => {
    calls.push({ url, options });
    return makeResponse();
  };
  const api = createVpbuddyApi({
    baseUrl: `${backendOrigin}/`,
    getToken: () => token,
    transport,
    timeoutMs: 0
  });
  return { api, calls };
}

function requireMethod(api, names) {
  const candidates = Array.isArray(names) ? names : [names];
  const name = candidates.find((candidate) => typeof api[candidate] === "function");
  assert.ok(name, `API client must expose one of: ${candidates.join(", ")}`);
  return api[name].bind(api);
}

async function captureCall(harness, invoke) {
  const before = harness.calls.length;
  await invoke(harness.api);
  assert.equal(harness.calls.length, before + 1, "one API method must issue exactly one request");
  return harness.calls.at(-1);
}

function requestMethod(call) {
  return (call.options.method || "GET").toUpperCase();
}

function headerValue(headers, name) {
  if (!headers) return undefined;
  if (typeof headers.get === "function") return headers.get(name) ?? undefined;
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry?.[1];
}

function assertSourceExcludes(source, pattern, message) {
  assert.ok(!pattern.test(source), message);
}

function assertRequest(call, method, pathname, search = "") {
  const url = new URL(call.url);
  assert.equal(url.origin, backendOrigin);
  assert.equal(requestMethod(call), method);
  assert.equal(url.pathname, pathname);
  assert.equal(url.search, search);
}

function flattenStrings(value, result = []) {
  if (typeof value === "string") result.push(value);
  else if (value && typeof value === "object") {
    for (const child of Object.values(value)) flattenStrings(child, result);
  }
  return result;
}

test("account authentication uses the backend email/password routes", async () => {
  const harness = makeHarness();
  const credentials = { email: "vp@example.com", password: "correct-horse" };

  const login = await captureCall(harness, (api) => requireMethod(api, "login")(credentials));
  assertRequest(login, "POST", "/api/auth/login");
  assert.deepEqual(JSON.parse(login.options.body), credentials);
  assert.equal(headerValue(login.options.headers, "authorization"), undefined);

  const register = await captureCall(harness, (api) => requireMethod(api, "register")(credentials));
  assertRequest(register, "POST", "/api/auth/register");
  assert.deepEqual(JSON.parse(register.options.body), credentials);
  assert.equal(headerValue(register.options.headers, "authorization"), undefined);
});

test("a late 401 from an old session cannot log out a newer session", async () => {
  let activeToken = "session-old";
  let resolveTransport;
  let unauthorizedCount = 0;
  const api = createVpbuddyApi({
    baseUrl: backendOrigin,
    getToken: () => activeToken,
    onUnauthorized: () => {
      unauthorizedCount += 1;
    },
    timeoutMs: 0,
    transport: async () => new Promise((resolve) => {
      resolveTransport = resolve;
    })
  });

  const staleRequest = api.me();
  await Promise.resolve();
  activeToken = "session-new";
  resolveTransport(makeErrorResponse(401));

  await assert.rejects(staleRequest, (error) => error?.status === 401);
  assert.equal(unauthorizedCount, 0);
});

test("a 401 for the active session still triggers session reset", async () => {
  let unauthorizedCount = 0;
  const api = createVpbuddyApi({
    baseUrl: backendOrigin,
    getToken: () => jwt,
    onUnauthorized: () => {
      unauthorizedCount += 1;
    },
    timeoutMs: 0,
    transport: async () => makeErrorResponse(401)
  });

  await assert.rejects(api.me(), (error) => error?.status === 401);
  assert.equal(unauthorizedCount, 1);
});

test("API diagnostics report request health without leaking query values", async () => {
  const diagnostics = [];
  const api = createVpbuddyApi({
    baseUrl: backendOrigin,
    getToken: () => jwt,
    timeoutMs: 0,
    onDiagnostic: (entry) => diagnostics.push(entry),
    transport: async () => makeResponse()
  });

  await api.answerCollab(meetingId, {
    qid: "question-7",
    answer: "confidential customer answer",
    answerer: "VP"
  });

  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].message, "API request completed");
  assert.equal(diagnostics[0].details.method, "POST");
  assert.equal(diagnostics[0].details.path, `/api/meetings/${meetingId}/collab/answer`);
  assert.equal(diagnostics[0].details.status, 200);
  assert.ok(Number.isFinite(diagnostics[0].details.duration_ms));
  assert.ok(!JSON.stringify(diagnostics[0]).includes("confidential customer answer"));
});

test("ordinary remote requests tolerate normal proxy latency and report clear timeouts", async () => {
  assert.match(clientSource, /timeoutMs\s*=\s*15000/, "the default request window must accommodate a remote backend or proxy");

  const api = createVpbuddyApi({
    baseUrl: backendOrigin,
    getToken: () => jwt,
    timeoutMs: 5,
    transport: async (_url, options = {}) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      }, { once: true });
    })
  });

  await assert.rejects(
    () => api.listMeetings(),
    (error) => error?.code === "ETIMEDOUT" && /请求超时/.test(error.message) && /代理网络/.test(error.message)
  );
});

test("protected API methods send the current Bearer JWT", async (t) => {
  const upload = new Blob(["contract"], { type: "text/plain" });
  const cases = [
    ["current user", (api) => requireMethod(api, "me")(), "GET", "/api/auth/me"],
    ["meeting list", (api) => requireMethod(api, "listMeetings")(), "GET", "/api/meetings"],
    ["meeting creation", (api) => requireMethod(api, "createMeeting")({ meetingId }), "POST", "/api/meetings/stream_start", `?meeting_id=${meetingId}`],
    ["meeting detail", (api) => requireMethod(api, "getMeeting")(meetingId), "GET", `/api/meetings/${meetingId}`],
    ["meeting update", (api) => requireMethod(api, "updateMeeting")(meetingId, { project_name: "New meeting title" }), "PATCH", `/api/meetings/${meetingId}`],
    ["meeting state", (api) => requireMethod(api, "listTranscriptSegments")(meetingId), "GET", `/api/meetings/${meetingId}/state`],
    ["meeting events", (api) => requireMethod(api, "listMeetingEvents")(meetingId), "GET", `/api/meetings/${meetingId}/events`],
    ["meeting archive", (api) => requireMethod(api, "archiveMeeting")(meetingId), "POST", `/api/meetings/${meetingId}/close`],
    ["material list", (api) => requireMethod(api, "listMaterials")(meetingId), "GET", `/api/meetings/${meetingId}/materials`],
    ["material detail", (api) => requireMethod(api, "getMaterial")("material-7"), "GET", "/api/materials/material-7"],
    ["material upload", (api) => requireMethod(api, "uploadMaterial")(meetingId, upload), "POST", `/api/meetings/${meetingId}/materials`],
    ["chat", (api) => requireMethod(api, "sendChat")(meetingId, "hello"), "POST", `/api/meetings/${meetingId}/chat`],
    ["chat attachment", (api) => requireMethod(api, "sendChatAttachment")(meetingId, upload, "review this file"), "POST", `/api/meetings/${meetingId}/chat`],
    ["chat history", (api) => requireMethod(api, "listChatHistory")(meetingId), "GET", `/api/meetings/${meetingId}/chat/history`],
    ["deliverables", (api) => requireMethod(api, "listDeliverables")(meetingId), "GET", `/api/meetings/${meetingId}/docs`],
    ["demo versions", (api) => requireMethod(api, "listDemoVersions")(meetingId), "GET", `/api/meetings/${meetingId}/demo/versions`],
    ["knowledge list", (api) => requireMethod(api, "listKnowledgeDocuments")(meetingId), "GET", "/api/kb/list", `?meeting_id=${meetingId}`],
    ["knowledge search", (api) => requireMethod(api, "searchKnowledge")({ q: "contract", meeting_id: meetingId }), "POST", "/api/kb/search"],
    ["knowledge upload", (api) => requireMethod(api, "uploadKnowledgeDocument")(upload, { meetingId }), "POST", "/api/kb/upload"],
    ["knowledge delete", (api) => requireMethod(api, "deleteKnowledgeDocument")("knowledge-7"), "DELETE", "/api/kb/knowledge-7"],
    ["AI settings read", (api) => requireMethod(api, ["getAISettings", "loadAISettings"])(), "GET", "/api/settings/ai"],
    ["AI settings save", (api) => requireMethod(api, "saveAISettings")({ model: "test-model" }), "PUT", "/api/settings/ai"],
    ["AI settings test", (api) => requireMethod(api, "testAIConnection")(), "POST", "/api/settings/ai/test"]
  ];

  for (const [label, invoke, method, pathname, search = ""] of cases) {
    await t.test(label, async () => {
      const harness = makeHarness();
      const call = await captureCall(harness, invoke);
      assertRequest(call, method, pathname, search);
      assert.equal(headerValue(call.options.headers, "authorization"), `Bearer ${jwt}`);
    });
  }
});

test("multipart material, chat, and KB uploads preserve Bearer auth and backend fields", async () => {
  const upload = new Blob(["contract"], { type: "text/plain" });
  const harness = makeHarness();

  const materialCall = await captureCall(harness, (api) => api.uploadMaterial(meetingId, upload));
  assert.ok(materialCall.options.body instanceof FormData);
  assert.ok(materialCall.options.body.has("file"));
  assert.equal(headerValue(materialCall.options.headers, "authorization"), `Bearer ${jwt}`);
  assert.equal(headerValue(materialCall.options.headers, "content-type"), undefined);

  const chatCall = await captureCall(harness, (api) => api.sendChatAttachment(meetingId, upload, "review this file"));
  assert.ok(chatCall.options.body instanceof FormData);
  assert.ok(chatCall.options.body.has("files"));
  assert.equal(chatCall.options.body.get("text"), "review this file");
  assert.equal(headerValue(chatCall.options.headers, "authorization"), `Bearer ${jwt}`);
  assert.equal(headerValue(chatCall.options.headers, "content-type"), undefined);

  const knowledgeCall = await captureCall(harness, (api) => api.uploadKnowledgeDocument(upload, { meetingId }));
  assert.ok(knowledgeCall.options.body instanceof FormData);
  assert.ok(knowledgeCall.options.body.has("file"));
  assert.equal(knowledgeCall.options.body.get("meeting_id"), meetingId);
  assert.equal(headerValue(knowledgeCall.options.headers, "authorization"), `Bearer ${jwt}`);
  assert.equal(headerValue(knowledgeCall.options.headers, "content-type"), undefined);
});

test("collaboration methods use the canonical collab routes and query contract", async () => {
  const harness = makeHarness();

  const readCall = await captureCall(harness, (api) => requireMethod(api, [
    "getMeetingCollab",
    "getCollab",
    "getCollaboration",
    "listCollab",
    "listCollaboration",
    "readCollab"
  ])(meetingId));
  assertRequest(readCall, "GET", `/api/meetings/${meetingId}/collab`);

  const askCall = await captureCall(harness, (api) => {
    const ask = requireMethod(api, ["askCollab", "askCollabQuestion", "askCollaborationQuestion", "createCollabQuestion", "postCollabQuestion", "askQuestion"]);
    return ask.length >= 3
      ? ask(meetingId, "req", "What is in scope?", "VP")
      : ask(meetingId, { section: "req", question: "What is in scope?", asker: "VP" });
  });
  const askUrl = new URL(askCall.url);
  assert.equal(requestMethod(askCall), "POST");
  assert.equal(askUrl.pathname, `/api/meetings/${meetingId}/collab/ask`);
  assert.equal(askUrl.searchParams.get("section"), "req");
  assert.equal(askUrl.searchParams.get("question"), "What is in scope?");
  assert.equal(askUrl.searchParams.get("asker"), "VP");

  const answerCall = await captureCall(harness, (api) => {
    const answer = requireMethod(api, ["answerCollab", "answerCollabQuestion", "answerCollaborationQuestion", "postCollabAnswer", "answerQuestion"]);
    return answer.length >= 3
      ? answer(meetingId, "question-9", "It is in scope.", "VP")
      : answer(meetingId, { qid: "question-9", answer: "It is in scope.", answerer: "VP" });
  });
  const answerUrl = new URL(answerCall.url);
  assert.equal(requestMethod(answerCall), "POST");
  assert.equal(answerUrl.pathname, `/api/meetings/${meetingId}/collab/answer`);
  assert.equal(answerUrl.searchParams.get("qid"), "question-9");
  assert.equal(answerUrl.searchParams.get("answer"), "It is in scope.");
  assert.equal(answerUrl.searchParams.get("answerer"), "VP");

  for (const call of [readCall, askCall, answerCall]) {
    assert.equal(headerValue(call.options.headers, "authorization"), `Bearer ${jwt}`);
  }
});

test("the endpoint registry documents only current canonical backend routes", () => {
  const declared = new Set(flattenStrings(endpoints));
  const expected = [
    "POST /api/auth/register",
    "POST /api/auth/login",
    "GET /api/auth/me",
    "GET /api/meetings",
    "POST /api/meetings/stream_start",
    "GET /api/meetings/:id",
    "GET /api/meetings/:id/state",
    "GET /api/meetings/:id/events",
    "POST /api/meetings/:id/close",
    "GET /api/meetings/:id/materials",
    "POST /api/meetings/:id/materials",
    "GET /api/materials/:id",
    "GET /api/meetings/:id/collab",
    "POST /api/meetings/:id/collab/ask",
    "POST /api/meetings/:id/collab/answer",
    "GET /api/meetings/:id/docs",
    "GET /api/meetings/:id/docs/:kind",
    "GET /api/meetings/:id/docs/:kind/download",
    "GET /api/meetings/:id/demo/versions",
    "GET /api/kb/list",
    "POST /api/kb/search",
    "POST /api/kb/upload",
    "GET /api/settings/ai",
    "PUT /api/settings/ai",
    "POST /api/settings/ai/test"
  ];

  for (const route of expected) {
    assert.ok(declared.has(route), `missing endpoint declaration: ${route}`);
  }

  const normalizePath = (value) => value
    .split("?", 1)[0]
    .replace(/:[^/]+/g, ":param");
  const allowed = new Set([
    "POST /api/auth/register",
    "POST /api/auth/login",
    "GET /api/auth/me",
    "GET /api/client/device-status",
    "GET /api/meetings",
    "GET /api/meetings/check_id",
    "POST /api/meetings/stream_start",
    "GET /api/meetings/:param",
    "PATCH /api/meetings/:param",
    "DELETE /api/meetings/:param",
    "GET /api/meetings/:param/state",
    "GET /api/meetings/:param/events",
    "POST /api/meetings/:param/close",
    "GET /api/meetings/:param/aggregate",
    "GET /api/meetings/:param/materials",
    "POST /api/meetings/:param/materials",
    "GET /api/materials/:param",
    "DELETE /api/materials/:param",
    "GET /api/materials/:param/file",
    "POST /api/meetings/:param/chat",
    "GET /api/meetings/:param/chat/history",
    "GET /api/meetings/:param/collab",
    "POST /api/meetings/:param/collab/ask",
    "POST /api/meetings/:param/collab/answer",
    "GET /api/meetings/:param/docs",
    "GET /api/meetings/:param/docs/:param",
    "GET /api/meetings/:param/docs/:param/download",
    "GET /api/meetings/:param/demo/versions",
    "GET /api/kb/list",
    "GET /api/kb/search",
    "POST /api/kb/search",
    "POST /api/kb/upload",
    "DELETE /api/kb/:param",
    "GET /api/kb/:param/file",
    "GET /api/settings/ai",
    "PUT /api/settings/ai",
    "POST /api/settings/ai/test",
    "POST /meetings/:param/recording/start",
    "POST /meetings/:param/recording/stop"
  ]);

  for (const declaration of declared) {
    const match = /^(GET|POST|PUT|PATCH|DELETE)(?:\/(GET|POST|PUT|PATCH|DELETE))*\s+(\S+)/.exec(declaration);
    if (!match) continue;
    const methods = declaration.slice(0, declaration.indexOf(" ")).split("/");
    const normalizedPath = normalizePath(match[3]);
    for (const method of methods) {
      assert.ok(allowed.has(`${method} ${normalizedPath}`), `unsupported backend endpoint declaration: ${method} ${match[3]}`);
    }
  }
});

test("the API client contains no unsupported non-/api route aliases", () => {
  const directLegacyRoute = /["'`]\/(?:auth|materials|deliverables|knowledge|settings|client|workspace)(?:\/|[?"'`])/;
  const documentedLegacyRoute = /\b(?:GET|POST|PUT|PATCH|DELETE)(?:\/[A-Z]+)?\s+\/(?:auth|materials|deliverables|knowledge|settings|client|workspace)(?:\/|\b)/;
  const unsupportedCanonicalRoute = /\/api\/(?:auth\/(?:sso\/|password-reset)|meetings\/\$\{[^}]+\}\/stream_stop)/;

  assertSourceExcludes(clientSource, directLegacyRoute, "API methods must not call legacy non-/api route aliases");
  assertSourceExcludes(clientSource, documentedLegacyRoute, "endpoint declarations must not advertise legacy non-/api routes");
  assertSourceExcludes(clientSource, unsupportedCanonicalRoute, "API methods must not call routes absent from the current backend");
});
