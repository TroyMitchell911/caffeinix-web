/* SPDX-License-Identifier: GPL-3.0-only */

import assert from "node:assert/strict";
import test from "node:test";

import {
  allChecksPassed,
  assertProductionPolicy,
  inspectRequiredChecks,
  resolveBranchHead,
} from "../../lib/upstream.mjs";

const commit = "1".repeat(40);
const required = ["Kernel build", "QEMU runtime"];

function check(id, name, status = "completed", conclusion = "success") {
  return {
    id,
    name,
    status,
    conclusion,
    head_sha: commit,
    app: { slug: "github-actions" },
  };
}

test("both latest authoritative checks must succeed", () => {
  const result = inspectRequiredChecks([
    check(1, "Kernel build"),
    check(2, "QEMU runtime"),
  ], required, commit);
  assert.equal(allChecksPassed(result), true);
});

test("a later failed rerun supersedes an earlier success", () => {
  const result = inspectRequiredChecks([
    check(1, "Kernel build"),
    check(2, "Kernel build", "completed", "failure"),
    check(3, "QEMU runtime"),
  ], required, commit);
  assert.equal(allChecksPassed(result), false);
  assert.equal(result["Kernel build"].conclusion, "failure");
});

test("foreign and running checks cannot promote a guest", () => {
  const foreign = check(1, "Kernel build");
  foreign.app.slug = "foreign-ci";
  const result = inspectRequiredChecks([
    foreign,
    check(2, "QEMU runtime", "in_progress", null),
  ], required, commit);
  assert.equal(allChecksPassed(result), false);
});

test("branch resolution rejects malformed commit IDs", async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ sha: "short" }),
  });
  await assert.rejects(resolveBranchHead({
    branch: "main",
    fetchImpl,
    repository: "https://github.com/owner/project.git",
  }), /invalid branch commit/);
});

test("production source must match the allowlist", () => {
  assert.throws(() => assertProductionPolicy({
    CAFFEINIX_BRANCH: "main",
    CAFFEINIX_REPOSITORY: "https://github.com/other/project.git",
  }, {
    branch: "main",
    repository: "https://github.com/owner/project.git",
    requiredChecks: required,
  }), /outside the production policy/);
});
