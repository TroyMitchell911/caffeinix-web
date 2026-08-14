/* SPDX-License-Identifier: GPL-3.0-only */

import { expect, test } from "@playwright/test";

async function waitForState(page, expected, timeout = 150_000) {
  await page.waitForFunction(
    (state) => window.caffeinixDemo?.state === state,
    expected,
    { timeout },
  );
}

async function text(page) {
  return page.evaluate(() => window.caffeinixDemo.terminalText());
}

async function command(page, input, marker) {
  const terminalInput = page.locator(".xterm-helper-textarea");
  await terminalInput.pressSequentially(input, { delay: 2 });
  await terminalInput.press("Enter");
  await page.waitForFunction((value) => {
    const output = window.caffeinixDemo.terminalText();
    return output.split(value).length - 1 >= 2;
  }, marker, { timeout: 30_000 });
}

test("boots an interactive, responsive Caffeinix guest", async ({
  page,
}, testInfo) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.addInitScript(() => {
    window.__caffeinixStatusHistory = [];
    window.addEventListener("DOMContentLoaded", () => {
      const status = document.querySelector("#status");
      const record = () => window.__caffeinixStatusHistory.push(
        status?.textContent || "",
      );
      record();
      new MutationObserver(record).observe(status, {
        childList: true,
        subtree: true,
      });
    });
  });

  await page.goto("./", { waitUntil: "domcontentloaded" });
  await expect(page.locator("h1")).toContainText("Caffeinix");
  await expect.poll(() => page.evaluate(() => crossOriginIsolated)).toBe(true);
  await waitForState(page, "ready", 30_000);

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  const mobile = testInfo.project.name === "mobile-chromium";
  await page.locator("#cpu-select").selectOption(mobile ? "1" : "2");
  await page.locator("#start").click();
  await waitForState(page, "running");
  await expect(page.locator("#status")).toHaveText("Shell ready");
  const initialStatuses = await page.evaluate(() =>
    window.__caffeinixStatusHistory,
  );
  expect(initialStatuses.some((status) => status.startsWith("Downloading ")))
    .toBe(true);
  expect(initialStatuses.some((status) => status.startsWith("Verifying ")))
    .toBe(true);
  expect(initialStatuses).toContain("Creating clean VM");

  const bootLog = await text(page);
  expect(bootLog).toMatch(/\[\s*\d+\.\d+\]\s+Caffeinix RISC-V\b/);
  expect(bootLog).toContain("BusyBox v1.38.0");
  expect(bootLog).toContain("CPU: logical=0");
  if (!mobile) {
    expect(bootLog).toContain("CPU: logical=1");
  }

  const projectMarker = testInfo.project.name.replaceAll("-", "_").toUpperCase();
  await command(page, `echo ${projectMarker}_UART_OK`, `${projectMarker}_UART_OK`);

  if (testInfo.project.name === "desktop-chromium") {
    await command(
      page,
      "mkdir /tmp/webtest; echo browser > /tmp/webtest/source; "
        + "cp /tmp/webtest/source /tmp/webtest/copy; "
        + "cat /tmp/webtest/copy; rm -r /tmp/webtest; echo WEB_FS_OK",
      "WEB_FS_OK",
    );
    expect(await text(page)).toContain("browser");
    await command(page, "touch /tmp/session-marker; echo SESSION_MARKED", "SESSION_MARKED");
  }

  await testInfo.attach("booted-console", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  expect(pageErrors).toEqual([]);

  if (testInfo.project.name === "desktop-chromium") {
    await Promise.all([
      page.waitForEvent("framenavigated"),
      page.locator("#reset").click(),
    ]);
    await waitForState(page, "running");
    const resetStatuses = await page.evaluate(() =>
      window.__caffeinixStatusHistory,
    );
    expect(resetStatuses.some((status) => status.startsWith("Reading ")))
      .toBe(true);
    expect(resetStatuses.some((status) => status.startsWith("Downloading ")))
      .toBe(false);
    expect(resetStatuses.some((status) => status.startsWith("Verifying ")))
      .toBe(false);
    expect(resetStatuses).toContain("Creating clean VM");
    await command(
      page,
      "if [ ! -e /tmp/session-marker ]; then echo RESET_IS_CLEAN; fi",
      "RESET_IS_CLEAN",
    );
  }

  await page.locator("#stop").click();
  await waitForState(page, "stopped", 10_000);
  await expect(page.locator("#status")).toHaveText("Stopped");
});
