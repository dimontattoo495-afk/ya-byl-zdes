'use strict';
// Offline regression checks: do not use real user secrets, payments or Supabase data.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=file=>fs.readFileSync(file,'utf8');
const mockKey='AB'.repeat(32);
function initialize(file,href,seed=''){
  const location=new URL(href),stored=new Map();
  if(seed)stored.set('ybz_owner_key',seed);
  const localStorage={
    getItem:k=>stored.get(k)??null,
    setItem:(k,v)=>stored.set(k,v)
  };
  let scrubCount=0;
  const history={
    state:null,
    replaceState(_state,_title,url){
      scrubCount++;
      location.href=new URL(url,location.href).href;
    }
  };
  const ctx={
    window:{YBZ_CONFIG:{}},
    location,
    localStorage,
    history,
    URL,
    URLSearchParams,
    Uint8Array,
    Intl,
    crypto:{getRandomValues(arr){arr.fill(7);return arr;}},
    fetch(){throw Error('Unexpected network call during offline test')}
  };
  vm.runInNewContext(read(file),ctx,{filename:file,timeout:1000});
  return {ctx,stored,get scrubCount(){return scrubCount}};
}
for(const file of ['api.js','api-payments.js']){
  {
    const p=initialize(file,'https://example.test/my.html#key='+mockKey+'&paid=7');
    assert.equal(p.ctx.window.YBZ.getOwnerKey(),'ab'.repeat(32));
    assert.equal(p.stored.get('ybz_owner_key'),'ab'.repeat(32));
    assert.equal(p.ctx.location.href,'https://example.test/my.html');
    assert.equal(p.scrubCount,1);
  }
  {
    const p=initialize(file,'https://example.test/my.html?key='+mockKey+'&paid=7');
    assert.equal(p.ctx.window.YBZ.getOwnerKey(),'ab'.repeat(32));
    assert.equal(p.ctx.location.href,'https://example.test/my.html?paid=7');
    assert.equal(p.scrubCount,1);
  }
  {
    const p=initialize(file,'https://example.test/my.html','ff'.repeat(32));
    assert.equal(p.ctx.window.YBZ.getOwnerKey(),'ff'.repeat(32));
    assert.equal(p.scrubCount,0);
  }
  {
    const p=initialize(file,'https://example.test/my.html');
    assert.equal(p.ctx.window.YBZ.getOwnerKey(),'07'.repeat(32));
    assert.equal(p.stored.get('ybz_owner_key'),'07'.repeat(32));
  }
  console.log('PASS '+file+' owner-key migration, import and URL cleanup');
}
const cabinet=read('my.html');
assert(cabinet.includes('secretUrl.hash="key="+ownerKey;'),'Secret link must use fragment, not query');
assert(!cabinet.includes('secretUrl.searchParams.set("key"'),'Old insecure link writer must be removed');
assert(cabinet.includes('при смене адреса сайта'),'Warning about origin-local key must remain');
assert(cabinet.includes('e.payment_status==="refunded"'),'Refunded records must have an explicit status');
assert(cabinet.includes('Оплата возвращена — запись скрыта'),'Refunded record label must be truthful');
assert(cabinet.includes('const visible=paid && e.status==="published"'),'Share links must only be offered for paid published records');
assert(cabinet.includes('const hiddenPaid=paid && e.status==="hidden"'),'Republish should only be offered for paid hidden records');

assert(read('admin.js').includes('await verifyAdmin()'),'Admin client must verify server admin status');
const adminScript=read('admin.js');
assert(adminScript.includes('e.is_demo?'),'Delete controls must be restricted to demo entries');
assert(adminScript.includes('e.payment_status==="paid"'),'Admin republish button requires confirmed payment');

assert(read('zags/index.html').includes('paymentsEnabled:true'),'ZAGS public checkout must be enabled');
assert(fs.readFileSync('CNAME','utf8').trim()==='yabylzdes.ru','GitHub Pages must serve the chosen verified custom domain');
console.log('PASS: safe cabinet links, admin verification, enabled ZAGS checkout, stable site address');
