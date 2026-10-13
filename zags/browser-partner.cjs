const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch();
const page=await browser.newPage();
page.setDefaultTimeout(12000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/npm/@supabase/supabase-js@2/**',route=>route.fulfill({status:200,contentType:'text/javascript',body:`
window.__calls=[];window.__signedIn=false;
window.supabase={createClient:()=>({auth:{
getSession:async()=>({data:{session:window.__signedIn?{user:{id:'partner-b'},access_token:'test'}:null}}),
signInWithOtp:async()=>({error:null}),
verifyOtp:async()=>{window.__signedIn=true;return {error:null}}
},rpc:async(name,args)=>{window.__calls.push(args.p_action);if(args.p_action==='invitation')return {data:{id:'11111111-1111-4111-8111-111111111111',name1:'Александр',name2:'Анна',family:'Тестовая семья',plan:'basic'},error:null};if(args.p_action==='accept')return {data:{id:'11111111-1111-4111-8111-111111111111',name1:'Александр',name2:'Анна',family:'Тестовая семья',plan:'basic',role:2,has_partner:true,payment_status:'unpaid',share1:false,share2:false},error:null};return {data:{id:'11111111-1111-4111-8111-111111111111',name1:'Александр',name2:'Анна',family:'Тестовая семья',plan:'basic',role:2,has_partner:true,payment_status:'unpaid',share1:false,share2:false},error:null};}})};
`}));
await page.goto('http://127.0.0.1:8765/zags/?couple=11111111-1111-4111-8111-111111111111#invite=test-token',{waitUntil:'domcontentloaded'});
await page.locator('#email').waitFor();
assert.deepEqual(await page.evaluate(()=>window.__calls),[],'Invitation must require login');
await page.locator('#email').fill('partner2@example.com');
await page.locator('#login input[type=checkbox]').check();
await page.locator('#login').evaluate(el=>el.requestSubmit());
await page.locator('#otp:visible').waitFor();
await page.locator('#otp').fill('123456');
await page.locator('#verify').evaluate(el=>el.requestSubmit());
await page.locator('#accept').waitFor();
await page.locator('#partner-name').fill('Анна');
await page.locator('#accept input[type=checkbox]').check();
await page.locator('#accept').evaluate(el=>el.requestSubmit());
await page.getByText('Оплата временно отключена.').waitFor();
await page.getByText('Партнёр согласился. Заявление успешно создано').waitFor();
assert.equal(await page.getByText('Оплатить церемонию может любой из вас').count(),0,'Do not invite payment while disabled');
assert.equal(await page.locator('#pay').count(),0,'Payment button must be absent');
assert.deepEqual(await page.evaluate(()=>window.__calls),['invitation','accept']);
assert.deepEqual(errors,[]);
await browser.close();
console.log('PASS: second partner must sign in before invitation access');
})().catch(e=>{console.error(e);process.exitCode=1});
