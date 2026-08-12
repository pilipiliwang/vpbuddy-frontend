import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
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
  assert.match(script, /window\.VPBUDDY_RUNTIME_API_BASE_URL = window\.location\.origin \+ "\/vpbuddy"/);
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
  const response = await fetch(`${fixture.origin}/vpbuddy/api/meetings/m-1/materials?source=web`, {
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

  await fetch(`${fixture.origin}/vpbuddy/meetings/m-1/recording/start`, { method: "POST" });
  await fetch(`${fixture.origin}/vpbuddy/docs/m-1/demo.html?v=V2`);
  await fetch(`${fixture.origin}/api/client/device-status?via=upstream-strip`);
  assert.deepEqual(
    fixture.requests.map((entry) => entry.url),
    [
      "/api/meetings/m-1/materials?source=web",
      "/meetings/m-1/recording/start",
      "/docs/m-1/demo.html?v=V2",
      "/api/client/device-status?via=upstream-strip"
    ]
  );
});

test("SSE responses stream through the web proxy without buffering metadata", async (t) => {
  const fixture = await createFixture();
  t.after(() => fixture.close());

  const response = await fetch(`${fixture.origin}/vpbuddy/api/events`);
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

  const response = await rawUpgrade(webPort, "/vpbuddy/api/meetings/m-1/realtime_asr?token=query-token");
  assert.match(response, /^HTTP\/1\.1 101 Switching Protocols/m);
  assert.deepEqual(fixture.upgrades, [{
    url: "/api/meetings/m-1/realtime_asr?token=query-token",
    authorization: "Bearer websocket-token"
  }]);
});

test("only the existing backend route families are proxied", () => {
  assert.equal(isProxyPath("/vpbuddy/api/auth/me"), true);
  assert.equal(isProxyPath("/vpbuddy/meetings/id/recording/start"), true);
  assert.equal(isProxyPath("/vpbuddy/docs/id/demo.html"), true);
  assert.equal(isProxyPath("/api/auth/me"), true);
  assert.equal(isProxyPath("/meetings/id/recording/start"), true);
  assert.equal(isProxyPath("/docs/id/demo.html"), true);
  assert.equal(isProxyPath("/apiary"), false);
  assert.equal(isProxyPath("/vpbuddy/apiary"), false);
  assert.equal(isProxyPath("/package.json"), false);
});

test("the browser starts on a marketing page while desktop authentication remains unchanged", async () => {
  const [mainSource, stylesSource] = await Promise.all([
    readFile(resolve(repoRoot, "src/main.js"), "utf8"),
    readFile(resolve(repoRoot, "src/styles.css"), "utf8")
  ]);

  assert.match(mainSource, /const webLandingEnabled = Boolean\(window\.VPBUDDY_WEB\)/);
  assert.match(mainSource, /view: webLandingEnabled && window\.location\.hash !== "#login" \? "landing" : "login"/);
  assert.match(mainSource, /function renderLanding\(\)/);
  assert.match(mainSource, /data-action="start-trial"/);
  assert.match(mainSource, /assets\/hero-collaboration\.png/);
  assert.match(mainSource, /assets\/product-delivery-dashboard\.png/);
  assert.doesNotMatch(mainSource, /VPBuddy 会议投屏中的 ESG 解决方案页面/);
  assert.match(mainSource, /id="landing-contact"/);
  assert.match(mainSource, /aria-label="查看微信联系二维码"/);
  assert.match(mainSource, /assets\/contact-wechat-qr\.png/);
  assert.match(mainSource, /href="tel:15312065105"/);
  assert.doesNotMatch(mainSource, /通过 GitHub 联系项目/);
  assert.doesNotMatch(mainSource, /class="landing-final-cta"/);
  assert.match(mainSource, /上海维睿塔数字科技有限公司/);
  assert.match(mainSource, /沪ICP备2024089319号-5/);
  assert.match(mainSource, /href="https:\/\/beian\.miit\.gov\.cn\/"/);
  assert.match(mainSource, /action === "start-trial"[\s\S]{0,220}?state\.view = "login"/);
  assert.match(mainSource, /webLandingEnabled \? `<button class="login-home-link"/);
  assert.match(stylesSource, /\.landing-hero\s*\{/);
  assert.match(stylesSource, /\.landing-contact\s*\{/);
  assert.match(stylesSource, /\.landing-footer-compliance\s*\{/);
  assert.match(stylesSource, /url\("\.\.\/assets\/login-cityline\.png"\)/);
  assert.match(stylesSource, /@media \(max-width: 680px\)[\s\S]*?\.landing-hero/);
});
