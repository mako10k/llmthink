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

test("preview:html keeps cards aligned, hides scrollbars, and applies control opacity", async () => {
  const repoRoot = resolve("/home/mako10k/llmthink");
  const tempDir = mkdtempSync(join(tmpdir(), "llmthink-preview-layout-"));
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

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      await page.goto(`file://${outputPath}`);
      await page.waitForSelector(".diagram-scroll");

      const readMetrics = async () => page.evaluate(() => {
        const hero = document.querySelector(".hero");
        const card = document.querySelector(".diagram-card");
        const markdown = document.querySelector(".markdown");
        const viewport = document.querySelector(".diagram-viewport");
        const controls = document.querySelector(".diagram-controls-overlay");
        const minimap = document.querySelector(".diagram-minimap-card");
        const scroll = document.querySelector(".diagram-scroll");
        const zoomIn = document.querySelector('.diagram-button[data-action="zoom-in"]');
        if (!(hero instanceof HTMLElement) || !(card instanceof HTMLElement) || !(markdown instanceof HTMLElement)) {
          throw new Error("preview cards not found");
        }
        if (!(viewport instanceof HTMLElement) || !(controls instanceof HTMLElement) || !(minimap instanceof HTMLElement)) {
          throw new Error("preview controls not found");
        }
        if (!(scroll instanceof HTMLElement) || !(zoomIn instanceof HTMLElement)) {
          throw new Error("preview scroll or zoom button not found");
        }

        const heroRect = hero.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const markdownRect = markdown.getBoundingClientRect();
        const viewportRect = viewport.getBoundingClientRect();

        return {
          heroLeft: heroRect.left,
          cardLeft: cardRect.left,
          markdownLeft: markdownRect.left,
          heroWidth: heroRect.width,
          cardWidth: cardRect.width,
          markdownWidth: markdownRect.width,
          viewportWidth: viewportRect.width,
          controlsOpacity: Number(getComputedStyle(controls).opacity),
          minimapOpacity: Number(getComputedStyle(minimap).opacity),
          scrollClientWidth: scroll.clientWidth,
          scrollOffsetWidth: scroll.offsetWidth,
          scrollClientHeight: scroll.clientHeight,
          scrollOffsetHeight: scroll.offsetHeight,
        };
      });

      const initial = await readMetrics();
      assert.ok(Math.abs(initial.heroLeft - initial.cardLeft) < 1);
      assert.ok(Math.abs(initial.cardLeft - initial.markdownLeft) < 1);
      assert.ok(Math.abs(initial.heroWidth - initial.cardWidth) < 1);
      assert.ok(Math.abs(initial.cardWidth - initial.markdownWidth) < 1);
      assert.ok(Math.abs(initial.viewportWidth - (initial.cardWidth - 36)) < 2);
      assert.ok(Math.abs(initial.controlsOpacity - 0.5) < 0.01);
      assert.ok(Math.abs(initial.minimapOpacity - 0.5) < 0.01);

      await page.hover(".diagram-viewport");
      await page.waitForTimeout(180);
      const controlsHoverOpacity = await page.evaluate(() => {
        const controls = document.querySelector(".diagram-controls-overlay");
        if (!(controls instanceof HTMLElement)) {
          throw new Error("controls not found");
        }
        return Number(getComputedStyle(controls).opacity);
      });
      assert.ok(Math.abs(controlsHoverOpacity - 0.75) < 0.01);

      await page.hover(".diagram-minimap-card");
      await page.waitForTimeout(180);
      const minimapHoverOpacity = await page.evaluate(() => {
        const minimap = document.querySelector(".diagram-minimap-card");
        if (!(minimap instanceof HTMLElement)) {
          throw new Error("minimap not found");
        }
        return Number(getComputedStyle(minimap).opacity);
      });
      assert.ok(Math.abs(minimapHoverOpacity - 0.75) < 0.01);

      await page.click('.diagram-button[data-action="zoom-in"]');
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );

      const zoomed = await readMetrics();
      assert.ok(zoomed.scrollOffsetWidth - zoomed.scrollClientWidth < 2);
      assert.ok(zoomed.scrollOffsetHeight - zoomed.scrollClientHeight < 2);

      await page.setViewportSize({ width: 980, height: 1000 });
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );

      const narrow = await readMetrics();
      assert.ok(Math.abs(narrow.heroLeft - narrow.cardLeft) < 1);
      assert.ok(Math.abs(narrow.cardLeft - narrow.markdownLeft) < 1);
      assert.ok(Math.abs(narrow.heroWidth - narrow.cardWidth) < 1);
      assert.ok(Math.abs(narrow.cardWidth - narrow.markdownWidth) < 1);
      assert.ok(Math.abs(narrow.viewportWidth - (narrow.cardWidth - 36)) < 2);
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

