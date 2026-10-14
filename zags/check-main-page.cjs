// Read-only availability probe of the ZAGS page published to the original GitHub Pages site.
const assert=require('node:assert/strict');
const url='https://dimontattoo495-afk.github.io/ya-byl-zdes/zags/';
(async()=>{
let status=0;
for(let i=0;i<3;i++){
 const r=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(12000)});
 status=r.status;
 if(r.ok){
   const page=await r.text();
   assert.match(page,/Виртуальный ЗАГС/i,'Incorrect page');
   assert.match(page,/ТЕСТОВАЯ ВЕРСИЯ/,'Testing notice not visible');
   assert.match(page,/paymentsEnabled:false/,'Payments are not disabled in served page');
   console.log('PASS: GitHub Pages ZAGS live HTTPS URL and disabled payments');
   return;
 }
 if(i<2) await new Promise(resolve=>setTimeout(resolve,8000));
}
throw Error('GitHub Pages ZAGS URL did not return 200; got HTTP '+status);
})().catch(e=>{console.error('GH_PAGES_CHECK_FAILED:',e.message);process.exit(1)});
