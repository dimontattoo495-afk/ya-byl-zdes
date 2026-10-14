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
        assert.equal(body.public_no,987654321);
        assert.match(body.owner_key,/^[0-9a-f]{64}$/i);
        assert.equal(req.headers().authorization,'Bearer OFFLINE_ONLY_FAKE_ADMIN_TOKEN');
        bankCalls++;
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
          ok:true,confirmation_url:'https://fake-payment.example.invalid/test-checkout'
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
    assert.equal(orderCalls,1);
    assert.equal(bankCalls,1);
    assert.match(await page.locator('h1').textContent(),/MOCK CHECKOUT/);
    console.log('PASS: public tariffs unchanged; admin-only 10-RUB button makes authenticated mocked request');
    console.log('PASS: no real database writes, payment attempts, or bank calls');
    await ctx.close();
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
