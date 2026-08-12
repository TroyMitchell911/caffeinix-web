/* SPDX-License-Identifier: GPL-3.0-only */

import { readFile, writeFile } from "node:fs/promises";

export async function readEnvironment(path) {
  const result = {};
  const input = await readFile(path, "utf8");
  for (const [index, raw] of input.split("\n").entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) {
      throw new Error(`${path}:${index + 1}: invalid assignment`);
    }
    if (Object.hasOwn(result, match[1])) {
      throw new Error(`${path}:${index + 1}: duplicate ${match[1]}`);
    }
    result[match[1]] = match[2];
  }
  return result;
}

export async function updateEnvironment(path, key, value) {
  const input = await readFile(path, "utf8");
  let found = false;
  const lines = input.split("\n").map((line) => {
    if (line.startsWith(`${key}=`)) {
      if (found) {
        throw new Error(`${path}: duplicate ${key}`);
      }
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) {
    throw new Error(`${path}: missing ${key}`);
  }
  await writeFile(path, lines.join("\n"));
}

export function requireKeys(values, keys, source) {
  for (const key of keys) {
    if (!values[key]) {
      throw new Error(`${source}: missing ${key}`);
    }
  }
}

export function parseGitHubRepository(repository) {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/.exec(
    repository,
  );
  if (!match) {
    throw new Error(`unsupported GitHub repository URL: ${repository}`);
  }
  return `${match[1]}/${match[2]}`;
}
