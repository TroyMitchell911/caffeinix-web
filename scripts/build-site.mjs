#!/usr/bin/env node
/* SPDX-License-Identifier: GPL-3.0-only */

import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { readEnvironment, requireKeys } from "../lib/config.mjs";

const topdir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(process.env.DIST || resolve(topdir, "dist"));
const qemuOutput = resolve(
  process.env.QEMU_WASM_OUTPUT || resolve(topdir, "output/qemu-wasm"),
);
const guestOutput = resolve(
  process.env.GUEST_OUTPUT || resolve(topdir, "output/guest"),
);

if (dist === topdir || !dist.startsWith(`${topdir}${sep}`)) {
  throw new Error(`DIST must be a child of ${topdir}`);
}

const guestLock = await readEnvironment(resolve(topdir, "guest.lock"));
const qemuLock = await readEnvironment(resolve(topdir, "qemu-wasm.lock"));
const guestBuild = await readEnvironment(resolve(guestOutput, "build.env"));
const qemuBuild = await readEnvironment(resolve(qemuOutput, "build.env"));

requireKeys(guestLock, [
  "CAFFEINIX_REPOSITORY",
  "CAFFEINIX_BRANCH",
  "CAFFEINIX_COMMIT",
  "OPENSBI_REPOSITORY",
  "OPENSBI_COMMIT",
  "OPENSBI_VERSION",
  "MUSL_VERSION",
  "BUSYBOX_VERSION",
], "guest.lock");
requireKeys(qemuLock, [
  "QEMU_WASM_REPOSITORY",
  "QEMU_WASM_COMMIT",
  "QEMU_VERSION",
  "WASM_MEMORY_MB",
], "qemu-wasm.lock");

if (guestBuild.CAFFEINIX_COMMIT !== guestLock.CAFFEINIX_COMMIT) {
  throw new Error("guest output does not match guest.lock");
}
if (guestBuild.OPENSBI_COMMIT !== guestLock.OPENSBI_COMMIT) {
  throw new Error("OpenSBI output does not match guest.lock");
}
if (qemuBuild.QEMU_WASM_COMMIT !== qemuLock.QEMU_WASM_COMMIT) {
  throw new Error("QEMU-WASM output does not match qemu-wasm.lock");
}

async function sha256(path) {
  const hash = createHash("sha256");
  hash.update(await readFile(path));
  return hash.digest("hex");
}

async function combinedHash(paths) {
  const hash = createHash("sha256");
  for (const [index, path] of paths.entries()) {
    hash.update(String(index));
    hash.update("\0");
    hash.update(await readFile(path));
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function copyFile(source, destination) {
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination);
}

async function describe(path) {
  const info = await stat(resolve(dist, path));
  return {
    path,
    sha256: await sha256(resolve(dist, path)),
    size: info.size,
  };
}

async function walk(path, result = []) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) {
      await walk(child, result);
    } else {
      result.push(relative(dist, child).split(sep).join("/"));
    }
  }
  return result;
}

await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, "assets"), { recursive: true });

const appSources = [
  resolve(topdir, "web/app.js"),
  resolve(topdir, "web/styles.css"),
  resolve(topdir, "node_modules/@xterm/xterm/lib/xterm.js"),
  resolve(topdir, "node_modules/@xterm/xterm/css/xterm.css"),
  resolve(topdir, "node_modules/@xterm/addon-fit/lib/addon-fit.js"),
  resolve(topdir, "node_modules/xterm-pty/index.js"),
];
const appHash = (await combinedHash(appSources)).slice(0, 16);
const appDirectory = `assets/app-${appHash}`;
const appFiles = {
  app: `${appDirectory}/app.js`,
  css: `${appDirectory}/styles.css`,
  fit: `${appDirectory}/addon-fit.js`,
  pty: `${appDirectory}/xterm-pty.js`,
  xterm: `${appDirectory}/xterm.js`,
  xtermCss: `${appDirectory}/xterm.css`,
};

for (const [source, destination] of [
  [appSources[0], appFiles.app],
  [appSources[1], appFiles.css],
  [appSources[2], appFiles.xterm],
  [appSources[3], appFiles.xtermCss],
  [appSources[4], appFiles.fit],
  [appSources[5], appFiles.pty],
]) {
  await copyFile(source, resolve(dist, destination));
}

const qemuShort = qemuLock.QEMU_WASM_COMMIT.slice(0, 12);
const qemuSources = [
  resolve(qemuOutput, "qemu-system-riscv64.js"),
  resolve(qemuOutput, "qemu-system-riscv64.wasm"),
  resolve(qemuOutput, "qemu-system-riscv64.worker.js"),
];
const qemuHash = (await combinedHash(qemuSources)).slice(0, 16);
const qemuDirectory = `assets/qemu-${qemuShort}-${qemuHash}`;
const qemuFiles = {
  module: `${qemuDirectory}/qemu-system-riscv64.js`,
  wasm: `${qemuDirectory}/qemu-system-riscv64.wasm`,
  worker: `${qemuDirectory}/qemu-system-riscv64.worker.js`,
};
for (const [source, destination] of Object.entries(qemuFiles)) {
  await copyFile(
    qemuSources[{ module: 0, wasm: 1, worker: 2 }[source]],
    resolve(dist, destination),
  );
}

