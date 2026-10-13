const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
page.setDefaultTimeout(15000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/npm/@supabase/supabase-js@2/**',route=>route.fulfill({status:200,contentType:'text/javascript',body:`
window.__authTrace=[];
window.supabase={createClient:()=>({
auth:{
getSession:async()=>({data:{session:window.__mockSignedIn?{user:{id:'mock-1'},access_token:'fake'}:null}}),
signInWithOtp:async(args)=>{window.__authTrace.push({op:'send',args});return {error:null}},
verifyOtp:async(args)=>{window.__authTrace.push({op:'verify',args});window.__mockSignedIn=true;return {error:null}},
signOut:async()=>{window.__mockSignedIn=false;return {error:null}}
},
rpc:async(name,args)=>({data: name==='zags_action'&&args.p_action==='list'?[]:null,error:null})
})};
`}));
await page.goto('http://127.0.0.1:8765/zags/',{waitUntil:'domcontentloaded'});
await page.getByRole('button',{name:/Создать нашу историю/}).click();
await page.locator('#email').fill('partner-test@example.com');
await page.locator('#login input[type=checkbox]').check();
await page.locator('#login').evaluate(el=>el.requestSubmit());
await page.locator('#otp:visible').waitFor();
await page.locator('#otp').fill('123456');
await page.locator('#verify').evaluate(el=>el.requestSubmit());
await page.locator('#name1').waitFor();
const trace=await page.evaluate(()=>window.__authTrace);
assert.equal(trace.length,2);
assert.deepEqual(trace.map(x=>x.op),['send','verify']);
assert.equal(trace[1].args.type,'email');
assert.equal(trace[1].args.token,'123456');
assert.equal(trace[1].args.email,'partner-test@example.com');
assert.deepEqual(errors,[]);
await browser.close();
console.log('PASS: mock email OTP and authenticated screen');
})().catch(e=>{console.error(e);process.exitCode=1;});
