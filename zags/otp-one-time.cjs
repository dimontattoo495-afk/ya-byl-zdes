// One-time real email delivery diagnostic; never prints keys, address, or OTP.
const fs=require('node:fs');
const vm=require('node:vm');
(async()=>{
  const html=fs.readFileSync('offer.html','utf8');
  const mail=html.match(/Email:\s*<b>([^<]+)<\/b>/i)?.[1]?.trim();
  if(mail!=='dimontatoo@yandex.ru') throw Error('Expected verified contact address is missing');
  const context={window:{}};
  vm.runInNewContext(fs.readFileSync('config.js','utf8'),context);
  const {SUPABASE_URL,SUPABASE_ANON_KEY}=context.window.YBZ_CONFIG;
  if(!SUPABASE_URL||!SUPABASE_ANON_KEY)throw Error('Missing public Supabase settings');
  const response=await fetch(SUPABASE_URL+'/auth/v1/otp',{
    method:'POST',
    headers:{'apikey':SUPABASE_ANON_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({email:mail,create_user:true}),
    signal:AbortSignal.timeout(14000)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    console.error('OTP not accepted. Status '+response.status+'; error code: '+String(data.error_code||data.code||'unknown'));
    process.exitCode=1;
    return;
  }
  console.log('PASS: Supabase accepted a single real sign-in OTP request (HTTP '+response.status+'). Delivery to inbox must still be confirmed.');
})().catch(e=>{console.error('OTP diagnostic failed:',e.message);process.exitCode=1});
