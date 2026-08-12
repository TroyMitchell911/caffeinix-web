#!/usr/bin/env node
/* SPDX-License-Identifier: GPL-3.0-only */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { updateEnvironment } from "../lib/config.mjs";

const commit = process.argv[2];
if (!/^[0-9a-f]{40}$/.test(commit || "")) {
  throw new Error("candidate must be a full hexadecimal commit ID");
}
const topdir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await updateEnvironment(resolve(topdir, "guest.lock"), "CAFFEINIX_COMMIT", commit);
