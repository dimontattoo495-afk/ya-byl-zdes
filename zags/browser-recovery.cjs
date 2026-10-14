const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({headless: true});
  const page = await browser.newPage();
  page.setDefaultTimeout(12000);
  const stub = [
    'window.__otpSends = 0;',
    'window.supabase = {createClient: () => ({',
    ' auth: {',
    '  getSession: async () => ({data: {session: null}}),',
    '  signInWithOtp: async () => {window.__otpSends++; return {error: null};}',
    ' }',
    '})};'
  ].join('\n');
  await page.route('**/npm/@supabase/supabase-js@2/**', route =>
    route.fulfill({status:200,contentType:'text/javascript',body:stub}));
  await page.goto('http://127.0.0.1:8765/zags/', {waitUntil:'domcontentloaded'});
  await page.locator('#start').click();
  await page.locator('#email').fill('person@example.org');
  await page.locator('#login input[type="checkbox"]').check();
  await page.locator('#login').evaluate(el=>el.requestSubmit());
  await page.locator('#otp:visible').waitFor();
  await page.locator('#resend-otp').click();
  await page.waitForFunction(()=>window.__otpSends===2);
  await page.locator('#change-email').click();
  await page.locator('#login:visible').waitFor();
  await page.locator('#email').fill('person2@example.org');
  await page.locator('#login').evaluate(el=>el.requestSubmit());
  await page.waitForFunction(()=>window.__otpSends===3);
  assert.equal(await page.locator('#otp:visible').count(),1);
  await browser.close();
  console.log('PASS: resend code and change email');
})().catch(e=>{console.error(e);process.exitCode=1;});
