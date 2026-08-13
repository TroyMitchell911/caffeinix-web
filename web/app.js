/* SPDX-License-Identifier: GPL-3.0-only */

const manifestMeta = document.querySelector('meta[name="caffeinix-manifest"]');
const manifestPath = manifestMeta?.content || "./assets/manifest.json";
const manifestUrl = new URL(manifestPath, document.baseURI);

const startButton = document.getElementById("start");
const stopButton = document.getElementById("stop");
const resetButton = document.getElementById("reset");
const cpuSelect = document.getElementById("cpu-select");
const statusLabel = document.getElementById("status");
const statusDot = document.getElementById("status-dot");
const versionLabel = document.getElementById("version");
const stageItems = Array.from(document.querySelectorAll(".boot-steps li"));
const stageOrder = ["download", "verify", "firmware", "kernel", "shell"];
const autoStartKey = "caffeinix-autostart";
const assetCacheName = "caffeinix-verified-assets-v1";
const assetDigestHeader = "X-Caffeinix-Asset-SHA256";

const terminal = new Terminal({
  allowProposedApi: false,
  convertEol: true,
  cursorBlink: true,
  cursorStyle: "bar",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: window.matchMedia("(max-width: 520px)").matches ? 12 : 14,
  lineHeight: 1.22,
  scrollback: 5000,
  theme: {
    background: "#050806",
    foreground: "#dce8e1",
    cursor: "#66f2a7",
    selectionBackground: "#315b49",
    black: "#111714",
    brightBlack: "#718078",
    green: "#66f2a7",
    brightGreen: "#a1ffc9",
    yellow: "#f0b35a",
    red: "#ed6a67",
    cyan: "#6de0d0",
  },
});
const fitAddon = new FitAddon.FitAddon();
terminal.loadAddon(fitAddon);
terminal.open(document.getElementById("terminal"));
fitAddon.fit();

let manifest = null;
let runtime = null;
let ptyMaster = null;
let state = "preparing";
let ignoreRuntimeErrors = false;
let assetCache = null;

function setStatus(label, kind = "") {
  statusLabel.textContent = label;
  statusDot.className = `status-dot ${kind}`.trim();
}

function setStage(stage) {
  const current = stageOrder.indexOf(stage);
  stageItems.forEach((item) => {
    const index = stageOrder.indexOf(item.dataset.stage);
    item.classList.toggle("done", current >= 0 && index < current);
    item.classList.toggle("active", index === current);
  });
}

function finishStages() {
  stageItems.forEach((item) => {
    item.classList.add("done");
    item.classList.remove("active");
  });
}

function setControls(nextState) {
  const launching = nextState === "launching";
  const running = nextState === "running";
  const stopped = nextState === "stopped";
  const ready = nextState === "ready";

  startButton.disabled = !(ready || stopped);
  startButton.textContent = stopped ? "Restart" : "Start";
  stopButton.disabled = !(launching || running);
  resetButton.disabled = !(launching || running || stopped);
  cpuSelect.disabled = launching || running;
}

function terminalText() {
  const lines = [];
  const buffer = terminal.buffer.active;
  for (let index = 0; index < buffer.length; index += 1) {
    lines.push(buffer.getLine(index)?.translateToString(true) || "");
  }
  return lines.join("\n");
}

function absoluteAsset(asset) {
  return new URL(asset.path, document.baseURI);
}

function hex(bytes) {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function fetchVerified(asset, progress, keep) {
  const url = absoluteAsset(asset);
  const cached = await assetCache.match(url);
  if (cached
      && cached.headers.get(assetDigestHeader) === asset.sha256
      && Number(cached.headers.get("Content-Length")) === asset.size) {
    const bytes = new Uint8Array(await cached.arrayBuffer());
    if (bytes.byteLength === asset.size) {
      progress("Reading", bytes.byteLength);
      return keep ? bytes : null;
    }
    await assetCache.delete(url);
  } else if (cached) {
    await assetCache.delete(url);
  }

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`download failed (${response.status}): ${asset.path}`);
  }

  let bytes;
  if (!response.body) {
    bytes = new Uint8Array(await response.arrayBuffer());
    progress("Downloading", bytes.byteLength);
  } else {
    bytes = new Uint8Array(asset.size);
    const reader = response.body.getReader();
    let offset = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (offset + value.byteLength > bytes.byteLength) {
        throw new Error(`asset is larger than its manifest: ${asset.path}`);
      }
      bytes.set(value, offset);
      offset += value.byteLength;
      progress("Downloading", value.byteLength);
    }
    if (offset !== bytes.byteLength) {
      throw new Error(`asset size mismatch: ${asset.path}`);
    }
  }

  setStatus(`Verifying ${url.pathname.split("/").at(-1)}`, "waiting");
  const digest = hex(await crypto.subtle.digest("SHA-256", bytes));
  if (digest !== asset.sha256) {
    throw new Error(`SHA-256 mismatch: ${asset.path}`);
  }

  const headers = new Headers(response.headers);
  headers.set(assetDigestHeader, asset.sha256);
  headers.set("Content-Length", String(asset.size));
  try {
    await assetCache.put(url, new Response(bytes, { headers }));
  } catch (error) {
    console.warn(`could not cache ${asset.path}`, error);
  }
  return keep ? bytes : null;
}

