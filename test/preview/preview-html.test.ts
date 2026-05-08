import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { chromium } from "playwright";

test("preview:html emits browser-openable HTML and preserves viewport anchor on zoom", async () => {
  const repoRoot = resolve("/home/mako10k/llmthink");
  const tempDir = mkdtempSync(join(tmpdir(), "llmthink-preview-"));
  const outputPath = join(tempDir, "preview.html");

  try {
    execFileSync(
      "npm",
      [
        "run",
        "preview:html",
        "--",
        "docs/process/help-navigation-design.dsl",
        "--out",
        outputPath,
        "--locale",
        "ja",
      ],
      {
        cwd: repoRoot,
        stdio: "pipe",
      },
    );

    const html = readFileSync(outputPath, "utf8");
    assert.match(html, /ステップマップ/);
    assert.match(html, /diagram-scroll/);

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      await page.goto(`file://${outputPath}`);
      await page.waitForSelector(".diagram-scroll");

      await page.click('.diagram-button[data-action="zoom-in"]');

      await page.evaluate(() => {
        const scroll = document.querySelector(".diagram-scroll");
        if (!(scroll instanceof HTMLElement)) {
          throw new Error("diagram-scroll not found");
        }
        scroll.scrollLeft = 180;
      });

      const before = await page.evaluate(() => {
        const scroll = document.querySelector(".diagram-scroll");
        if (!(scroll instanceof HTMLElement)) {
          throw new Error("diagram-scroll not found");
        }
        return {
          scrollLeft: scroll.scrollLeft,
          scrollTop: scroll.scrollTop,
          clientWidth: scroll.clientWidth,
          clientHeight: scroll.clientHeight,
          scrollWidth: scroll.scrollWidth,
          scrollHeight: scroll.scrollHeight,
        };
      });

      assert.ok(before.scrollWidth > before.clientWidth);

      await page.click('.diagram-button[data-action="zoom-in"]');

      const after = await page.evaluate(() => {
        const scroll = document.querySelector(".diagram-scroll");
        const zoomLabel = document.querySelector(".diagram-zoom-level");
        if (!(scroll instanceof HTMLElement) || !(zoomLabel instanceof HTMLOutputElement)) {
          throw new Error("preview controls not found");
        }
        return {
          scrollLeft: scroll.scrollLeft,
          scrollTop: scroll.scrollTop,
          clientWidth: scroll.clientWidth,
          clientHeight: scroll.clientHeight,
          scrollWidth: scroll.scrollWidth,
          scrollHeight: scroll.scrollHeight,
          zoomText: zoomLabel.textContent ?? "",
        };
      });

      assert.notEqual(after.zoomText, "100%");
      assert.ok(after.scrollWidth > before.scrollWidth);

      const beforeCenterX = before.scrollLeft + before.clientWidth / 2;
      const scaleX = after.scrollWidth / before.scrollWidth;
      const expectedCenterX = beforeCenterX * scaleX;
      const actualCenterX = after.scrollLeft + after.clientWidth / 2;

      assert.ok(Math.abs(actualCenterX - expectedCenterX) < 48);
    } finally {
      await browser.close();
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
