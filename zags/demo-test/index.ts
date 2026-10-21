// Isolated bank DEMO terminal smoke test. DOES NOT mark any real ZAGS pair as paid.
// No production credentials are ever accepted and the price is always 1000 kopecks.
import { makeToken, verifiedState } from './bank.mjs';
const RUSSIAN_TRUSTED_ROOT_CA = `-----BEGIN CERTIFICATE-----
MIIFwjCCA6qgAwIBAgICEAAwDQYJKoZIhvcNAQELBQAwcDELMAkGA1UEBhMCUlUx
PzA9BgNVBAoMNlRoZSBNaW5pc3RyeSBvZiBEaWdpdGFsIERldmVsb3BtZW50IGFu
ZCBDb21tdW5pY2F0aW9uczEgMB4GA1UEAwwXUnVzc2lhbiBUcnVzdGVkIFJvb3Qg
Q0EwHhcNMjIwMzAxMjEwNDE1WhcNMzIwMjI3MjEwNDE1WjBwMQswCQYDVQQGEwJS
VTE/MD0GA1UECgw2VGhlIE1pbmlzdHJ5IG9mIERpZ2l0YWwgRGV2ZWxvcG1lbnQg
YW5kIENvbW11bmljYXRpb25zMSAwHgYDVQQDDBdSdXNzaWFuIFRydXN0ZWQgUm9v
dCBDQTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAMfFOZ8pUAL3+r2n
qqE0Zp52selXsKGFYoG0GM5bwz1bSFtCt+AZQMhkWQheI3poZAToYJu69pHLKS6Q
XBiwBC1cvzYmUYKMYZC7jE5YhEU2bSL0mX7NaMxMDmH2/NwuOVRj8OImVa5s1F4U
zn4Kv3PFlDBjjSjXKVY9kmjUBsXQrIHeaqmUIsPIlNWUnimXS0I0abExqkbdrXbX
YwCOXhOO2pDUx3ckmJlCMUGacUTnylyQW2VsJIyIGA8V0xzdaeUXg0VZ6ZmNUr5Y
Ber/EAOLPb8NYpsAhJe2mXjMB/J9HNsoFMBFJ0lLOT/+dQvjbdRZoOT8eqJpWnVD
U+QL/qEZnz57N88OWM3rabJkRNdU/Z7x5SFIM9FrqtN8xewsiBWBI0K6XFuOBOTD
4V08o4TzJ8+Ccq5XlCUW2L48pZNCYuBDfBh7FxkB7qDgGDiaftEkZZfApRg2E+M9
G8wkNKTPLDc4wH0FDTijhgxR3Y4PiS1HL2Zhw7bD3CbslmEGgfnnZojNkJtcLeBH
BLa52/dSwNU4WWLubaYSiAmA9IUMX1/RpfpxOxd4Ykmhz97oFbUaDJFipIggx5sX
ePAlkTdWnv+RWBxlJwMQ25oEHmRguNYf4Zr/Rxr9cS93Y+mdXIZaBEE0KS2iLRqa
OiWBki9IMQU4phqPOBAaG7A+eP8PAgMBAAGjZjBkMB0GA1UdDgQWBBTh0YHlzlpf
BKrS6badZrHF+qwshzAfBgNVHSMEGDAWgBTh0YHlzlpfBKrS6badZrHF+qwshzAS
BgNVHRMBAf8ECDAGAQH/AgEEMA4GA1UdDwEB/wQEAwIBhjANBgkqhkiG9w0BAQsF
AAOCAgEAALIY1wkilt/urfEVM5vKzr6utOeDWCUczmWX/RX4ljpRdgF+5fAIS4vH
tmXkqpSCOVeWUrJV9QvZn6L227ZwuE15cWi8DCDal3Ue90WgAJJZMfTshN4OI8cq
W9E4EG9wglbEtMnObHlms8F3CHmrw3k6KmUkWGoa+/ENmcVl68u/cMRl1JbW2bM+
/3A+SAg2c6iPDlehczKx2oa95QW0SkPPWGuNA/CE8CpyANIhu9XFrj3RQ3EqeRcS
AQQod1RNuHpfETLU/A2gMmvn/w/sx7TB3W5BPs6rprOA37tutPq9u6FTZOcG1Oqj
C/B7yTqgI7rbyvox7DEXoX7rIiEqyNNUguTk/u3SZ4VXE2kmxdmSh3TQvybfbnXV
4JbCZVaqiZraqc7oZMnRoWrXRG3ztbnbes/9qhRGI7PqXqeKJBztxRTEVj8ONs1d
WN5szTwaPIvhkhO3CO5ErU2rVdUr89wKpNXbBODFKRtgxUT70YpmJ46VVaqdAhOZ
D9EUUn4YaeLaS8AjSF/h7UkjOibNc4qVDiPP+rkehFWM66PVnP1Msh93tc+taIfC
EYVMxjh8zNbFuoc7fzvvrFILLe7ifvEIUqSVIC/AzplM/Jxw7buXFeGP1qVCBEHq
391d/9RAfaZ12zkwFsl+IKwE/OZxW8AHa9i1p4GO0YSNuczzEm4=
-----END CERTIFICATE-----`;

