import "dotenv/config";
import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import worker from "./index.js";

const PORT  = Number(process.env.SERVER_PORT || process.env.PORT) || 4000;
const BASE  = process.env.BASE_PATH ?? "";
const API_VERSION = "2.3";
const __dir = dirname(fileURLToPath(import.meta.url));

const STATIC = {
  "/":           { file: "docs/landing.html", mime: "text/html" },
  "/docs":       { file: "docs/index.html",   mime: "text/html" },
  "/style.css":  { file: "docs/style.css",    mime: "text/css"  },
  "/logo.svg":   { file: "docs/logo.svg",     mime: "image/svg+xml" },
};

function serveStatic(res, entry) {
  try {
    const body = readFileSync(join(__dir, entry.file), "utf8").replaceAll("{{API_VERSION}}", API_VERSION);
    res.writeHead(200, {
      "Content-Type":  entry.mime + "; charset=utf-8",
      "Cache-Control": "no-cache",
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

async function nodeToRequest(req) {
  const host     = req.headers["host"] ?? `localhost:${PORT}`;
  const proto    = req.headers["x-forwarded-proto"] || "http";
  const stripped = BASE && req.url.startsWith(BASE) ? req.url.slice(BASE.length) || "/" : req.url;
  const url      = `${proto}://${host}${stripped}`;

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : null;

  return new Request(url, {
    method:  req.method,
    headers: req.headers,
    body:    body?.length ? body : undefined,
    duplex:  "half",
  });
}

const server = http.createServer(async (req, res) => {
  console.log(`→ ${req.method} ${req.url}`);

  const pathname = req.url.split("?")[0];
  const staticEntry = STATIC[pathname];

  if (req.method === "GET" && staticEntry) {
    const accept = String(req.headers.accept || "");
    const wantsJson = accept.includes("application/json") && !accept.includes("text/html");
    if (!(pathname === "/" && wantsJson)) {
      return serveStatic(res, staticEntry);
    }
  }

  try {
    const request  = await nodeToRequest(req);
    const response = await worker.fetch(request, {
      API_VERSION,
      ANIVEXA_URL: `http://localhost:${PORT}`,
      PUBLIC_URL: process.env.PUBLIC_URL || "",
    });

    res.statusCode = response.status;
    for (const [k, v] of response.headers) res.setHeader(k, v);

    const buf = await response.arrayBuffer();
    res.end(Buffer.from(buf));
  } catch (err) {
    console.error("Unhandled error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`Anivexa dev server → http://localhost:${PORT}`);
});
