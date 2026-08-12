/* SPDX-License-Identifier: GPL-3.0-only */

import { defineConfig, devices } from "@playwright/test";

const localUrl = "http://127.0.0.1:4173/caffeinix-web/";
const baseURL = process.env.BASE_URL || localUrl;
const webServer = process.env.BASE_URL
  ? undefined
  : {
      command: "node scripts/serve.mjs --root dist"
        + " --base /caffeinix-web/ --port 4173",
      url: localUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    };

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "line",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer,
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 950 },
      },
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 7"],
      },
    },
    {
      name: "desktop-firefox",
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 1366, height: 850 },
      },
    },
  ],
});
