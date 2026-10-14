const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();
  page.setDefaultTimeout(12000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const uuid='11111111-1111-4111-8111-111111111111';
  const mock=`
  window.__zagsCalls=[];
  window.supabase={createClient:()=>({
    auth:{getSession:async()=>({data:{session:{user:{id:'member-b'},access_token:'mock'}}})},
    rpc:async(_name,args)=>{
      window.__zagsCalls.push(args.p_action);
      if(args.p_action==='invitation')return {data:null,error:{message:'Приглашение уже принято или срок истёк'}};
      if(args.p_action==='get')return {data:{id:'11111111-1111-4111-8111-111111111111',name1:'Дмитрий',name2:'Анна',family:'Тестовая',plan:'basic',role:2,has_partner:true,payment_status:'unpaid',share1:false,share2:false},error:null};
      throw Error('Unexpected action: '+args.p_action);
    }
  })};
  `;
  await page.route('**/npm/@supabase/supabase-js@2/**',r=>r.fulfill({status:200,contentType:'text/javascript',body:mock}));
  await page.goto('http://127.0.0.1:8765/zags/?couple='+uuid+'#invite=used-token',{waitUntil:'domcontentloaded'});
  await page.getByText('Партнёр согласился. Заявление успешно создано').waitFor();
  assert.deepEqual(await page.evaluate(()=>window.__zagsCalls),['invitation','get']);
  assert.equal(await page.evaluate(()=>location.hash),'','Token must be removed from location');
  assert.equal(await page.evaluate(id=>sessionStorage.getItem('zags-invite-'+id),uuid),null,'No stale token');
  assert.equal(await page.locator('#pay').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: already accepted invitation opens private couple page for member');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
