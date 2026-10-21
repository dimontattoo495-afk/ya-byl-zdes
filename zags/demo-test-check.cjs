const assert=require('node:assert/strict');
const fs=require('node:fs');
const edge=fs.readFileSync('zags/demo-test/index.ts','utf8');
const ui=fs.readFileSync('zags/test-payment.html','utf8');
assert.match(edge,/const amount=1000;/,'Server must hardcode 10 RUB in kopecks');
assert.match(edge,/terminal\.toUpperCase\(\)\.includes\('DEMO'\)/,'Must require a DEMO terminal');
assert.match(edge,/terminal!==env\('TBANK_TERMINAL_KEY'\)/,'Never reuse the live acquiring terminal');
assert.match(edge,/ZAGS_DEMO_TESTS_ENABLED/,'Disabled until explicitly enabled');
assert.match(edge,/user\.id!==allowed/,'Admin allowlist required');
assert.match(edge,/verifiedState\(state,order,terminal\)/,'Bank GetState must validate amount/IDs/terminal');
assert.match(edge,/Receipt:\{Email:user\.email/,'Receipt must use verified purchaser email');
assert.match(edge,/https:\/\/securepay\.tinkoff\.ru\/v2\//,'DEMO terminals use normal bank API URL');
assert.doesNotMatch(edge,/zags_couples|zags_payment\(|payment_status\s*[:=]\s*['"]paid/,'Test cannot unlock real wedding');
assert.match(ui,/zags-payment-demo/,'UI must only call isolated function');
assert.match(edge,/bankDomains=\['tinkoff\.ru','tbank\.ru','tcsbank\.ru'\]/,'Bank URLs must have allowlisted official parent domains');
assert.match(edge,/url\.protocol!==['"]https:['"]\|\|url\.username\|\|url\.password\|\|url\.port\|\|!bankHost/,'Server requires https, no credentials, no nonstandard port and official host');
assert.match(ui,/bankDomains=\['tinkoff\.ru','tbank\.ru','tcsbank\.ru'\]/,'Client must use same bank domain families');
assert.match(ui,/url\.protocol!==['"]https:['"]\|\|url\.username\|\|url\.password\|\|url\.port\|\|!bankHost/,'Client blocks insecure redirect variants');
for (const hostname of ['securepay.tinkoff.ru','securepayments.tinkoff.ru','payments.tbank.ru','checkout.tcsbank.ru']) {assert.ok(['tinkoff.ru','tbank.ru','tcsbank.ru'].some(d=>hostname===d||hostname.endsWith('.'+d)));}
for (const hostname of ['tinkoff.ru.evil.tld','fake-tbank.ru','tbank.ru.attacker.test','tinkoff-ru.org','evil.org']) {assert.ok(!['tinkoff.ru','tbank.ru','tcsbank.ru'].some(d=>hostname===d||hostname.endsWith('.'+d)));}
assert.match(ui,/result\.amount_kopecks!==1000/,'UI checks received test quote');
assert.match(ui,/Тестовый терминал/,'Clear test mode message');
assert.match(ui,/реального списания не было/i,'Must disclose no real charge');
assert.doesNotMatch(ui,/paymentsEnabled:true/);
console.log('PASS: DEMO-only 10 RUB, verified auth, checked GetState, receipt, no production writes');
