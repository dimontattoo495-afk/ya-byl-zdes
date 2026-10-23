'use strict';
const assert=require('node:assert/strict');
(async()=>{
  const {makeToken,sameToken,verifiedState}=await import('../zags/beget/functions/zags-payment/bank.mjs');
  const payload={TerminalKey:'test-terminal',Amount:1000,OrderId:'order-1'};
  const token=await makeToken(payload,'password');
  assert.match(token,/^[a-f0-9]{64}$/);
  assert.equal(sameToken(token,token),true);
  assert.equal(sameToken(token,token.toUpperCase()),false);
  assert.equal(sameToken(token,'short'),false);
  const order={payment_id:'123',order_id:'order-1',amount:1000};
  assert.equal(verifiedState({Success:true,TerminalKey:'test-terminal',PaymentId:123,OrderId:'order-1',Amount:1000},order,'test-terminal'),true);
  assert.equal(verifiedState({Success:true,TerminalKey:'other',PaymentId:123,OrderId:'order-1',Amount:1000},order,'test-terminal'),false);
  assert.equal(verifiedState({Success:true,TerminalKey:'test-terminal',PaymentId:123,OrderId:'order-1',Amount:1},order,'test-terminal'),false);
  console.log('PASS: T-Bank token comparison and server-state matching');
})().catch(err=>{console.error(err);process.exit(1)});
