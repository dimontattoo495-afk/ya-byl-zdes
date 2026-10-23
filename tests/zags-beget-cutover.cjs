'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');
const config=fs.readFileSync('zags/config.js','utf8');
const siteConfig=fs.readFileSync('config.js','utf8');
const html=fs.readFileSync('zags/index.html','utf8');
const homepage=fs.readFileSync('index.html','utf8');
const sql=fs.readFileSync('zags/beget/008_zags_api_and_payments.sql','utf8');
const installer=fs.readFileSync('zags/beget/install-cutover.sh','utf8');
const edge=fs.readFileSync('zags/beget/functions/zags-payment/index.ts','utf8');

assert.match(config,/https:\/\/api\.smoke-tattoo\.ru/,'ZAGS must use the Beget API');
assert.match(config,/SUPABASE_ANON_KEY/,'only a public key should be in frontend configuration');
assert.doesNotMatch(config,/service_role|SERVICE_ROLE|qgccfpkvzrimwqmqrxwq\.supabase\.co/i,'no EU/service key in ZAGS configuration');
assert.match(siteConfig,/qgccfpkvzrimwqmqrxwq\.supabase\.co/,'the shared TATTOO PRICE/YBZ config must remain unchanged');
assert.match(html,/paymentsEnabled:false/,'real ZAGS payments must remain disabled');
assert.match(html,/\.\/config\.js/,'ZAGS must load its own regional config');
assert.match(html,/zags_v2_action/,'ZAGS UI must call the Beget API');
assert.equal((html.match(/emailRedirectTo:emailRedirectTo\(\)/g)||[]).length,2,'ZAGS sign-in and resend must return to ZAGS');
assert.match(html,/const emailRedirectTo=\(\)=>/,'ZAGS must build an app-specific auth return URL');
assert.match(html,/zags_invite/,'pending invitation must survive email sign-in');
assert.match(html,/authCallback&&!params\.has\('couple'\)/,'magic-link return must open the ZAGS account list');
assert.match(html,/Откройте ссылку из письма/,'sign-in instructions must explain email link/code behavior');
assert.match(homepage,/YBZ_ZAGS_CONFIG/,'public wedding news must use the Russian ZAGS endpoint');

for(const action of ['create','invitation','accept','cancel','renew','list','get','public','wish','delete_wish','photo','share','yes']) {
  assert.ok(sql.includes(`p_action='${action}'`) || sql.includes(`'${action}'`),`missing ZAGS action ${action}`);
}
for(const fn of ['zags_news_status','zags_set_news_consent','zags_public_news','zags_cancel_unaccepted','zags_payment']) {
  assert.match(sql,new RegExp(`FUNCTION public\\.${fn}\\(`),`missing RPC ${fn}`);
}
assert.match(sql,/REVOKE ALL ON FUNCTION public\.zags_payment\(text,jsonb\) FROM PUBLIC,anon,authenticated,service_role/);
assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.zags_payment\(text,jsonb\) TO service_role/);
assert.match(edge,/ZAGS_PAYMENTS_ENABLED/);
assert.match(edge,/verifiedState\(state, order, terminal\)/);
assert.match(edge,/zags_payment/);
assert.match(edge,/https:\/\/securepay\.tinkoff\.ru\/v2/);
assert.doesNotMatch(installer,/SUPABASE_SERVICE_ROLE_KEY\s*=/,'installer must not write or print server secrets');
cp.execFileSync('bash',['-n','zags/beget/install-cutover.sh']);
console.log('PASS: Russia-only ZAGS config, backend parity, server-only payment RPC, payment-off gate, and installer syntax');