test("preview:html renders comparison statements and comparison section", async () => {
  const repoRoot = resolve("/home/mako10k/llmthink");
  const tempDir = mkdtempSync(join(tmpdir(), "llmthink-preview-comparison-"));
  const inputPath = join(tempDir, "comparison.dsl");
  const outputPath = join(tempDir, "preview.html");

  writeFileSync(
    inputPath,
    [
      "problem P1:",
      '  "Compare decisions"',
      "",
      "step:",
      "  viewpoint VP1:",
      "    axis cost",
      "",
      "step:",
      "  decision D1 based_on P1, VP1:",
      '    "Option A"',
      "    annotation status:",
      '      "rejected"',
      "",
      "step:",
      "  decision D2 based_on P1, VP1:",
      '    "Option B"',
      "",
      "step:",
      "  comparison CMP1 on P1 viewpoint VP1 relation counterexample_to D2, D1:",
      '    "Option B breaks a premise of A"',
      "",
    ].join("\n"),
    "utf8",
  );

  try {
    execFileSync(
      "npm",
      ["run", "preview:html", "--", inputPath, "--out", outputPath, "--locale", "ja"],
      { cwd: repoRoot, stdio: "pipe" },
    );

    const html = readFileSync(outputPath, "utf8");
    assert.match(html, /node-comparison/);
    assert.match(html, /Comparisons/);
    assert.match(html, /counterexample_to D2, D1/);
    assert.match(html, /node-status-badge status-rejected/);
    assert.match(html, /data-status="rejected"/);

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      await page.goto(`file://${outputPath}`);
      await page.locator('.node-comparison[data-comparison-id="CMP1"]').dispatchEvent("pointerenter");

      const hoverMetrics = await page.evaluate(() => {
        const link = document.querySelector('.comparison-link[data-comparison-id="CMP1"]');
        const left = document.querySelector('.node[data-node-key="D2"]');
        const right = document.querySelector('.node[data-node-key="D1"]');
        const rightBadge = right?.querySelector('.node-status-badge');
        const minimapRight = document.querySelector('.minimap-node[data-target-node="D1"]');
        return {
          linkActive: link?.classList.contains("comparison-link-active") ?? false,
          leftActive: left?.classList.contains("node-edge-active") ?? false,
          rightActive: right?.classList.contains("node-edge-active") ?? false,
          rightRejected: right?.classList.contains("status-rejected") ?? false,
          badgeText: rightBadge?.textContent?.trim() ?? "",
          minimapRejected: minimapRight?.classList.contains("status-rejected") ?? false,
        };
      });

      assert.equal(hoverMetrics.linkActive, true);
      assert.equal(hoverMetrics.leftActive, true);
      assert.equal(hoverMetrics.rightActive, true);
      assert.equal(hoverMetrics.rightRejected, true);
      assert.equal(hoverMetrics.badgeText, "rejected");
      assert.equal(hoverMetrics.minimapRejected, true);

      await page.locator('.node-comparison[data-comparison-id="CMP1"]').dispatchEvent("pointerleave");
      await page.waitForTimeout(650);

      const cleared = await page.evaluate(() => {
        const link = document.querySelector('.comparison-link[data-comparison-id="CMP1"]');
        return {
          linkActive: link?.classList.contains("comparison-link-active") ?? false,
        };
      });

      assert.equal(cleared.linkActive, false);
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

test("preview:html highlights edge endpoints on hover and fits them on edge double click", async () => {
  const repoRoot = resolve("/home/mako10k/llmthink");
  const tempDir = mkdtempSync(join(tmpdir(), "llmthink-preview-edge-"));
  const inputPath = join(tempDir, "edge-fit.dsl");
  const outputPath = join(tempDir, "preview.html");

  writeFileSync(
    inputPath,
    [
      "problem P1:",
      '  "Choose a path"',
      "",
      "step:",
      "  premise PR1:",
      '    "Constraint one"',
      "",
      "step:",
      "  evidence EV1:",
      '    "Constraint two"',
      "",
      "step:",
      "  decision D1 based_on P1, PR1, EV1:",
      '    "Pick a direction"',
      "",
    ].join("\n"),
    "utf8",
  );

  try {
    execFileSync(
      "npm",
      ["run", "preview:html", "--", inputPath, "--out", outputPath, "--locale", "ja"],
      { cwd: repoRoot, stdio: "pipe" },
    );

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      await page.goto(`file://${outputPath}`);
      await page.waitForSelector('.edge-hit[data-edge-from="PR1"][data-edge-to="D1"]');

      const initialSvgWidth = await page.evaluate(() => {
        const svg = document.querySelector('.diagram');
        if (!(svg instanceof SVGSVGElement)) {
          throw new Error('diagram svg not found');
        }
        return svg.getBoundingClientRect().width;
      });

      await page.locator('.edge-hit[data-edge-from="PR1"][data-edge-to="D1"]').dispatchEvent("pointerenter");

      const hovered = await page.evaluate(() => {
        const edge = document.querySelector('.edge[data-edge-from="PR1"][data-edge-to="D1"]');
        const source = document.querySelector('.node[data-node-key="PR1"]');
        const target = document.querySelector('.node[data-node-key="D1"]');
        return {
          edgeActive: edge?.classList.contains("edge-active") ?? false,
          sourceActive: source?.classList.contains("node-edge-active") ?? false,
          targetActive: target?.classList.contains("node-edge-active") ?? false,
        };
      });

      assert.equal(hovered.edgeActive, true);
      assert.equal(hovered.sourceActive, true);
      assert.equal(hovered.targetActive, true);

      await page.locator('.diagram-scroll .edge[data-edge-from="PR1"][data-edge-to="D1"]').dispatchEvent("dblclick", {
        bubbles: true,
      });
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );

      const fitMetrics = await page.evaluate(() => {
        const scroll = document.querySelector('.diagram-scroll');
        const svg = document.querySelector('.diagram');
        const source = document.querySelector('.node[data-node-key="PR1"]');
        const target = document.querySelector('.node[data-node-key="D1"]');
        if (!(scroll instanceof HTMLElement) || !(svg instanceof SVGSVGElement) || !(source instanceof SVGGElement) || !(target instanceof SVGGElement)) {
          throw new Error("edge fit elements not found");
        }
        const scrollRect = scroll.getBoundingClientRect();
        const svgRect = svg.getBoundingClientRect();
        const sourceRect = source.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        return {
          svgWidth: svgRect.width,
          sourceWithin:
            sourceRect.left >= scrollRect.left - 2 &&
            sourceRect.right <= scrollRect.right + 2 &&
            sourceRect.top >= scrollRect.top - 2 &&
            sourceRect.bottom <= scrollRect.bottom + 2,
          targetWithin:
            targetRect.left >= scrollRect.left - 2 &&
            targetRect.right <= scrollRect.right + 2 &&
            targetRect.top >= scrollRect.top - 2 &&
            targetRect.bottom <= scrollRect.bottom + 2,
          fillsWholeWidth: svgRect.width - scrollRect.width < 2,
        };
      });

      assert.equal(fitMetrics.sourceWithin, true);
      assert.equal(fitMetrics.targetWithin, true);
      assert.equal(fitMetrics.fillsWholeWidth, false);
      assert.equal(fitMetrics.svgWidth > initialSvgWidth + 8, true);

      await page.locator('.edge-hit[data-edge-from="PR1"][data-edge-to="D1"]').dispatchEvent("pointerleave");
      await page.locator('.diagram-scroll').dispatchEvent("dblclick", { bubbles: true });
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );

      const graceMetrics = await page.evaluate(() => {
        const scroll = document.querySelector('.diagram-scroll');
        const svg = document.querySelector('.diagram');
        const activeEdge = document.querySelector('.edge.edge-active');
        if (!(scroll instanceof HTMLElement) || !(svg instanceof SVGSVGElement)) {
          throw new Error("grace fit elements not found");
        }
        const scrollRect = scroll.getBoundingClientRect();
        const svgRect = svg.getBoundingClientRect();
        return {
          hasActiveEdge: activeEdge instanceof SVGPathElement,
          fillsWholeWidth: svgRect.width - scrollRect.width < 2,
        };
      });

      assert.equal(graceMetrics.hasActiveEdge, true);
      assert.equal(graceMetrics.fillsWholeWidth, false);

      await page.waitForTimeout(650);
      await page.locator('.diagram-scroll').dispatchEvent("dblclick", { bubbles: true });
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );

      const fallbackMetrics = await page.evaluate(() => {
        const scroll = document.querySelector('.diagram-scroll');
        const svg = document.querySelector('.diagram');
        const activeEdge = document.querySelector('.edge.edge-active');
        if (!(scroll instanceof HTMLElement) || !(svg instanceof SVGSVGElement)) {
          throw new Error("fallback fit elements not found");
        }
        const scrollRect = scroll.getBoundingClientRect();
        const svgRect = svg.getBoundingClientRect();
        return {
          hasActiveEdge: activeEdge instanceof SVGPathElement,
          fillsWholeWidth: svgRect.width - scrollRect.width < 2,
        };
      });

      assert.equal(fallbackMetrics.hasActiveEdge, false);
      assert.equal(fallbackMetrics.fillsWholeWidth, true);
    } finally {
      await browser.close();
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
