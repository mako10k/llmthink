import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { chromium } from "playwright";

test("preview:html defaults to fit and keeps the outer map area stable on zoom", async () => {
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
    assert.doesNotMatch(html, /diagram-minimap-title/);
    assert.doesNotMatch(html, /diagram-zoom-level/);

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

      assert.ok(before.scrollWidth <= before.clientWidth + 2);
      assert.ok(before.scrollHeight <= before.clientHeight + 2);

      await page.click('.diagram-button[data-action="zoom-in"]');
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );

      const after = await page.evaluate(() => {
        const card = document.querySelector(".diagram-card");
        const viewport = document.querySelector(".diagram-viewport");
        const scroll = document.querySelector(".diagram-scroll");
        const svg = document.querySelector(".diagram");
        if (!(card instanceof HTMLElement) || !(viewport instanceof HTMLElement) || !(scroll instanceof HTMLElement)) {
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
          svgAnchorX: (visibleCenterX - svgOffsetX) * logicalScaleX,
          svgAnchorY: (visibleCenterY - svgOffsetY) * logicalScaleY,
        };
      });

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

test("preview:html renders problem references as problem nodes instead of unresolved refs", async () => {
  const repoRoot = resolve("/home/mako10k/llmthink");
  const tempDir = mkdtempSync(join(tmpdir(), "llmthink-preview-problem-"));
  const outputPath = join(tempDir, "preview.html");

  try {
    execFileSync(
      "npm",
      [
        "run",
        "preview:html",
        "--",
        "docs/process/license-model-review.dsl",
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
    assert.match(html, /node-problem/);
    assert.match(html, /問題/);
    assert.match(html, /node-problem rect \{[\s\S]*vscode-charts-red/);
    assert.doesNotMatch(html, /P4:[^\n]*参照先が未定義です/);

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      await page.goto(`file://${outputPath}`);
      await page.waitForSelector('.node-problem[data-node-key="P4"]');

      const metrics = await page.evaluate(() => {
        const problemNode = document.querySelector('.node-problem[data-node-key="P4"]');
        const unresolvedNode = document.querySelector('.node-external[data-node-key="P4"]');
        return {
          hasProblemNode: problemNode instanceof SVGGElement,
          hasUnresolvedNode: unresolvedNode instanceof SVGGElement,
        };
      });

      assert.equal(metrics.hasProblemNode, true);
      assert.equal(metrics.hasUnresolvedNode, false);
    } finally {
      await browser.close();
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("preview:html marks intentional orphan nodes with a weak visual class", async () => {
  const repoRoot = resolve("/home/mako10k/llmthink");
  const tempDir = mkdtempSync(join(tmpdir(), "llmthink-preview-orphan-"));
  const inputPath = join(tempDir, "intentional-orphan.dsl");
  const outputPath = join(tempDir, "preview.html");

  writeFileSync(
    inputPath,
    [
      "problem P1:",
      '  "future backlog problem"',
      "  annotation orphan_future:",
      '    "connect later"',
      "",
      "step:",
      "  evidence EV1:",
      '    "reference note"',
      "    annotation orphan_reference:",
      '      "context only"',
      "",
      "step:",
      "  decision D1 based_on P1:",
      '    "keep one connected decision"',
      "",
    ].join("\n"),
    "utf8",
  );

  try {
    execFileSync(
      "npm",
      [
        "run",
        "preview:html",
        "--",
        inputPath,
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
    assert.match(html, /node-intentional-orphan/);
    assert.match(html, /minimap-node-intentional-orphan/);
    assert.match(html, /stroke-dasharray: 7 5/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
