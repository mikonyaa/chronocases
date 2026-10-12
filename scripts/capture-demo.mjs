import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
await mkdir('docs/media', { recursive: true });
const browser = await chromium.launch({ ...(process.env.CI ? {} : { channel: 'chrome' }), headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1060 }, locale: 'en-US', timezoneId: 'UTC' });
  const page = await context.newPage(); await page.goto(pathToFileURL(resolve('site/explorer.html')).href);
  await page.getByLabel('Selected calendar date').fill('2024-06-04'); await page.locator('#case-detail').waitFor();
  await page.screenshot({ path: 'docs/media/date-bug.png', fullPage: true });
  await page.getByRole('button', { name: 'Correct adapter', exact: true }).click();
  await page.screenshot({ path: 'docs/media/date-correct.png', fullPage: true });
  await page.getByLabel('Contract', { exact: true }).selectOption('recurrence'); await page.getByLabel('Find a case').fill('ny-fold-earlier-after-first');
  await page.screenshot({ path: 'docs/media/fold-policy.png', fullPage: true });
  await page.getByLabel('Find a case').fill('ny-fold-later-after-first'); await page.screenshot({ path: 'docs/media/fold-later.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 900 }); await page.getByLabel('Find a case').fill(''); await page.getByLabel('Contract', { exact: true }).selectOption('all'); await page.getByLabel('Find a case').fill('date-la-roundtrip');
  await page.screenshot({ path: 'docs/media/mobile.png', fullPage: true });
  await writeFile('.artifacts/demo-capture.json', JSON.stringify({ browser: await browser.version(), channel: process.env.CI ? 'chromium' : 'chrome', isolatedContext: true, viewportChecks: [1440, 390], source: 'Actual standalone viewer built from real Node adapter reports; native screenshots, no pixel edits' }, null, 2) + '\n');
} finally { await browser.close(); }