const guestShort = guestLock.CAFFEINIX_COMMIT.slice(0, 12);
const guestSources = [
  resolve(guestOutput, "opensbi.bin"),
  resolve(guestOutput, "kernel"),
  resolve(guestOutput, "root.ext4"),
];
const guestHash = (await combinedHash(guestSources)).slice(0, 16);
const guestDirectory = `assets/guest-${guestShort}-${guestHash}`;
const guestFiles = {
  firmware: `${guestDirectory}/opensbi.bin`,
  kernel: `${guestDirectory}/kernel`,
  root: `${guestDirectory}/root.ext4`,
};
for (const [source, destination] of Object.entries(guestFiles)) {
  await copyFile(
    guestSources[{ firmware: 0, kernel: 1, root: 2 }[source]],
    resolve(dist, destination),
  );
}

await copyFile(
  resolve(topdir, "third_party/coi-serviceworker.js"),
  resolve(dist, "coi-serviceworker.js"),
);
await copyFile(resolve(topdir, "LICENSE"), resolve(dist, "LICENSE.txt"));
await copyFile(
  resolve(topdir, "THIRD_PARTY_NOTICES.md"),
  resolve(dist, "THIRD_PARTY_NOTICES.md"),
);
await copyFile(
  resolve(topdir, "third_party/licenses/coi-serviceworker.txt"),
  resolve(dist, "licenses/coi-serviceworker.txt"),
);
await copyFile(
  resolve(topdir, "node_modules/@xterm/xterm/LICENSE"),
  resolve(dist, "licenses/xterm.txt"),
);
await copyFile(
  resolve(topdir, "node_modules/@xterm/addon-fit/LICENSE"),
  resolve(dist, "licenses/xterm-addon-fit.txt"),
);
await copyFile(
  resolve(topdir, "node_modules/xterm-pty/LICENSE.txt"),
  resolve(dist, "licenses/xterm-pty.txt"),
);

await cp(resolve(qemuOutput, "sources"), resolve(dist, "sources"), {
  recursive: true,
});
await cp(resolve(guestOutput, "sources"), resolve(dist, "sources"), {
  recursive: true,
});

const sourceReadme = `Caffeinix browser demo source bundle

The exact source archives used for the guest and QEMU-WASM build are in this
directory. Additional build dependency provenance and licenses are recorded
in ../THIRD_PARTY_NOTICES.md.

Caffeinix: ${guestLock.CAFFEINIX_REPOSITORY}
Commit: ${guestLock.CAFFEINIX_COMMIT}

QEMU-WASM: ${qemuLock.QEMU_WASM_REPOSITORY}
Commit: ${qemuLock.QEMU_WASM_COMMIT}

OpenSBI: ${guestLock.OPENSBI_REPOSITORY}
Commit: ${guestLock.OPENSBI_COMMIT}
`;
await writeFile(resolve(dist, "sources/README.txt"), sourceReadme);
await writeFile(resolve(dist, ".nojekyll"), "");

let index = await readFile(resolve(topdir, "web/index.html.in"), "utf8");
const replacements = {
  "@@APP_CSS@@": `./${appFiles.css}`,
  "@@APP_JS@@": `./${appFiles.app}`,
  "@@FIT_JS@@": `./${appFiles.fit}`,
  "@@PTY_JS@@": `./${appFiles.pty}`,
  "@@XTERM_CSS@@": `./${appFiles.xtermCss}`,
  "@@XTERM_JS@@": `./${appFiles.xterm}`,
};
for (const [placeholder, value] of Object.entries(replacements)) {
  index = index.replaceAll(placeholder, value);
}
if (index.includes("@@")) {
  throw new Error("unexpanded index.html placeholder");
}
await writeFile(resolve(dist, "index.html"), index);

const runtime = {
  commit: qemuLock.QEMU_WASM_COMMIT,
  memoryMiB: Number(qemuLock.WASM_MEMORY_MB),
  module: await describe(qemuFiles.module),
  wasm: await describe(qemuFiles.wasm),
  worker: await describe(qemuFiles.worker),
};
const guest = {
  branch: guestLock.CAFFEINIX_BRANCH,
  commit: guestLock.CAFFEINIX_COMMIT,
  defaultHarts: 2,
  maximumHarts: 2,
  memoryMiB: 64,
  repository: guestLock.CAFFEINIX_REPOSITORY,
  firmware: await describe(guestFiles.firmware),
  kernel: await describe(guestFiles.kernel),
  root: await describe(guestFiles.root),
};

const files = {};
for (const path of (await walk(dist)).sort()) {
  files[path] = await describe(path);
}
const manifest = {
  schema: 1,
  release: `${guestShort}-${qemuShort}`,
  runtime,
  guest,
  opensbi: {
    commit: guestLock.OPENSBI_COMMIT,
    repository: guestLock.OPENSBI_REPOSITORY,
    version: guestLock.OPENSBI_VERSION,
  },
  musl: { version: guestLock.MUSL_VERSION },
  busybox: { version: guestLock.BUSYBOX_VERSION },
  qemu: { version: qemuLock.QEMU_VERSION },
  totalDownloadBytes: [
    runtime.module,
    runtime.wasm,
    runtime.worker,
    guest.firmware,
    guest.kernel,
    guest.root,
  ].reduce((sum, asset) => sum + asset.size, 0),
  files,
};
await writeFile(
  resolve(dist, "assets/manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

console.log(`Built ${dist}`);
console.log(`Release ${manifest.release}`);
console.log(`Browser download ${manifest.totalDownloadBytes} bytes`);
