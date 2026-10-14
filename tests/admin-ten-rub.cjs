'use strict';
// Offline browser test for admin-only 10-RUB checkout. All Supabase and bank requests are mocked.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base='http://127.0.0.1:8765/';
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try{
    const ctx=await browser.newContext({viewport:{width:390,height:900}});
    await ctx.addInitScript(()=>{
      sessionStorage.setItem('ybz_admin_session',JSON.stringify({access_token:'OFFLINE_ONLY_FAKE_ADMIN_TOKEN'}));
    });
    const page=await ctx.newPage();
    let orderCalls=0, bankCalls=0;
    await page.route('https://**/*',async route=>{
      const req=route.request(),url=req.url();
      if(url.includes('/rest/v1/rpc/')){
        const name=url.split('/').pop();
        let data=[];
        if(name==='ybz_is_admin')data=true;
        if(name==='ybz_admin_entries_v2')data=[{public_no:987654321,name:'Админ-тест 10 ₽',price_rub:10,is_demo:true,plan:'basic',payment_status:'pending',status:'pending',created_at:'2026-10-14T10:22:28Z'}];
        if(name==='ybz_create_admin_10rub_test'){
          const body=JSON.parse(req.postData()||'{}');
          assert.match(body.p_owner_key,/^[0-9a-f]{64}$/i);
          orderCalls++;
          data=[{public_no:987654321}];
        }
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
      }
      if(url.includes('/functions/v1/create-payment')){
        const body=JSON.parse(req.postData()||'{}');
        assert.equal(body.admin_test,true);
        assert.equal(body.public_no,undefined,'Edge resolves the existing order by owner key');
        assert.match(body.owner_key,/^[0-9a-f]{64}$/i);
        assert.equal(req.headers().authorization,'Bearer OFFLINE_ONLY_FAKE_ADMIN_TOKEN');
        bankCalls++;
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
          ok:true,public_no:987654321,confirmation_url:'https://fake-payment.example.invalid/test-checkout'
        })});
      }
      if(url.includes('fake-payment.example.invalid')){
        return route.fulfill({status:200,contentType:'text/html',body:'<html><title>Mock checkout</title><h1>MOCK CHECKOUT - NO REAL MONEY</h1></html>'});
      }
      return route.abort();
    });
    await page.goto(base+'create.html',{waitUntil:'domcontentloaded'});
    assert.equal(await page.locator('#plan option').count(),3);
    assert.match(await page.locator('#plan').inputValue(),/basic/);
    assert.match(await page.locator('#price').textContent(),/50/);
    assert.equal(await page.locator('#plan option:has-text("10 ₽")').count(),0);
    await page.goto(base+'admin.html',{waitUntil:'domcontentloaded'});
    await page.locator('#adminApp').waitFor({state:'visible',timeout:9000});
    await page.locator('#testPayment10Btn').click();
    await page.waitForURL('https://fake-payment.example.invalid/test-checkout',{timeout:10000});
    assert.equal(orderCalls,0,'An existing admin-test order must not trigger a new RPC');
    assert.equal(bankCalls,1);
    assert.match(await page.locator('h1').textContent(),/MOCK CHECKOUT/);
    console.log('PASS: public tariffs unchanged; existing 10-RUB order reused without slow create RPC');
    console.log('PASS: no real database writes, payment attempts, or bank calls');
    await ctx.close();

    // Mock a successful bank return; the test owner key must not overwrite
    // the existing owner's real account key in localStorage.
    const returnContext=await browser.newContext({viewport:{width:390,height:900}});
    const normalKey='aa'.repeat(32), testKey='bb'.repeat(32);
    await returnContext.addInitScript(({normalKey,testKey})=>{
      localStorage.setItem('ybz_owner_key',normalKey);
      localStorage.setItem('ybz_admin_test_10_owner_key',testKey);
      localStorage.setItem('ybz_payment_test_public_no','987654321');
    },{normalKey,testKey});
    const returnPage=await returnContext.newPage();
    let testKeyQueried=false;
    await returnPage.route('https://**/*',async route=>{
      const req=route.request(),url=req.url();
      if(url.includes('/rest/v1/rpc/ybz_get_my_entries')){
        const body=JSON.parse(req.postData()||'{}');
        if(body.p_owner_key===testKey){
          testKeyQueried=true;
          return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{
            public_no:987654321,status:'published',payment_status:'paid',
            message:'Технический тест',views:0,plan:'basic'
          }])});
        }
        return route.fulfill({status:200,contentType:'application/json',body:'[]'});
      }
      return route.abort();
    });
    await returnPage.goto(base+'payment-return.html?status=success&no=987654321&provider=tbank',{waitUntil:'domcontentloaded'});
    await returnPage.getByText('Проверочный платёж 10 ₽ успешен').waitFor({timeout:9000});
    assert.equal(testKeyQueried,true,'Payment return must look up dedicated 10-RUB owner key');
    assert.equal(await returnPage.locator('a[href="./admin.html"]').count(),1);
    assert.equal(await returnPage.evaluate(()=>localStorage.getItem('ybz_owner_key')),normalKey);
    console.log('PASS: test payment return preserves the normal owner key and points to admin panel');
    await returnContext.close();
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
