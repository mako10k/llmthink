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

      const before = await page.evaluate(() => {
        const card = document.querySelector(".diagram-card");
        const viewport = document.querySelector(".diagram-viewport");
        const scroll = document.querySelector(".diagram-scroll");
        const svg = document.querySelector(".diagram");
        if (!(card instanceof HTMLElement) || !(viewport instanceof HTMLElement) || !(scroll instanceof HTMLElement)) {
          throw new Error("diagram-scroll not found");
        }
        if (!(svg instanceof SVGElement)) {
          throw new Error("diagram svg not found");
        }
        const scrollRect = scroll.getBoundingClientRect();
        const svgRect = svg.getBoundingClientRect();
        const baseWidth = Number(scroll.dataset.baseWidth || 0);
        const baseHeight = Number(scroll.dataset.baseHeight || 0);
        const svgOffsetX = svgRect.left - scrollRect.left + scroll.scrollLeft;
        const svgOffsetY = svgRect.top - scrollRect.top + scroll.scrollTop;
        const visibleCenterX = scroll.scrollLeft + scroll.clientWidth / 2;
        const visibleCenterY = scroll.scrollTop + scroll.clientHeight / 2;
        const logicalScaleX = baseWidth > 0 ? baseWidth / svgRect.width : 1;
        const logicalScaleY = baseHeight > 0 ? baseHeight / svgRect.height : 1;
        return {
          documentWidth: document.documentElement.scrollWidth,
          viewportLeft: viewport.getBoundingClientRect().left,
          cardLeft: card.getBoundingClientRect().left,
          scrollLeft: scroll.scrollLeft,
          scrollTop: scroll.scrollTop,
          clientWidth: scroll.clientWidth,
          clientHeight: scroll.clientHeight,
          scrollWidth: scroll.scrollWidth,
          scrollHeight: scroll.scrollHeight,
          svgAnchorX: (visibleCenterX - svgOffsetX) * logicalScaleX,
          svgAnchorY: (visibleCenterY - svgOffsetY) * logicalScaleY,
        };
      });

      await page.click('.diagram-button[data-action="zoom-in"]');
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );

      const after = await page.evaluate(() => {
        const card = document.querySelector(".diagram-card");
        const viewport = document.querySelector(".diagram-viewport");
        const scroll = document.querySelector(".diagram-scroll");
        const zoomLabel = document.querySelector(".diagram-zoom-level");
        const svg = document.querySelector(".diagram");
        if (!(card instanceof HTMLElement) || !(viewport instanceof HTMLElement) || !(scroll instanceof HTMLElement) || !(zoomLabel instanceof HTMLOutputElement)) {
          throw new Error("preview controls not found");
        }
        if (!(svg instanceof SVGElement)) {
          throw new Error("diagram svg not found");
        }
        const scrollRect = scroll.getBoundingClientRect();
        const svgRect = svg.getBoundingClientRect();
        const baseWidth = Number(scroll.dataset.baseWidth || 0);
        const baseHeight = Number(scroll.dataset.baseHeight || 0);
        const svgOffsetX = svgRect.left - scrollRect.left + scroll.scrollLeft;
        const svgOffsetY = svgRect.top - scrollRect.top + scroll.scrollTop;
        const visibleCenterX = scroll.scrollLeft + scroll.clientWidth / 2;
        const visibleCenterY = scroll.scrollTop + scroll.clientHeight / 2;
        const logicalScaleX = baseWidth > 0 ? baseWidth / svgRect.width : 1;
        const logicalScaleY = baseHeight > 0 ? baseHeight / svgRect.height : 1;
        return {
          documentWidth: document.documentElement.scrollWidth,
          viewportLeft: viewport.getBoundingClientRect().left,
          cardLeft: card.getBoundingClientRect().left,
          scrollLeft: scroll.scrollLeft,
          scrollTop: scroll.scrollTop,
          clientWidth: scroll.clientWidth,
          clientHeight: scroll.clientHeight,
          scrollWidth: scroll.scrollWidth,
          scrollHeight: scroll.scrollHeight,
          zoomText: zoomLabel.textContent ?? "",
          svgAnchorX: (visibleCenterX - svgOffsetX) * logicalScaleX,
          svgAnchorY: (visibleCenterY - svgOffsetY) * logicalScaleY,
        };
      });

      assert.notEqual(after.zoomText, "100%");
      assert.ok(after.scrollWidth > before.scrollWidth);
  assert.equal(after.documentWidth, before.documentWidth);
  assert.ok(Math.abs(after.viewportLeft - before.viewportLeft) < 1);
  assert.ok(Math.abs(after.cardLeft - before.cardLeft) < 1);
      assert.ok(Math.abs(after.svgAnchorX - before.svgAnchorX) < 24);
    } finally {
      await browser.close();
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