const RUSSIAN_TRUSTED_SUB_CA = `-----BEGIN CERTIFICATE-----
MIIHQjCCBSqgAwIBAgICEAIwDQYJKoZIhvcNAQELBQAwcDELMAkGA1UEBhMCUlUx
PzA9BgNVBAoMNlRoZSBNaW5pc3RyeSBvZiBEaWdpdGFsIERldmVsb3BtZW50IGFu
ZCBDb21tdW5pY2F0aW9uczEgMB4GA1UEAwwXUnVzc2lhbiBUcnVzdGVkIFJvb3Qg
Q0EwHhcNMjIwMzAyMTEyNTE5WhcNMjcwMzA2MTEyNTE5WjBvMQswCQYDVQQGEwJS
VTE/MD0GA1UECgw2VGhlIE1pbmlzdHJ5IG9mIERpZ2l0YWwgRGV2ZWxvcG1lbnQg
YW5kIENvbW11bmljYXRpb25zMR8wHQYDVQQDDBZSdXNzaWFuIFRydXN0ZWQgU3Vi
IENBMIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA9YPqBKOk19NFymrE
wehzrhBEgT2atLezpduB24mQ7CiOa/HVpFCDRZzdxqlh8drku408/tTmWzlNH/br
HuQhZ/miWKOf35lpKzjyBd6TPM23uAfJvEOQ2/dnKGGJbsUo1/udKSvxQwVHpVv3
S80OlluKfhWPDEXQpgyFqIzPoxIQTLZ0deirZwMVHarZ5u8HqHetRuAtmO2ZDGQn
vVOJYAjls+Hiueq7Lj7Oce7CQsTwVZeP+XQx28PAaEZ3y6sQEt6rL06ddpSdoTMp
BnCqTbxW+eWMyjkIn6t9GBtUV45yB1EkHNnj2Ex4GwCiN9T84QQjKSr+8f0psGrZ
vPbCbQAwNFJjisLixnjlGPLKa5vOmNwIh/LAyUW5DjpkCx004LPDuqPpFsKXNKpa
L2Dm6uc0x4Jo5m+gUTVORB6hOSzWnWDj2GWfomLzzyjG81DRGFBpco/O93zecsIN
3SL2Ysjpq1zdoS01CMYxie//9zWvYwzI25/OZigtnpCIrcd2j1Y6dMUFQAzAtHE+
qsXflSL8HIS+IJEFIQobLlYhHkoE3avgNx5jlu+OLYe0dF0Ykx1PGNjbwqvTX37R
Cn32NMjlotW2QcGEZhDKj+3urZizp5xdTPZitA+aEjZM/Ni71VOdiOP0igbw6asZ
2fxdozZ1TnSSYNYvNATwthNmZysCAwEAAaOCAeUwggHhMBIGA1UdEwEB/wQIMAYB
Af8CAQAwDgYDVR0PAQH/BAQDAgGGMB0GA1UdDgQWBBTR4XENCy2BTm6KSo9MI7NM
XqtpCzAfBgNVHSMEGDAWgBTh0YHlzlpfBKrS6badZrHF+qwshzCBxwYIKwYBBQUH
AQEEgbowgbcwOwYIKwYBBQUHMAKGL2h0dHA6Ly9yb3N0ZWxlY29tLnJ1L2NkcC9y
b290Y2Ffc3NsX3JzYTIwMjIuY3J0MDsGCCsGAQUFBzAChi9odHRwOi8vY29tcGFu
eS5ydC5ydS9jZHAvcm9vdGNhX3NzbF9yc2EyMDIyLmNydDA7BggrBgEFBQcwAoYv
aHR0cDovL3JlZXN0ci1wa2kucnUvY2RwL3Jvb3RjYV9zc2xfcnNhMjAyMi5jcnQw
gbAGA1UdHwSBqDCBpTA1oDOgMYYvaHR0cDovL3Jvc3RlbGVjb20ucnUvY2RwL3Jv
b3RjYV9zc2xfcnNhMjAyMi5jcmwwNaAzoDGGL2h0dHA6Ly9jb21wYW55LnJ0LnJ1
L2NkcC9yb290Y2Ffc3NsX3JzYTIwMjIuY3JsMDWgM6Axhi9odHRwOi8vcmVlc3Ry
LXBraS5ydS9jZHAvcm9vdGNhX3NzbF9yc2EyMDIyLmNybDANBgkqhkiG9w0BAQsF
AAOCAgEARBVzZls79AdiSCpar15dA5Hr/rrT4WbrOfzlpI+xrLeRPrUG6eUWIW4v
Sui1yx3iqGLCjPcKb+HOTwoRMbI6ytP/ndp3TlYua2advYBEhSvjs+4vDZNwXr/D
anbwIWdurZmViQRBDFebpkvnIvru/RpWud/5r624Wp8voZMRtj/cm6aI9LtvBfT9
cfzhOaexI/99c14dyiuk1+6QhdwKaCRTc1mdfNQmnfWNRbfWhWBlK3h4GGE9JK33
Gk8ZS8DMrkdAh0xby4xAQ/mSWAfWrBmfzlOqGyoB1U47WTOeqNbWkkoAP2ys94+s
Jg4NTkiDVtXRF6nr6fYi0bSOvOFg0IQrMXO2Y8gyg9ARdPJwKtvWX8VPADCYMiWH
h4n8bZokIrImVKLDQKHY4jCsND2HHdJfnrdL2YJw1qFskNO4cSNmZydw0Wkgjv9k
F+KxqrDKlB8MZu2Hclph6v/CZ0fQ9YuE8/lsHZ0Qc2HyiSMnvjgK5fDc3TD4fa8F
E8gMNurM+kV8PT8LNIM+4Zs+LKEV8nqRWBaxkIVJGekkVKO8xDBOG/aN62AZKHOe
GcyIdu7yNMMRihGVZCYr8rYiJoKiOzDqOkPkLOPdhtVlgnhowzHDxMHND/E2WA5p
ZHuNM/m0TXt2wTTPL7JH2YC0gPz/BvvSzjksgzU5rLbRyUKQkgU=
-----END CERTIFICATE-----`;

