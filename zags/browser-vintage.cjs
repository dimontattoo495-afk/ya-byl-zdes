const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');

(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900},acceptDownloads:true});
  page.setDefaultTimeout(15000);
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.__zagsPaintedTexts=[];
   const original=CanvasRenderingContext2D.prototype.fillText;
   CanvasRenderingContext2D.prototype.fillText=function(text,...rest){
    window.__zagsPaintedTexts.push(String(text));
    return original.call(this,text,...rest);
   };
  });
  await page.goto('http://127.0.0.1:8765/zags/',{waitUntil:'domcontentloaded'});
  await page.locator('.hero-art img[src="vintage-certificate.svg"]').waitFor();
  assert.equal(await page.locator('.hero-art img').evaluate(e=>e.naturalWidth>0),true,'Decorative template did not load');

  await page.locator('#demo').click();
  await page.locator('#name1').fill('Александра');
  await page.locator('#name2').fill('Константин');
  await page.locator('#family').fill('Наша виртуальная семья');
  await page.locator('#create input[type=checkbox]').check();
  await page.locator('#create').evaluate(el=>el.requestSubmit());
  await page.locator('#demo-accept').waitFor();
  assert.equal(await page.locator('#certificate').count(),0,'Certificate must not exist before accepting invitation');
  await page.locator('#demo-accept').click();
  await page.locator('#accept input[type=checkbox]').check();
  await page.locator('#accept').evaluate(el=>el.requestSubmit());
  await page.locator('#pay').waitFor();
  assert.equal(await page.locator('#certificate').count(),0,'Certificate must not exist before payment');
  await page.locator('#pay').click();
  await page.locator('#yes').click();
  await page.locator('#switch').waitFor();
  assert.equal(await page.locator('#certificate').count(),0,'One-sided yes must not issue certificate');
  await page.locator('#switch').click();
  await page.locator('#yes').click();
  await page.locator('#certificate').waitFor();
  await page.waitForFunction(()=>document.querySelector('#certificate').getContext('2d').getImageData(80,80,1,1).data[3]>0);
  const canvas=page.locator('#certificate');
  assert.deepEqual(await canvas.evaluate(e=>[e.width,e.height]),[1600,2240],'A4 portrait resolution changed');
  await page.waitForFunction(()=>window.__zagsPaintedTexts.includes('Александра')&&window.__zagsPaintedTexts.includes('Константин'));
  const painted=await page.evaluate(()=>window.__zagsPaintedTexts);
  for(const item of ['СВИДЕТЕЛЬСТВО','Александра','Константин','ДЕМОНСТРАЦИОННЫЙ ОБРАЗЕЦ','Не является официальным документом. Шуточное бракосочетание.']) {
   assert.ok(painted.some(t=>t.includes(item)), 'Missing dynamic certificate text: '+item);
  }
  const png=await canvas.evaluate(e=>e.toDataURL('image/png'));
  assert.ok(png.length>100000,'Certificate canvas unexpectedly empty');
  await page.screenshot({path:'/tmp/zags-vintage-certificate.png',fullPage:true});
  const download=page.waitForEvent('download');
  await page.locator('#download').click();
  assert.equal((await download).suggestedFilename(),'virtual-wedding-certificate.png');
  await page.evaluate(()=>window.print=()=>window.__printed=true);
  await page.locator('#print-pdf').click();
  assert.equal(await page.evaluate(()=>window.__printed),true,'PDF print action did not fire');
  const pdf=await page.pdf({format:'A4',printBackground:true});
  assert.ok(pdf.length>15000,'Printable PDF seems empty');
  await page.setViewportSize({width:375,height:812});
  await page.screenshot({path:'/tmp/zags-mobile-certificate.png',fullPage:true});
  const mobile=await page.evaluate(()=>({
   viewport:innerWidth,
   doc:document.documentElement.scrollWidth,
   canvas:document.querySelector('#certificate').getBoundingClientRect().width
  }));
  assert.ok(mobile.doc<=mobile.viewport+2,'Horizontal overflow on 375px mobile screen');
  assert.ok(mobile.canvas<mobile.viewport,'Certificate clipped on mobile');
  assert.deepEqual(errors,[],'Browser produced uncaught exceptions');
  console.log('PASS: custom-name demo, two independent yes, receipt gate, portrait PNG, A4 print and mobile layout');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
