const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/zags/',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:/Сначала посмотреть пример/}).click();
  await page.locator('#create input[type=checkbox]').check();
  await page.locator('#create').evaluate(e=>e.requestSubmit());
  await page.locator('#demo-accept').click();
  await page.locator('#accept input[type=checkbox]').check();
  await page.locator('#accept').evaluate(e=>e.requestSubmit());
  await page.locator('#pay').click();
  await page.locator('#yes').click();
  await page.locator('#switch').click();
  await page.locator('#yes').click();
  await page.locator('#certificate').waitFor();
  assert.equal(await page.locator('#certificate').evaluate(el=>el.width),1600);
  assert.equal(await page.locator('#certificate').evaluate(el=>el.height),1130);
  assert.ok((await page.locator('#certificate').evaluate(el=>el.toDataURL('image/png'))).length>10000);
  assert.equal(await page.getByText('Не является официальным документом.').count()>0,true);
  const downloaded=page.waitForEvent('download');
  await page.locator('#download').click();
  const item=await downloaded;
  assert.equal(item.suggestedFilename(),'virtual-wedding-certificate.png');
  let printed=0;
  await page.evaluate(()=>{window.print=()=>{window.__printCount=(window.__printCount||0)+1;};});
  await page.locator('#print-pdf').click();
  printed=await page.evaluate(()=>window.__printCount||0);
  assert.equal(printed,1,'Print-to-PDF must open browser print');
  assert.deepEqual(errors,[]);
  console.log('PASS: demo partner -> payment simulation -> 2 yes votes -> certificate PNG / PDF print');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