const tbankHttpClient = Deno.createHttpClient({
  caCerts: [
    RUSSIAN_TRUSTED_ROOT_CA,
    RUSSIAN_TRUSTED_SUB_CA,
  ],
});
const env=(key:string)=>Deno.env.get(key)||'';
const origin='https://yabylzdes.ru';
const cors={ 'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin' };
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const terminal=env('ZAGS_DEMO_TERMINAL_KEY').trim(), password=env('ZAGS_DEMO_TERMINAL_PASSWORD');
const allowed=env('ZAGS_DEMO_OPERATOR_ID').trim();
const apiBase='https://securepay.tinkoff.ru/v2/';
const amount=1000;
const validUUID=(x:unknown)=>typeof x==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
// T-Bank tests 7 and 8 passed on 2026-10-21. Prevent new DEMO charges
// independently of potentially stale project secrets. Reopen only by a reviewed code change.
const DEMO_TEST_FINISHED=true;
function ready(){
 return !DEMO_TEST_FINISHED && env('ZAGS_DEMO_TESTS_ENABLED')==='true' &&
  !!terminal && terminal.toUpperCase().includes('DEMO') &&
  terminal!==env('TBANK_TERMINAL_KEY') &&
  !!password && validUUID(allowed) &&
  ['osn','usn_income','usn_income_outcome','esn','patent'].includes(env('ZAGS_DEMO_TAXATION')) &&
  ['none','vat0','vat5','vat7','vat10','vat22','vat105','vat107','vat110','vat122'].includes(env('ZAGS_DEMO_TAX'));
}
async function bank(method:string, payload:Record<string,unknown>){
 const params={...payload,TerminalKey:terminal};
 const r=await fetch(apiBase+method,{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...params,Token:await makeToken(params,password)}),
  signal:AbortSignal.timeout(20000),client:tbankHttpClient
 });
 const response=await r.json();
 if(!r.ok||response.Success!==true)throw new Error('Т-Банк не принял тестовую операцию');
 return response;
}
// GetState.Amount can represent the remaining refundable balance after Cancel.
// The original CONFIRMED payment is always verified against 1000 kopecks before Cancel.
// After a full refund, only an exact matching terminal, order, payment ID and
// an allowed post-refund status can be accepted; refunded balance may be zero.
function verifiedDemoState(state:any, order:any){
 if(state?.Success!==true||state.TerminalKey!==terminal||
    String(state.PaymentId)!==String(order.payment_id)||
    String(state.OrderId)!==String(order.order_id))return false;
 if(state.Status==='REFUNDED'||state.Status==='REFUNDING'){
  // The bank can return a residual amount or omit Amount after a full Cancel.
  // Payment amount was strictly verified at CONFIRMED, before any Cancel call.
  return state.Amount==null||
    (Number.isSafeInteger(state.Amount)&&state.Amount>=0&&state.Amount<=order.amount);
 }
 return verifiedState(state,order,terminal);
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 if(req.headers.get('Origin')!==origin)return reply({error:'Запрос не с сайта'},403);
 if(Number(req.headers.get('Content-Length')||0)>4096)return reply({error:'Слишком большой запрос'},413);
 if(!ready())return reply({error:'Тестовый терминал ЗАГСа пока не настроен'},503);
 let body:Record<string,unknown>;
 try{const t=await req.text();if(t.length>4096)throw new Error();body=JSON.parse(t);}catch{return reply({error:'Некорректный запрос'},400)}
 const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
 if(!token)return reply({error:'Войдите в аккаунт ЗАГСа'},401);
 const base=env('SUPABASE_URL'),service=env('SUPABASE_SERVICE_ROLE_KEY');
 if(!base||!service)return reply({error:'Сервис временно недоступен'},503);
 try{
  const userReq=await fetch(base+'/auth/v1/user',{headers:{apikey:service,Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});
  if(!userReq.ok)return reply({error:'Авторизация не подтверждена'},401);
  const user=await userReq.json();
  if(user.id!==allowed||!user.email_confirmed_at)return reply({error:'Только владелец может тестировать оплату'},403);
  if(body.action==='init'){
   const order=crypto.randomUUID();
   const checkout=new URL('https://yabylzdes.ru/zags/test-payment.html');
   checkout.searchParams.set('return','1');
   const payload:Record<string,unknown>={
    Amount:amount,OrderId:order,Description:'ТЕСТ: шуточная виртуальная свадебная церемония',
    PayType:'O',Language:'ru',SuccessURL:checkout.href,FailURL:checkout.href,
    Receipt:{Email:user.email,Taxation:env('ZAGS_DEMO_TAXATION'),
     Items:[{Name:'ТЕСТ: виртуальная свадебная церемония',Price:amount,Quantity:1,Amount:amount,
      Tax:env('ZAGS_DEMO_TAX'),PaymentMethod:'full_payment',PaymentObject:'service'}]}
   };
   const response=await bank('Init',payload);
   if(String(response.OrderId)!==order||Number(response.Amount)!==amount||!response.PaymentId||!response.PaymentURL)
    return reply({error:'Неверные параметры ответа банка'},502);
   const url=new URL(String(response.PaymentURL));
   const bankDomains=['tinkoff.ru','tbank.ru','tcsbank.ru'];
   const bankHost=url.hostname==='pay.tbank-online.com'||bankDomains.some(d=>url.hostname===d||url.hostname.endsWith('.'+d));
   if(url.protocol!=='https:'||url.username||url.password||url.port||!bankHost){
     console.warn('ZAGS DEMO: bank checkout rejected: hostname',url.hostname);
     return reply({error:'Неподтверждённый адрес платёжной формы Т-Банка: '+url.hostname},502);
   }
   return reply({order_id:order,payment_id:String(response.PaymentId),amount_kopecks:amount,checkout_url:url.href});
  }
  if(body.action==='check'||body.action==='refund'){
   if(!validUUID(body.order_id)||typeof body.payment_id!=='string'||!/^\d{1,30}$/.test(body.payment_id))
    return reply({error:'Неверный идентификатор платежа'},400);
   const state=await bank('GetState',{PaymentId:body.payment_id});
   const order={payment_id:body.payment_id,order_id:body.order_id,amount};
   if(!verifiedDemoState(state,order))return reply({error:'Сумма или реквизиты платежа не совпадают'},409);
   if(body.action==='refund'){
    if(state.Status==='REFUNDED')return reply({status:'REFUNDED',refunded:true,confirmed:false,amount_kopecks:amount,demo:true,real_money_charged:false});
    if(state.Status==='REFUNDING')return reply({status:'REFUNDING',refunded:false,confirmed:false,amount_kopecks:amount,demo:true,real_money_charged:false});
    if(state.Status!=='CONFIRMED')return reply({error:'Возврат возможен только после подтверждённой тестовой оплаты'},409);
    // Full refund: bank automatically generates the return receipt from the original Init Receipt.
    // Do not pass Receipt or Amount for a complete Cancel operation (T-Bank /v2/Cancel).
    await bank('Cancel',{PaymentId:body.payment_id});
    const after=await bank('GetState',{PaymentId:body.payment_id});
    if(!verifiedDemoState(after,order)){
     console.warn('ZAGS DEMO refund GetState shape mismatch',{
      status:String(after.Status||''),amount:Number.isSafeInteger(after.Amount)?after.Amount:'not-integer',
      terminal_ok:after.TerminalKey===terminal,order_ok:String(after.OrderId)===String(order.order_id),
      payment_ok:String(after.PaymentId)===String(order.payment_id)
     });
     return reply({error:'Не удалось проверить реквизиты тестового возврата'},409);
    }
    return reply({status:after.Status,refunded:after.Status==='REFUNDED',confirmed:false,amount_kopecks:amount,demo:true,real_money_charged:false});
   }
   return reply({status:state.Status,confirmed:state.Status==='CONFIRMED',refunded:state.Status==='REFUNDED',amount_kopecks:amount,
    demo:true,real_money_charged:false});
  }
  return reply({error:'Неизвестное действие'},400);
 }catch(e){console.error('ZAGS DEMO payment error',e instanceof Error?e.message:'unknown');return reply({error:'Не удалось получить подтверждение тестового платежа. Повторите проверку позже.'},502)}
});
