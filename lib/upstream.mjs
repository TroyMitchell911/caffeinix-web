/* SPDX-License-Identifier: GPL-3.0-only */

import { parseGitHubRepository } from "./config.mjs";

function headers(token) {
  const result = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "caffeinix-web-sync",
  };
  if (token) {
    result.Authorization = `Bearer ${token}`;
  }
  return result;
}

async function requestJson(fetchImpl, url, token) {
  const response = await fetchImpl(url, { headers: headers(token) });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${url}`);
  }
  return response.json();
}

export async function resolveBranchHead({
  branch,
  fetchImpl = fetch,
  repository,
  token,
}) {
  const slug = parseGitHubRepository(repository);
  const encodedBranch = encodeURIComponent(branch);
  const data = await requestJson(
    fetchImpl,
    `https://api.github.com/repos/${slug}/commits/${encodedBranch}`,
    token,
  );
  if (!/^[0-9a-f]{40}$/.test(data.sha || "")) {
    throw new Error("GitHub returned an invalid branch commit");
  }
  return data.sha;
}

export async function readCheckRuns({
  commit,
  fetchImpl = fetch,
  repository,
  token,
}) {
  const slug = parseGitHubRepository(repository);
  const data = await requestJson(
    fetchImpl,
    `https://api.github.com/repos/${slug}/commits/${commit}`
      + "/check-runs?per_page=100",
    token,
  );
  return data.check_runs || [];
}

export function inspectRequiredChecks(checkRuns, required, commit) {
  const result = {};
  for (const name of required) {
    const matches = checkRuns
      .filter((check) => check.name === name)
      .filter((check) => check.head_sha === commit)
      .filter((check) => check.app?.slug === "github-actions")
      .sort((left, right) => Number(right.id || 0) - Number(left.id || 0));
    const latest = matches[0];
    result[name] = {
      conclusion: latest?.conclusion || null,
      found: Boolean(latest),
      status: latest?.status || null,
      successful: latest?.status === "completed"
        && latest?.conclusion === "success",
    };
  }
  return result;
}

export function allChecksPassed(result) {
  return Object.values(result).every((check) => check.successful);
}

export function assertProductionPolicy(lock, policy) {
  if (lock.CAFFEINIX_REPOSITORY !== policy.repository) {
    throw new Error("guest.lock repository is outside the production policy");
  }
  if (lock.CAFFEINIX_BRANCH !== policy.branch) {
    throw new Error("guest.lock branch is outside the production policy");
  }
  if (!Array.isArray(policy.requiredChecks)
      || policy.requiredChecks.length === 0) {
    throw new Error("production policy has no required checks");
  }
}
