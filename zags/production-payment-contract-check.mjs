import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeToken,sameToken,verifiedState} from './production-payment/bank.mjs';

const source=fs.readFileSync('zags/production-payment/index.ts','utf8');
const fn=source.match(/function verifiedPaymentStatus\(state:any,order:any\)\{[\s\S]*?\n\}/)?.[0];
assert.ok(fn,'Production GetState validator must be present');
const terminal='live-test-fixture';
const verify=new Function('verifiedState','terminal',fn.replace('state:any,order:any','state,order')+'; return verifiedPaymentStatus;')(verifiedState,terminal);
const order={order_id:'22222222-2222-4222-8222-222222222222',payment_id:'12345678',amount:14900};
const response=(status,amount)=>({Success:true,TerminalKey:terminal,OrderId:order.order_id,PaymentId:order.payment_id,Status:status,Amount:amount});
assert.equal(verify(response('CONFIRMED',14900),order),true,'Exact confirmed amount must pass');
assert.equal(verify(response('CONFIRMED',14800),order),false,'Never undercharge a completed order');
assert.equal(verify(response('AUTHORIZED',14900),order),true,'Authorized state still identity-checked');
assert.equal(verify(response('REFUNDED',0),order),true,'Full refund may have zero remaining balance');
assert.equal(verify(response('REFUNDED',14900),order),true,'Full refund may preserve original amount');
assert.equal(verify(response('PARTIAL_REFUNDED',7000),order),true,'Partial refund may change remaining amount');
assert.equal(verify(response('REVERSED',0),order),true,'Reversal has verified transaction');
assert.equal(verify(response('REFUNDED',14901),order),false,'Refund balance cannot exceed initial charge');
assert.equal(verify(response('REFUNDED',-1),order),false,'Negative refund balance rejected');
assert.equal(verify(response('REFUNDED',149.5),order),false,'Non-integer kopecks rejected');
assert.equal(verify({...response('REFUNDED',0),TerminalKey:'DEMO'},order),false,'DEMO response rejected');
assert.equal(verify({...response('REFUNDED',0),OrderId:'other-order'},order),false,'Wrong order rejected');
assert.equal(verify({...response('REFUNDED',0),PaymentId:'other-payment'},order),false,'Wrong payment rejected');
assert.equal(verify({...response('REFUNDED',0),Success:false},order),false,'Unsuccessful bank response rejected');

const validCheckout=new Function(source.match(/const trustedCheckoutHosts=\[[^\n]+\];/)?.[0]+'\n'+source.match(/const validCheckout=\(url:URL\)=>[\s\S]*?\);/)?.[0]?.replace('(url:URL)','(url)')+'\nreturn validCheckout;')();
for(const url of ['https://pay.tbank-online.com/path','https://securepay.tinkoff.ru/','https://service.tbank.ru/pay'])assert.ok(validCheckout(new URL(url)),url);
for(const url of ['http://pay.tbank-online.com','https://pay.tbank-online.com.evil.invalid/','https://fake-tbank.ru/','https://evil.invalid/','https://x:y@pay.tbank-online.com/','https://pay.tbank-online.com:8443/'])assert.ok(!validCheckout(new URL(url)),url);

const payload={Amount:14900,OrderId:order.order_id,TerminalKey:terminal,Receipt:{Email:'fictional@example.test',Items:[{Amount:14900}]},Description:'Фиктивная тестовая операция'};
const signed=await makeToken(payload,'nonsecret-test-password');
assert.match(signed,/^[a-f0-9]{64}$/);
assert.ok(sameToken(signed,await makeToken(payload,'nonsecret-test-password')),'Deterministic SHA256 token');
assert.ok(!sameToken(signed,await makeToken(payload,'wrong password')),'Wrong secret invalid');
assert.ok(!sameToken(signed.slice(0,63)+'X',signed),'Tampered hash rejected');
assert.ok(!sameToken(undefined,signed),'Missing token rejected');
const changed={...payload,Amount:29900};
assert.notEqual(signed,await makeToken(changed,'nonsecret-test-password'),'Bank signature covers payment amount');
assert.equal(signed,await makeToken({...payload,Receipt:{Changed:'object properties are not part of token algorithm'}},'nonsecret-test-password'),'Bank token excludes nested objects');

assert.match(source,/if\(env\('ZAGS_PAYMENTS_ENABLED'\)!=='true'\)/,'Payment creation server-disabled by default');
assert.match(source,/terminal\.toUpperCase\(\)\.includes\('DEMO'\)/,'Cannot deploy live processor on DEMO terminal');
assert.match(source,/\['init','check'\]\.includes\(body\.action\)/,'No user-initiated charge/refund action');
assert.match(source,/if\(!\[order\.creator,order\.partner\]\.includes\(user\.id\)\)/,'Order access restricted to participants');
assert.match(source,/sameToken\(body\.Token,await makeToken\(body,password\)\)/,'Webhook bank signature mandatory');
assert.match(source,/amount:order\.amount,status:state\.Status/,'Refund settlement uses original order amount');
assert.match(source,/receiptMode!=='bank'/,'Bank receipt must be configured');
console.log('PASS: contract tests for bank validation, hashes, identity, refund and disabled live payments');
