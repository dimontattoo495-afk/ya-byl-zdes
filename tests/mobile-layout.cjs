'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

const base='http://127.0.0.1:8765/';
const sizes=[320,360,390,768,1280];
function mockRpc(url) {
  if(url.includes('/ybz_get_stats')) return [{occupied:4,total_slots:1000000}];
  if(url.includes('/ybz_get_feed')) return [{
    public_no:321,name:'Тестовая запись',city:'',message:'Эта запись используется только в браузерном тесте.',
    plan:'basic',is_demo:true,created_at:'2026-01-01T00:00:00Z'
  }];
  if(url.includes('/ybz_get_entry')) return [{
    public_no:321,name:'Тестовая запись',city:'',message:'Эта запись используется только в браузерном тесте.',
    plan:'basic',is_demo:true,views:1,created_at:'2026-01-01T00:00:00Z'
  }];
  return [];
}
async function makePage(browser,width){
  const context=await browser.newContext({viewport:{width,height:820},deviceScaleFactor:1});
  await context.addInitScript(()=>{
    window.supabase={createClient:()=>({
      auth:{getUser:async()=>({data:{user:null},error:null}),
            getSession:async()=>({data:{session:null},error:null}),
            onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}
    })};
  });
  const page=await context.newPage();
  await page.route('https://**/*',route=>route.abort());
  await page.route('**/rest/v1/rpc/**',route=>route.fulfill({
    status:200,contentType:'application/json',
    body:JSON.stringify(mockRpc(route.request().url()))
  }));
  return {context,page};
}
async function fits(page,width,name){
  const result=await page.evaluate(()=>({
    documentWidth:document.documentElement.scrollWidth,
    viewportWidth:window.innerWidth
  }));
  assert(result.documentWidth<=width+2,
    name+' at '+width+'px: horizontal overflow '+JSON.stringify(result));
}
async function run(){
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try{
    for(const width of sizes){
      const {context,page}=await makePage(browser,width);
      try {
        await page.goto(base+'index.html',{waitUntil:'domcontentloaded',timeout:20000});
        await page.locator('.entry-card-link').first().waitFor({timeout:12000});
        assert.equal(await page.locator('.entry-card-link').count(),1,'Feed card should be a focusable anchor');
        assert.equal(await page.locator('.entry-card-link').first().getAttribute('href'),'./entry.html#321');
        assert(await page.locator('a[href="./zags/"]').first().isVisible(),'ZAGS navigation missing');
        await fits(page,width,'Home');
        if(width===360) await page.screenshot({path:'/tmp/ybz-mobile-home.png',fullPage:true});

        await page.goto(base+'create.html',{waitUntil:'domcontentloaded',timeout:20000});
        assert.equal(await page.locator('label[for="message"]').count(),1,'Message label missing');
        await page.locator('#message').fill('Текст для проверки');
        assert.match((await page.locator('#messageCount').textContent()).trim(),/^18 \/ 500$/);
        await page.locator('#plan').selectOption('vip');
        assert.match(await page.locator('#price').textContent(),/300/);
        await fits(page,width,'Create form');
        if(width===360) await page.screenshot({path:'/tmp/ybz-mobile-create.png',fullPage:true});

        await page.goto(base+'zags/',{waitUntil:'domcontentloaded',timeout:20000});
        await page.locator('#landing').waitFor({state:'visible',timeout:8000});
        if(width<=720){
          assert(await page.locator('header nav a[href="#how"]').isVisible(),'Mobile how-it-works link must stay visible');
          assert(await page.locator('#account').isVisible(),'Mobile account button missing');
        }
        assert((await page.locator('meta[name="robots"]').getAttribute('content')).includes('noindex'),'ZAGS is still a nonpublic demo');
        assert.equal(await page.locator('button#start').isVisible(),true);
        await fits(page,width,'ZAGS');
        if(width===360) await page.screenshot({path:'/tmp/ybz-mobile-zags.png',fullPage:true});

        console.log('PASS '+width+'px: home feed, ZAGS link, form/price, mobile ZAGS nav, horizontal fit');
      } finally{
        await context.close();
      }
    }

    const {context,page}=await makePage(browser,390);
    try{
      await page.goto(base+'index.html',{waitUntil:'domcontentloaded',timeout:20000});
      const link=page.locator('.entry-card-link').first();
      await link.waitFor({timeout:12000});
      await link.focus();
      await page.keyboard.press('Enter');
      await page.waitForURL(url=>url.pathname.endsWith('/entry.html')&&url.hash==='#321',{timeout:12000});
      await page.locator('.public-entry-card').waitFor({timeout:10000});
      console.log('PASS keyboard: focus and Enter open a public record without a mouse');
    }finally{await context.close()}
    console.log('PASS responsive smoke: no production writes or payment attempts');
  } finally{await browser.close()}
}
run().catch(e=>{console.error(e);process.exit(1)});
