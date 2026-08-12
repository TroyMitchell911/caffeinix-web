#!/usr/bin/env node
/* SPDX-License-Identifier: GPL-3.0-only */

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, isAbsolute, resolve, sep } from "node:path";

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const root = resolve(option("--root", "dist"));
const port = Number(option("--port", "4173"));
const host = option("--host", "127.0.0.1");
const isolationHeaders = process.argv.includes("--isolation-headers");
let base = option("--base", "/");
if (!base.startsWith("/")) {
  base = `/${base}`;
}
if (!base.endsWith("/")) {
  base = `${base}/`;
}

const contentTypes = {
  ".bin": "application/octet-stream",
  ".bz2": "application/x-bzip2",
  ".css": "text/css; charset=utf-8",
  ".ext4": "application/octet-stream",
  ".gz": "application/gzip",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (!url.pathname.startsWith(base)) {
      response.writeHead(404).end("Not found\n");
      return;
    }
    let relative = decodeURIComponent(url.pathname.slice(base.length));
    if (!relative || relative.endsWith("/")) {
      relative = `${relative}index.html`;
    }
    if (isAbsolute(relative)) {
      response.writeHead(400).end("Bad path\n");
      return;
    }
    const path = resolve(root, relative);
    if (path !== root && !path.startsWith(`${root}${sep}`)) {
      response.writeHead(400).end("Bad path\n");
      return;
    }
    const info = await stat(path);
    const immutable = /\/assets\/(?:app|guest|qemu)-/.test(url.pathname);
    const headers = {
      "Cache-Control": immutable
        ? "public, max-age=31536000, immutable"
        : "no-cache",
      "Content-Length": info.size,
      "Content-Type": contentTypes[extname(path)] || "application/octet-stream",
    };
    if (isolationHeaders) {
      headers["Cross-Origin-Embedder-Policy"] = "require-corp";
      headers["Cross-Origin-Opener-Policy"] = "same-origin";
      headers["Cross-Origin-Resource-Policy"] = "same-origin";
    }
    response.writeHead(200, headers);
    if (request.method === "HEAD") {
      response.end();
    } else {
      createReadStream(path).pipe(response);
    }
  } catch (_error) {
    response.writeHead(404).end("Not found\n");
  }
});

server.listen(port, host, () => {
  console.log(`SERVER_READY http://${host}:${port}${base}`);
});
