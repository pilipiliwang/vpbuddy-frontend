import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { connect } from "node:net";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createVpbuddyWebServer, isProxyPath } from "../server.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

async function closeServer(server) {
  if (!server.listening) return;
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
}

async function createFixture() {
  const requests = [];
  const upgrades = [];
  const backend = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString("utf8");
    requests.push({ method: req.method, url: req.url, headers: req.headers, body });

    if (req.url.startsWith("/api/events")) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache"
      });
      res.end("id: event-1\nevent: transcript\ndata: {\"text\":\"hello\"}\n\n");
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ method: req.method, url: req.url, authorization: req.headers.authorization, body }));
  });

  backend.on("upgrade", (req, socket) => {
    upgrades.push({ url: req.url, authorization: req.headers.authorization });
    socket.end([
      "HTTP/1.1 101 Switching Protocols",
      "Connection: Upgrade",
      "Upgrade: websocket",
      "",
      ""
    ].join("\r\n"));
  });

  const backendPort = await listen(backend);
  const app = createVpbuddyWebServer({
    root: repoRoot,
    backendUrl: `http://127.0.0.1:${backendPort}`,
    logger: { error() {} }
  });
  const webPort = await listen(app.server);

  return {
    app,
    backend,
    requests,
    upgrades,
    origin: `http://127.0.0.1:${webPort}`,
    async close() {
      await app.close();
      await closeServer(backend);
    }
  };
}

function rawUpgrade(port, path) {
  return new Promise((resolveResponse, rejectResponse) => {
    const socket = connect(port, "127.0.0.1");
    let response = "";
    socket.setEncoding("utf8");
    socket.on("connect", () => {
      socket.write([
        `GET ${path} HTTP/1.1`,
        `Host: 127.0.0.1:${port}`,
        "Connection: Upgrade",
        "Upgrade: websocket",
        "Sec-WebSocket-Version: 13",
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
        "Authorization: Bearer websocket-token",
        "",
        ""
      ].join("\r\n"));
    });
    socket.on("data", (chunk) => {
      response += chunk;
    });
    socket.on("end", () => resolveResponse(response));
    socket.on("error", rejectResponse);
    socket.setTimeout(5_000, () => {
      socket.destroy(new Error("WebSocket proxy test timed out"));
    });
  });
}

test("web runtime serves the unchanged UI with same-origin API configuration", async (t) => {
  const fixture = await createFixture();
  t.after(() => fixture.close());

  const page = await fetch(`${fixture.origin}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /^text\/html/);
  assert.equal(page.headers.get("permissions-policy"), "microphone=(self), camera=(), geolocation=()");
  const html = await page.text();
  assert.match(html, /src="\.\/src\/main\.js"/);
  assert.match(html, /href="\.\/src\/styles\.css"/);

  const config = await fetch(`${fixture.origin}/desktop-config.js`);
  const script = await config.text();
  assert.equal(config.status, 200);
  assert.match(script, /window\.VPBUDDY_RUNTIME_API_BASE_URL = window\.location\.origin/);
  assert.match(script, /window\.VPBUDDY_API_BASE_LOCKED = true/);
  assert.match(script, /window\.VPBUDDY_WEB = true/);
  assert.doesNotMatch(script, /47\.100\.182\.3/);

  const health = await fetch(`${fixture.origin}/healthz`).then((response) => response.json());
  assert.equal(health.status, "ok");
  assert.equal(health.service, "vpbuddy-web");

  const protectedFile = await fetch(`${fixture.origin}/package.json`);
  assert.equal(protectedFile.status, 404);

  const spaRoute = await fetch(`${fixture.origin}/meetings-ui/example`, {
    headers: { Accept: "text/html" }
  });
  assert.equal(spaRoute.status, 200);
  assert.match(await spaRoute.text(), /<div id="app"><\/div>/);
});

test("HTTP, upload-style bodies and non-api backend paths remain byte-compatible", async (t) => {
  const fixture = await createFixture();
  t.after(() => fixture.close());

  const payload = "raw-upload-body";
  const response = await fetch(`${fixture.origin}/api/meetings/m-1/materials?source=web`, {
    method: "POST",
    headers: {
      Authorization: "Bearer frontend-token",
      "Content-Type": "application/octet-stream"
    },
    body: payload
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    method: "POST",
    url: "/api/meetings/m-1/materials?source=web",
    authorization: "Bearer frontend-token",
    body: payload
  });

  await fetch(`${fixture.origin}/meetings/m-1/recording/start`, { method: "POST" });
  await fetch(`${fixture.origin}/docs/m-1/demo.html?v=V2`);
  assert.deepEqual(
    fixture.requests.map((entry) => entry.url),
    [
      "/api/meetings/m-1/materials?source=web",
      "/meetings/m-1/recording/start",
      "/docs/m-1/demo.html?v=V2"
    ]
  );
});

test("SSE responses stream through the web proxy without buffering metadata", async (t) => {
  const fixture = await createFixture();
  t.after(() => fixture.close());

  const response = await fetch(`${fixture.origin}/api/events`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/event-stream/);
  assert.equal(response.headers.get("x-accel-buffering"), "no");
  assert.equal(
    await response.text(),
    "id: event-1\nevent: transcript\ndata: {\"text\":\"hello\"}\n\n"
  );
});

test("realtime ASR WebSocket upgrades preserve path, query and authorization", async (t) => {
  const fixture = await createFixture();
  t.after(() => fixture.close());
  const webPort = Number(new URL(fixture.origin).port);

  const response = await rawUpgrade(webPort, "/api/meetings/m-1/realtime_asr?token=query-token");
  assert.match(response, /^HTTP\/1\.1 101 Switching Protocols/m);
  assert.deepEqual(fixture.upgrades, [{
    url: "/api/meetings/m-1/realtime_asr?token=query-token",
    authorization: "Bearer websocket-token"
  }]);
});

test("only the existing backend route families are proxied", () => {
  assert.equal(isProxyPath("/api/auth/me"), true);
  assert.equal(isProxyPath("/meetings/id/recording/start"), true);
  assert.equal(isProxyPath("/docs/id/demo.html"), true);
  assert.equal(isProxyPath("/apiary"), false);
  assert.equal(isProxyPath("/package.json"), false);
});
