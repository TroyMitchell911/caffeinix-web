#!/usr/bin/env node
/* SPDX-License-Identifier: GPL-3.0-only */

import { appendFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertProductionPolicy,
  allChecksPassed,
  inspectRequiredChecks,
  readCheckRuns,
  resolveBranchHead,
} from "../lib/upstream.mjs";
import {
  readEnvironment,
  updateEnvironment,
} from "../lib/config.mjs";

const topdir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = resolve(topdir, "guest.lock");
const policyPath = resolve(topdir, "sync-policy.json");
const args = new Set(process.argv.slice(2));
const write = args.has("--write");
const checkCurrent = args.has("--check-current");
const recheck = args.has("--recheck");
const outputPath = process.env.GITHUB_OUTPUT;
const expectedIndex = process.argv.indexOf("--expect");
const expected = expectedIndex >= 0 ? process.argv[expectedIndex + 1] : null;

const lock = await readEnvironment(lockPath);
const policy = JSON.parse(await readFile(policyPath, "utf8"));
assertProductionPolicy(lock, policy);

if (expected && !/^[0-9a-f]{40}$/.test(expected)) {
  throw new Error("--expect requires a full commit ID");
}

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";
const head = await resolveBranchHead({
  branch: policy.branch,
  repository: policy.repository,
  token,
});

if (recheck) {
  if (!expected) {
    throw new Error("--recheck requires --expect");
  }
  if (head !== expected) {
    throw new Error(`upstream moved from ${expected} to ${head}`);
  }
  if (lock.CAFFEINIX_COMMIT !== expected) {
    throw new Error("guest.lock changed while the candidate was tested");
  }
}

const candidate = checkCurrent ? lock.CAFFEINIX_COMMIT : head;
const changed = candidate !== lock.CAFFEINIX_COMMIT;
if (!changed && !checkCurrent && !recheck) {
  const result = { candidate, changed: false, reason: "already-current" };
  console.log(JSON.stringify(result));
  if (outputPath) {
    await appendFile(outputPath, `candidate=${candidate}\nchanged=false\n`);
  }
  process.exit(0);
}

const checkRuns = await readCheckRuns({
  commit: candidate,
  repository: policy.repository,
  token,
});
const checks = inspectRequiredChecks(
  checkRuns,
  policy.requiredChecks,
  candidate,
);
if (!allChecksPassed(checks)) {
  const result = {
    candidate,
    changed: false,
    checks,
    reason: "required-checks-not-successful",
  };
  console.log(JSON.stringify(result, null, 2));
  if (recheck || checkCurrent) {
    process.exitCode = 1;
  }
  if (outputPath) {
    await appendFile(outputPath, `candidate=${candidate}\nchanged=false\n`);
  }
  process.exit();
}

if (write && changed) {
  await updateEnvironment(lockPath, "CAFFEINIX_COMMIT", candidate);
}
if (outputPath) {
  await appendFile(
    outputPath,
    `candidate=${candidate}\nchanged=${changed ? "true" : "false"}\n`,
  );
}
console.log(JSON.stringify({ candidate, changed, checks, reason: "ready" }, null, 2));
