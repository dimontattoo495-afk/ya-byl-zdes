// Read-only DNS, WHOIS and HTTPS status snapshot. Never changes domains, payments or website.
const dns=require('node:dns').promises;
const net=require('node:net');
const expected=['185.199.108.153','185.199.109.153','185.199.110.153','185.199.111.153'];
async function registry(){
 return await new Promise((resolve)=>{
  const sock=net.createConnection({host:'whois.tcinet.ru',port:43});
  let result='';sock.setTimeout(7500);
  sock.on('connect',()=>sock.write('yabylzdes.ru\r\n'));
  sock.on('data',x=>{result+=x.toString('utf8');if(result.length>15000)sock.end()});
  sock.on('error',e=>resolve({error:e.message}));
  sock.on('timeout',()=>sock.destroy(new Error('WHOIS timeout')));
  sock.on('end',()=>resolve({lines:result.split('\n').filter(x=>/^(domain|state|nserver):/i.test(x.trim())).map(x=>x.trim())}));
  sock.on('close',()=>{if(!result)resolve({error:'No registry response'})});
 });
}
async function dnsQuery(type,name){try{return type==='A'?await dns.resolve4(name):await dns.resolveCname(name)}catch(e){return {error:e.code||e.message}}}
async function site(url){try{const r=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(11000)});return{status:r.status,url:r.url}}catch(e){return{error:e.cause?.code||e.message}}}
(async()=>{
 console.log('REGISTRY_STATUS '+JSON.stringify(await registry()));
 console.log('APEX_DNS '+JSON.stringify(await dnsQuery('A','yabylzdes.ru')));
 console.log('WWW_DNS '+JSON.stringify(await dnsQuery('CNAME','www.yabylzdes.ru')));
 for(const url of ['https://yabylzdes.ru/','https://www.yabylzdes.ru/','https://yabylzdes.ru/zags/'])console.log('HTTPS_STATUS '+JSON.stringify({requested:url,result:await site(url)}));
})();
