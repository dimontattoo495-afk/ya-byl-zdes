// Read-only end-to-end check for the separately hosted staging landing.
// Never sends OTP, creates users, changes database rows, or attempts payments.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const url='https://shiny-piroshki-431ada.netlify.app/';
(async()=>{
  const response=await fetch(url,{signal:AbortSignal.timeout(14000),redirect:'follow'});
  assert.equal(response.status,200,'Netlify home should serve HTTP 200');
  assert.match(response.headers.get('content-type')||'',/text\/html/i,'Netlify must serve HTML');
  const html=await response.text();
  assert.match(html,/<html lang="ru">/,'Expected Russian site');
  assert.match(html,/ТЕСТОВАЯ ВЕРСИЯ/,'Must visibly identify staging');
  assert.match(html,/paymentsEnabled:false/,'Payment client flag must be disabled');
  assert.ok(!html.includes('src="../config.js"'),'Standalone must bundle public config');
  assert.ok(!html.includes('file:\/\/'),'No file URLs in deployed page');
  const deep=await fetch(url+'?couple=11111111-1111-4111-8111-111111111111',{signal:AbortSignal.timeout(14000)});
  assert.equal(deep.status,200,'Netlify must serve invitation deep link');
  assert.match(await deep.text(),/ТЕСТОВАЯ ВЕРСИЯ/);

  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000});
    await page.locator('#start').waitFor();
    assert.equal(await page.locator('#pay').count(),0,'No payment UI on landing');
    assert.ok((await page.title()).includes('ЗАГС'),'Wrong site title');
    assert.ok((await page.locator('body').innerText()).includes('ТЕСТОВАЯ ВЕРСИЯ'));
    assert.deepEqual(errors,[],'Browser JavaScript must not crash');
    console.log('PASS: public Netlify HTTP response, invite URL, mobile DOM and no live payment UI');
  } finally {await browser.close();}
})().catch(e=>{console.error('LIVE_NETLIFY_CHECK_FAILED:',e.message);process.exit(1)});
