// lib/playwright-capture.ts
import { chromium, Browser, Frame, Page } from "playwright";

// Allow NTLM/Negotiate auth for all local servers (safe for local dev only)
const LAUNCH_ARGS = [
  "--auth-server-allowlist=*",
  "--auth-negotiate-delegate-allowlist=*",
];

async function launchBrowser(): Promise<Browser> {
  return chromium.launch({ args: LAUNCH_ARGS });
}

async function openReport(browser: Browser, url: string): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
  // Extra wait for Power BI JavaScript SDK to initialize after network settles
  await page.waitForTimeout(4_000);
  return page;
}

// Selectors tried in order — Power BI embedded viewer varies by PBRS version
const PAGE_TAB_SELECTORS = [
  '[aria-label="Page navigation"] button',
  '[role="tablist"] [role="tab"]',
  'div[class*="pageNavigation"] button',
  'div[class*="page-navigation"] button',
  'div[class*="pages"] button',
];

async function findPageTabs(page: Page): Promise<string[]> {
  // Power BI report may render directly or inside an iframe
  const framesToSearch: Frame[] = [
    page.mainFrame(),
    ...page.frames().filter((f) => f !== page.mainFrame()),
  ];

  for (const frame of framesToSearch) {
    for (const selector of PAGE_TAB_SELECTORS) {
      try {
        const elements = await frame.locator(selector).all();
        if (elements.length === 0) continue;
        const names: string[] = [];
        for (const el of elements) {
          const text =
            (await el.textContent())?.trim() ||
            (await el.getAttribute("title"))?.trim() ||
            "";
          if (text) names.push(text);
        }
        if (names.length > 0) return names;
      } catch {
        // selector not present in this frame — try next
      }
    }
  }
  return [];
}

export async function getReportPages(reportUrl: string): Promise<string[]> {
  const browser = await launchBrowser();
  try {
    const page = await openReport(browser, reportUrl);
    return await findPageTabs(page);
  } finally {
    await browser.close();
  }
}

export async function capturePages(
  reportUrl: string,
  pageNames: string[]
): Promise<{ name: string; data: Buffer }[]> {
  const browser = await launchBrowser();
  try {
    const page = await openReport(browser, reportUrl);
    const results: { name: string; data: Buffer }[] = [];

    const framesToSearch: Frame[] = [
      page.mainFrame(),
      ...page.frames().filter((f) => f !== page.mainFrame()),
    ];

    for (const pageName of pageNames) {
      // Click the page tab
      let clicked = false;
      outer: for (const frame of framesToSearch) {
        const clickSelectors = [
          `[aria-label="Page navigation"] button:has-text("${pageName}")`,
          `[role="tablist"] [role="tab"]:has-text("${pageName}")`,
          `button[title="${pageName}"]`,
          `div[class*="pageNavigation"] button:has-text("${pageName}")`,
        ];
        for (const selector of clickSelectors) {
          try {
            await frame.locator(selector).first().click({ timeout: 5_000 });
            clicked = true;
            break outer;
          } catch {
            // try next selector
          }
        }
      }

      if (!clicked) {
        // Page tab not found — screenshot whatever is currently visible and note failure
        const screenshot = await page.screenshot({ type: "png" });
        results.push({ name: `${pageName}-FAILED`, data: Buffer.from(screenshot) });
        continue;
      }

      // Wait for visuals to re-render after tab switch
      await page.waitForTimeout(4_000);

      const screenshot = await page.screenshot({ type: "png" });
      results.push({ name: pageName, data: Buffer.from(screenshot) });
    }

    return results;
  } finally {
    await browser.close();
  }
}
