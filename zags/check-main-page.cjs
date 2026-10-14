// Verify real HTTPS publication on GitHub Pages; no user data or payments touched.
const assert=require('node:assert/strict');
const base='https://dimontattoo495-afk.github.io/ya-byl-zdes/';
async function get(url){
 let last='';
 for(let i=0;i<4;i++){
  try{
   const r=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(12000)});
   last='HTTP '+r.status;
   if(r.ok){return await r.text();}
  }catch(e){last=e.message;}
  if(i<3)await new Promise(resolve=>setTimeout(resolve,6500));
 }
 throw Error(url+': '+last);
}
(async()=>{
 const landing=await get(base);
 assert.match(landing,/href="\.\/zags\/"/,'Main landing does not show virtual ZAGS link');
 assert.match(landing,/id="zags-title"/,'Virtual ZAGS home card missing');
 const zags=await get(base+'zags/');
 assert.match(zags,/Виртуальный ЗАГС/,'ZAGS title missing');
 assert.match(zags,/ТЕСТОВАЯ ВЕРСИЯ/,'ZAGS test banner missing');
 assert.match(zags,/paymentsEnabled:false/,'Disabled payments guard missing');
 assert.match(zags,/href="privacy.html"/,'ZAGS policy relative link missing');
 const policy=await get(base+'zags/privacy.html');
 assert.match(policy,/Данные в тестовом/,'ZAGS-specific data notice missing');
 console.log('PASS: home link + early-access ZAGS + policy all served over HTTPS');
})().catch(e=>{console.error('GH_PAGES_CHECK_FAILED: '+e.message);process.exit(1)});
