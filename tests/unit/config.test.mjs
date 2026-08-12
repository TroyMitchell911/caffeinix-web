/* SPDX-License-Identifier: GPL-3.0-only */

import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  parseGitHubRepository,
  readEnvironment,
  updateEnvironment,
} from "../../lib/config.mjs";

test("environment locks reject duplicate keys", async () => {
  const directory = await mkdtemp(join(tmpdir(), "caffeinix-lock-"));
  const path = join(directory, "test.lock");
  await writeFile(path, "KEY=one\nKEY=two\n");
  await assert.rejects(readEnvironment(path), /duplicate KEY/);
});

test("environment locks update one exact key", async () => {
  const directory = await mkdtemp(join(tmpdir(), "caffeinix-lock-"));
  const path = join(directory, "test.lock");
  await writeFile(path, "FIRST=one\nSECOND=two\n");
  await updateEnvironment(path, "SECOND", "changed");
  assert.equal(await readFile(path, "utf8"), "FIRST=one\nSECOND=changed\n");
});

test("GitHub repository parser accepts only canonical HTTPS URLs", () => {
  assert.equal(
    parseGitHubRepository("https://github.com/owner/project.git"),
    "owner/project",
  );
  assert.throws(() => parseGitHubRepository("git@example.com:owner/repo"));
});
