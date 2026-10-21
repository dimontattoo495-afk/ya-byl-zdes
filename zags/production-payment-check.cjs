const assert=require('node:assert/strict');
const fs=require('node:fs');
const src=fs.readFileSync('zags/production-payment/index.ts','utf8');
const bank=fs.readFileSync('zags/production-payment/bank.mjs','utf8');
const page=fs.readFileSync('zags/index.html','utf8');
const must=[
 ['zags-payment separate',src.includes('/functions/v1/zags-payment?webhook=1')],
 ['real merchant only',src.includes("terminal.toUpperCase().includes('DEMO')")],
 ['server feature flag',src.includes("env('ZAGS_PAYMENTS_ENABLED')!=='true'")],
 ['explicit merchant opt-in',src.includes("ZAGS_USE_MAIN_TBANK_CREDENTIALS")],
 ['merchant category not autoapproved',!src.includes("ZAGS_PAYMENTS_ENABLED=true")],
 ['HTTPS only',src.includes("url.protocol==='https:'")],
 ['exact pay.tbank-online.com',src.includes("url.hostname==='pay.tbank-online.com'")],
 ['reject url credentials',src.includes('!url.username&&!url.password&&!url.port')],
 ['bank CA trust',src.includes('RUSSIAN_TRUSTED_ROOT_CA')&&src.includes('tbankHttpClient')],
 ['direct acquiring receipt',src.includes("receiptMode!=='bank'")&&src.includes("payload.Receipt=")],
 ['cash register tax',src.includes('ZAGS_TAXATION')&&src.includes('ZAGS_TAX')],
 ['bank receipt correctly itemized',src.includes("PaymentObject:'service'")&&src.includes("PaymentMethod:'full_payment'")],
 ['DB-derived amount',src.includes('Amount:reserved.amount')&&src.includes('Price:reserved.amount')],
 ['no 10rub override',!src.includes('const amount=1000')&&!src.includes('payment_amount_kopecks')],
 ['server auth mandatory',src.includes("'/auth/v1/user'")&&src.includes('user.email_confirmed_at')],
 ['pair authorization',src.includes('[order.creator,order.partner].includes(user.id)')],
 ['bank callback token',src.includes('sameToken(body.Token,await makeToken(body,password))')],
 ['refund status verification',src.includes('verifiedPaymentStatus(state,order)')],
 ['return status updates original paid amount',src.includes('amount:order.amount,status:state.Status')],
 ['refund checkout blocked',src.includes("Платёж по заявлению возвращён")],
 ['bank signatures',bank.includes('crypto.subtle.digest')&&bank.includes('sameToken')],
 ['public frontend remains disabled',page.includes('paymentsEnabled:false')],
 ['public service disclaimer',page.includes('Не является официальным документом')]
];
for(const [name,pass] of must)assert.ok(pass,'Payment release review failed: '+name);
console.log('PASS: isolated production payment stage: '+must.length+' safety assertions, no deployment, no real charge');
