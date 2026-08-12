#!/usr/bin/env node
/* SPDX-License-Identifier: GPL-3.0-only */

import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const topdir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(process.env.DIST || resolve(topdir, "dist"));
const manifestPath = resolve(dist, "assets/manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function describe(path) {
  const data = await readFile(resolve(dist, path));
  return {
    path,
    sha256: createHash("sha256").update(data).digest("hex"),
    size: data.byteLength,
  };
}

async function walk(path, result = []) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) {
      await walk(child, result);
    } else {
      const name = relative(dist, child).split(sep).join("/");
      if (name !== "assets/manifest.json") {
        result.push(name);
      }
    }
  }
  return result;
}

assert(manifest.schema === 1, "unsupported manifest schema");
assert(/^[0-9a-f]{40}$/.test(manifest.guest.commit), "invalid guest commit");
assert(/^[0-9a-f]{40}$/.test(manifest.runtime.commit), "invalid QEMU commit");
assert(manifest.guest.memoryMiB === 64, "unexpected guest memory");
assert(manifest.guest.maximumHarts === 2, "unexpected hart limit");
assert(manifest.runtime.memoryMiB === 512, "unexpected WebAssembly memory");

const actualFiles = (await walk(dist)).sort();
const recordedFiles = Object.keys(manifest.files).sort();
assert(
  JSON.stringify(actualFiles) === JSON.stringify(recordedFiles),
  "manifest file set does not match the site",
);
for (const path of actualFiles) {
  const actual = await describe(path);
  const expected = manifest.files[path];
  assert(actual.size === expected.size, `size mismatch: ${path}`);
  assert(actual.sha256 === expected.sha256, `SHA-256 mismatch: ${path}`);
}

const index = await readFile(resolve(dist, "index.html"), "utf8");
assert(!/(?:src|href)="\//.test(index), "index contains an absolute asset URL");
assert(!index.includes("@@"), "index contains a template placeholder");

const forbidden = /WebSocket|\/api\/|render\.com|ghcr\.io/i;
const appPath = Object.keys(manifest.files)
  .find((path) => /\/app\.js$/.test(path));
assert(appPath, "application JavaScript is missing");
const authoredFiles = [
  "index.html",
  appPath,
  "THIRD_PARTY_NOTICES.md",
];
for (const path of authoredFiles) {
  const content = await readFile(resolve(dist, path), "utf8");
  assert(!forbidden.test(content), `obsolete server reference: ${path}`);
}

const rootInfo = await stat(resolve(dist, manifest.guest.root.path));
assert(rootInfo.size <= 16 * 1024 * 1024, "root image exceeds 16 MiB");
const total = actualFiles.reduce(
  (sum, path) => sum + manifest.files[path].size,
  0,
);
assert(total < 1024 * 1024 * 1024, "site exceeds the GitHub Pages limit");
for (const source of [
  "qemu-wasm-source.tar.gz",
  "zlib-1.3.1.tar.gz",
  "glib-2.75.0.tar.xz",
  "pcre2-10.40.tar.gz",
  "pcre2_10.40-3_patch.zip",
  "gvdb-source.tar.gz",
  "libffi-source.tar.gz",
  "pixman-source.tar.gz",
  "dtc-source.tar.gz",
  "keycodemapdb-source.tar.gz",
  "softfloat-source.tar.gz",
  "testfloat-source.tar.gz",
  "xterm-source.tgz",
  "xterm-pty-source.tgz",
]) {
  assert(
    await stat(resolve(dist, `sources/${source}`)),
    `build source archive is missing: ${source}`,
  );
}

console.log(`SITE_CHECK_OK files=${actualFiles.length} bytes=${total}`);
