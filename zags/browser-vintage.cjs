const { chromium }=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900},acceptDownloads:true});
  page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/zags/',{waitUntil:'domcontentloaded'});
  await page.locator('.hero-art img[src="vintage-certificate.svg"]').waitFor();
  assert.equal(await page.locator('.hero-art img').evaluate(e=>e.naturalWidth>0),true,'Decorative template did not load');
  await page.locator('#demo').click();
  await page.locator('#create input[type=checkbox]').check();
  await page.locator('#create').evaluate(el=>el.requestSubmit());
  await page.locator('#demo-accept').click();
  await page.locator('#accept input[type=checkbox]').check();
  await page.locator('#accept').evaluate(el=>el.requestSubmit());
  await page.locator('#pay').click();
  await page.locator('#yes').click();
  await page.locator('#switch').click();
  await page.locator('#yes').click();
  await page.locator('#certificate').waitFor();
  await page.waitForFunction(()=>document.querySelector('#certificate').getContext('2d').getImageData(80,80,1,1).data[3]>0);
  const canvas=page.locator('#certificate');
  assert.deepEqual(await canvas.evaluate(e=>[e.width,e.height]),[1600,2240]);
  const jpg=await canvas.evaluate(e=>e.toDataURL('image/png'));
  assert.ok(jpg.length>100000,'Certificate canvas unexpectedly empty');
  await page.screenshot({path:'/tmp/zags-vintage-certificate.png',fullPage:true});
  const download=page.waitForEvent('download');
  await page.locator('#download').click();
  assert.equal((await download).suggestedFilename(),'virtual-wedding-certificate.png');
  await page.evaluate(()=>window.print=()=>window.__printed=true);
  await page.locator('#print-pdf').click();
  assert.equal(await page.evaluate(()=>window.__printed),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: vintage demo -> two yes -> portrait certificate -> PNG and PDF print');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
