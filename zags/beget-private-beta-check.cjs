// Validate a production-hosted but server-allowlisted Beget pilot page.
// Does not contact any real backend or use real user credentials.
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const s=fs.readFileSync('zags/private-beget-beta.html','utf8');
const js=[...s.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
assert.equal(js.length,1);
assert.doesNotThrow(()=>new vm.Script(js[0],{filename:'private-beget-beta.html'}));
assert.match(js[0],/const PREVIEW_ENABLED=location\.protocol==='https:' && location\.hostname==='yabylzdes\.ru' && location\.pathname==='\/zags\/private-beget-beta\.html'/);
const key=/const ANON_KEY="([^"]+)";/.exec(js[0])?.[1];
assert.ok(key&&key.split('.').length===3,'must embed only public Supabase anon JWT');
const payload=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString('utf8'));
assert.equal(payload.role,'anon','must never publish a service-role JWT');
assert.doesNotMatch(js[0],/\/auth\/v1\/signup|shouldCreateUser\s*:\s*true|\/functions\/v1\/.*payment|\/v2\/Init/);
assert.doesNotMatch(js[0],/innerHTML\s*=|localStorage|sessionStorage|sb_secret_|service_role/);
assert.match(js[0],/\/rest\/v1\/rpc\/zags_v2_action/);
assert.match(js[0],/Authorization.*Bearer/);
assert.match(js[0],/location\.hash/);
assert.match(js[0],/history\.replaceState/);
assert.match(s,/<meta name="referrer" content="no-referrer">/);
assert.match(s,/<meta name="robots" content="noindex,nofollow,noarchive">/);
assert.match(s,/Официальный брак не регистрируется/);
console.log('PASS: private Beget beta is HTTPS/domain-bound, uses public anon only, no registration or payments');
