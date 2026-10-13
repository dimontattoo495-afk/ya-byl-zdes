const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(12000);
  const jsErrors = [];
  page.on('pageerror', error => jsErrors.push(error.message));
  await page.goto('http://127.0.0.1:8765/zags/', { waitUntil: 'domcontentloaded' });
  await page.locator('h1').first().waitFor();
  await page.screenshot({ path: '/tmp/zags-mobile-landing.png', fullPage: true });
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(width <= 400, 'Mobile page overflows viewport: ' + width);
  await page.getByRole('button', { name: /Сначала посмотреть пример/ }).click();
  await page.locator('#name1').waitFor();
  await page.screenshot({ path: '/tmp/zags-mobile-form.png', fullPage: true });
  assert.deepEqual(jsErrors, []);
  await browser.close();
  console.log('PASS: mobile landing and demo form');
})().catch(error => { console.error(error); process.exitCode = 1; });
