import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number.parseInt(process.env.PORT || "4173", 10);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8"
};

function resolvePath(url) {
  let cleanUrl;
  try {
    cleanUrl = decodeURIComponent(url.split("?")[0]);
  } catch {
    return null;
  }

  const requested = cleanUrl === "/" ? "/index.html" : cleanUrl;
  const target = normalize(join(root, requested));
  if (!target.startsWith(root)) return null;
  if (!existsSync(target)) return null;

  const stats = statSync(target);
  if (stats.isDirectory()) {
    const indexFile = join(target, "index.html");
    if (!existsSync(indexFile) || !statSync(indexFile).isFile()) return null;
    return indexFile;
  }

  if (!stats.isFile()) return null;
  return target;
}

createServer((req, res) => {
  const file = resolvePath(req.url || "/");
  if (!file) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  res.writeHead(200, {
    "Content-Type": mime[extname(file)] || "application/octet-stream",
    "Cache-Control": "no-store"
  });

  const stream = createReadStream(file);
  stream.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    }
    res.end("Server error");
  });
  stream.pipe(res);
}).listen(port, "127.0.0.1", () => {
  console.log(`VPBuddy frontend running at http://127.0.0.1:${port}`);
});