async function pruneAssetCache(assets) {
  const current = new Map(assets.map((asset) => [
    absoluteAsset(asset).href,
    asset.sha256,
  ]));
  for (const request of await assetCache.keys()) {
    const response = await assetCache.match(request);
    if (current.get(request.url) !== response?.headers.get(assetDigestHeader)) {
      await assetCache.delete(request);
    }
  }
}

function checkBrowser() {
  const missing = [];
  if (!window.isSecureContext) {
    missing.push("a secure context");
  }
  if (typeof WebAssembly !== "object") {
    missing.push("WebAssembly");
  }
  if (typeof BigInt !== "function") {
    missing.push("BigInt");
  }
  if (typeof SharedArrayBuffer !== "function") {
    missing.push("SharedArrayBuffer");
  }
  if (!crypto?.subtle) {
    missing.push("Web Crypto");
  }
  if (!window.caches) {
    missing.push("Cache Storage");
  }
  return missing;
}

function qemuArguments(cpus) {
  const accelerator = cpus === 1
    ? "tcg,tb-size=64"
    : "tcg,tb-size=64,thread=multi";
  return [
    "-machine", "virt",
    "-bios", "/pack/opensbi.bin",
    "-kernel", "/pack/kernel",
    "-m", `${manifest.guest.memoryMiB}M`,
    "-smp", String(cpus),
    "-nographic",
    "-accel", accelerator,
    "-global", "virtio-mmio.force-legacy=false",
    "-drive", "file=/pack/root.ext4,if=none,format=raw,id=x0",
    "-device", "virtio-blk-device,drive=x0,bus=virtio-mmio-bus.0",
    "-nic", "none",
  ];
}

function observeUart(master) {
  const decoder = new TextDecoder();
  let tail = "";
  return master.onWrite(([data]) => {
    if (state === "running") {
      return;
    }
    tail = `${tail}${decoder.decode(data, { stream: true })}`.slice(-12000);
    if (tail.includes("OpenSBI")) {
      setStage("firmware");
      setStatus("OpenSBI is running", "waiting");
    }
    if (tail.includes("Hello! Caffeinix")) {
      setStage("kernel");
      setStatus("Caffeinix is booting", "waiting");
    }
    if (/\n# $/.test(tail.replaceAll("\r", ""))) {
      finishStages();
      state = "running";
      setControls(state);
      setStatus("Shell ready", "online");
      terminal.focus();
    }
  });
}

function friendlyError(error) {
  const message = String(error?.stack || error || "unknown error");
  if (message.includes("OOM") || message.includes("out of memory")) {
    return "The browser could not reserve enough memory for this guest.";
  }
  if (message.includes("SharedArrayBuffer")) {
    return "WebAssembly threads are unavailable in this browser context.";
  }
  return message.split("\n")[0];
}

function fail(error) {
  if (ignoreRuntimeErrors) {
    return;
  }
  const message = friendlyError(error);
  state = "error";
  setControls(state);
  setStatus("Startup failed", "error");
  terminal.writeln(`\r\n\x1b[31m[error] ${message}\x1b[0m`);
  terminal.writeln("Reload the page and try the one-hart setting.");
  console.error(error);
}

async function loadRuntime() {
  const assets = [
    manifest.runtime.module,
    manifest.runtime.wasm,
    manifest.runtime.worker,
    manifest.guest.firmware,
    manifest.guest.kernel,
    manifest.guest.root,
  ];
  const total = assets.reduce((sum, asset) => sum + asset.size, 0);
  let loaded = 0;
  const progress = (operation, increment) => {
    loaded += increment;
    const percent = Math.min(100, Math.floor((loaded * 100) / total));
    setStatus(`${operation} ${percent}%`, "waiting");
  };

  setStage("download");
  await pruneAssetCache(assets);
  const images = {};
  for (const asset of assets) {
    const keep = asset === manifest.guest.firmware
      || asset === manifest.guest.kernel
      || asset === manifest.guest.root;
    const bytes = await fetchVerified(asset, progress, keep);
    if (asset === manifest.guest.firmware) {
      images.firmware = bytes;
    } else if (asset === manifest.guest.kernel) {
      images.kernel = bytes;
    } else if (asset === manifest.guest.root) {
      images.root = bytes;
    }
  }

  setStage("verify");
  setStatus("Assets verified", "waiting");
  if (manifest.guest.commit.length !== 40
      || manifest.runtime.commit.length !== 40) {
    throw new Error("manifest contains an invalid source commit");
  }
  return images;
}

