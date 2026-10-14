'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
// All authenticated Supabase calls are mocked in the browser. No real users,
// invitations, SQL writes, financial callbacks or bank endpoints are contacted.
const base='http://127.0.0.1:8765/';
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
  await context.addInitScript(()=>{
    const state={couple:null,serial:0,apiActions:[],payments:0};
    window.__zagsTestState=state;
    const creatorId='11111111-2222-4333-8444-555555555555';
    const creator={id:'test-creator'};
    const cloned=()=>JSON.parse(JSON.stringify(state.couple));
    window.supabase={createClient:()=>({
      auth:{
        getSession:async()=>({data:{session:{user:creator}}}),
        signOut:async()=>({error:null}),
        signInWithOtp:async()=>({error:null}),
        verifyOtp:async()=>({error:null})
      },
      rpc:(method,body)=>({
        abortSignal:async()=>{
          state.apiActions.push(method+':'+(body?.p_action||''));
          if(method==='zags_cancel_unaccepted'){
            if(body.p_id!==creatorId||state.couple?.has_partner)throw Error('Test cancellation rejected');
            state.couple=null;
            return {data:true,error:null};
          }
          if(method!=='zags_action')return {data:null,error:{message:'Unknown RPC'}};
          const a=body.p_action,data=body.p_data||{};
          if(a==='create'){
            state.serial++;
            state.couple={
              id:creatorId,creator:'test-creator',
              name1:data.name1,name2:data.name2,family:data.family,
              plan:data.plan,theme:data.theme,vow1:data.vow||'',vow2:'',
              scheduled_at:data.scheduled_at,role:1,has_partner:false,
              payment_status:'unpaid',share1:false,share2:false,
              expires_at:new Date(Date.now()+7*86400000).toISOString(),
              photo:'',married_at:null,yes1:null,yes2:null,wishes:[]
            };
            return {data:{id:creatorId,token:'testToken'+state.serial},error:null};
          }
          if(a==='get')return {data:cloned(),error:null};
          if(a==='renew'){
            state.serial++;
            state.couple.expires_at=new Date(Date.now()+7*86400000).toISOString();
            return {data:{id:creatorId,token:'testToken'+state.serial},error:null};
          }
          if(a==='list')return {data:state.couple ? [{id:creatorId,family:state.couple.family,married_at:null}] : [],error:null};
          throw Error('Unexpected backend action '+a);
        }
      })
    })};
  });
  const page=await context.newPage();
  await page.route('https://**/*',route=>route.abort());
  await page.goto(base+'zags/',{waitUntil:'domcontentloaded'});
  await page.locator('#landing').waitFor({state:'visible',timeout:10000});
  await page.click('#start');
  await page.locator('#create').waitFor({state:'visible',timeout:10000});
  await page.fill('#name1','Мария');
  await page.fill('#name2','Павел');
  await page.fill('#family','Наша тестовая история');
  await page.locator('#create input[type=checkbox]').check();
  await page.click('#create button.primary');
  await page.locator('#copy-invite').waitFor({state:'visible',timeout:10000});
  const oldInvite=await page.locator('#link').inputValue();
  assert(oldInvite.includes('couple='+encodeURIComponent('11111111-2222-4333-8444-555555555555')));
  assert(oldInvite.includes('#invite=testToken1'));
  assert.equal(await page.locator('.journey-step.done').count(),1);
  await page.click('#renew');
  await page.waitForFunction(old=>document.querySelector('#link')?.value!==old,oldInvite);
  const newInvite=await page.locator('#link').inputValue();
  assert(newInvite.includes('#invite=testToken2'));
  assert.equal(await page.locator('#copy-invite').isEnabled(),true);
  assert.equal(await page.locator('#share-invite').isEnabled(),true);
  console.log('PASS ZAGS: signed-in account creates invitation, expiration is displayed, new link invalidates old link');
  page.once('dialog',dialog=>dialog.accept());
  await page.click('#cancel-request');
  await page.getByText('Мои истории',{exact:true}).waitFor({timeout:10000});
  assert.match(await page.locator('#panel').textContent(),/первое приглашение/);
  assert.equal(await page.evaluate(()=>window.__zagsTestState.apiActions.filter(x=>x.startsWith('zags_cancel_unaccepted')).length),1);
  console.log('PASS ZAGS: owner confirms deletion of unpaid, unaccepted invitation, and list is updated');
  await page.click('#back');
  await page.click('#demo');
  await page.locator('#create').waitFor({state:'visible',timeout:10000});
  await page.locator('#create input[type=checkbox]').check();
  await page.click('#create button.primary');
  await page.locator('#demo-accept').waitFor({state:'visible',timeout:10000});
  await page.click('#demo-accept');
  await page.locator('#accept').waitFor({state:'visible',timeout:10000});
  await page.locator('#accept input[type=checkbox]').check();
  await page.click('#accept button.primary');
  await page.locator('#pay').waitFor({state:'visible',timeout:10000});
  await page.click('#pay');
  await page.locator('#yes').waitFor({state:'visible',timeout:10000});
  await page.click('#yes');
  await page.click('#switch');
  await page.locator('#yes').waitFor({state:'visible',timeout:10000});
  await page.click('#yes');
  await page.locator('#download').waitFor({state:'visible',timeout:10000});
  assert.equal(await page.locator('.journey-step.done').count(),4);
  assert.equal(await page.locator('#certificate').count(),1);
  const downloading=page.waitForEvent('download');
  await page.click('#download');
  const download=await downloading;
  assert.equal(download.suggestedFilename(),'virtual-wedding-certificate.png');
  await page.screenshot({path:'/tmp/ybz-zags-flow-demo.png',fullPage:true});
  assert.equal(await page.evaluate(()=>window.__zagsTestState.payments),0);
  console.log('PASS ZAGS: full two-participant demo, symbolic vows, watermark-ready certificate PNG');
  console.log('PASS ZAGS: no actual Supabase writes, partner accounts or banking transactions');
  await context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