async function launch() {
  if (state === "stopped") {
    sessionStorage.setItem(autoStartKey, "true");
    location.reload();
    return;
  }
  if (state !== "ready") {
    return;
  }

  state = "launching";
  setControls(state);
  terminal.reset();
  terminal.writeln("\x1b[38;5;114mPreparing the local RISC-V VM…\x1b[0m");

  try {
    const images = await loadRuntime();
    setStatus("Creating clean VM", "waiting");
    const moduleUrl = absoluteAsset(manifest.runtime.module).href;
    const { default: initQemu } = await import(moduleUrl);
    const { master, slave } = openpty();
    ptyMaster = master;
    terminal.loadAddon(master);
    observeUart(master);

    const moduleOptions = {
      arguments: qemuArguments(Number(cpuSelect.value)),
      mainScriptUrlOrBlob: moduleUrl,
      onAbort: (reason) => fail(new Error(String(reason))),
      pty: slave,
      preRun: [() => {
        moduleOptions.FS.mkdir("/pack");
        moduleOptions.FS.writeFile("/pack/opensbi.bin", images.firmware);
        moduleOptions.FS.writeFile("/pack/kernel", images.kernel);
        moduleOptions.FS.writeFile("/pack/root.ext4", images.root);
        images.firmware = null;
        images.kernel = null;
        images.root = null;
      }],
    };

    runtime = await initQemu(moduleOptions);
    const originalPoll = runtime.TTY.stream_ops.poll;
    runtime.TTY.stream_ops.poll = function poll(stream, timeout) {
      if (!slave.readable) {
        return (slave.readable ? 1 : 0) | (slave.writable ? 4 : 0);
      }
      return originalPoll.call(stream, timeout);
    };
  } catch (error) {
    fail(error);
  }
}

function stop() {
  if (state !== "launching" && state !== "running") {
    return;
  }
  ignoreRuntimeErrors = true;
  try {
    runtime?.PThread?.terminateAllThreads();
    ptyMaster?.dispose();
  } catch (error) {
    console.debug("QEMU shutdown", error);
  }
  runtime = null;
  ptyMaster = null;
  state = "stopped";
  setControls(state);
  setStatus("Stopped", "");
  terminal.writeln("\r\n\x1b[90m[guest stopped; Restart creates a clean VM]\x1b[0m");
}

function reset() {
  sessionStorage.setItem(autoStartKey, "true");
  location.reload();
}

async function prepare() {
  setControls(state);
  terminal.writeln("Caffeinix browser console");

  if (!window.crossOriginIsolated) {
    setStatus("Enabling browser isolation", "waiting");
    terminal.writeln("Enabling WebAssembly threads; this page will reload once.");
    if (!navigator.serviceWorker) {
      fail(new Error("service workers are unavailable"));
    }
    return;
  }

  const missing = checkBrowser();
  if (missing.length > 0) {
    fail(new Error(`browser support missing: ${missing.join(", ")}`));
    return;
  }

  try {
    const response = await fetch(manifestUrl, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`manifest download failed (${response.status})`);
    }
    manifest = await response.json();
    assetCache = await caches.open(assetCacheName);
    const commit = manifest.guest.commit.slice(0, 12);
    versionLabel.textContent =
      `Caffeinix ${commit} · OpenSBI ${manifest.opensbi.version}`
      + ` · musl ${manifest.musl.version}`
      + ` · BusyBox ${manifest.busybox.version}`;
    state = "ready";
    setControls(state);
    setStatus("Ready to start", "");
    terminal.writeln("Press Start to boot. Downloads are cached by your browser.");
    if (sessionStorage.getItem(autoStartKey) === "true") {
      sessionStorage.removeItem(autoStartKey);
      await launch();
    }
  } catch (error) {
    fail(error);
  }
}

startButton.addEventListener("click", launch);
stopButton.addEventListener("click", stop);
resetButton.addEventListener("click", reset);
window.addEventListener("resize", () => fitAddon.fit());
window.addEventListener("beforeunload", () => {
  ignoreRuntimeErrors = true;
  runtime?.PThread?.terminateAllThreads();
});
window.addEventListener("error", (event) => {
  if (state === "launching" || state === "running") {
    fail(event.error || event.message);
  }
});

window.caffeinixDemo = {
  get manifest() {
    return manifest;
  },
  get state() {
    return state;
  },
  launch,
  stop,
  terminal,
  terminalText,
};

prepare();
