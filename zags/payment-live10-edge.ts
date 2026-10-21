// Separate endpoint; never replaces the existing create-payment or its webhook.
import {makeToken,sameToken,verifiedState} from './bank.mjs';
const env=(name:string)=>Deno.env.get(name)||'';
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
const base=env('SUPABASE_URL'),service=env('SUPABASE_SERVICE_ROLE_KEY');
const site=env('ZAGS_SITE_URL')||'https://yabylzdes.ru/zags/'; // https://.../ya-byl-zdes/zags/ (trailing slash)
// Reuse existing verified production bank credentials only for separately authorized ZAGS purchases.
const terminal=env('ZAGS_TBANK_TERMINAL_KEY')||env('TBANK_TERMINAL_KEY');
const password=env('ZAGS_TBANK_PASSWORD')||env('TBANK_PASSWORD');
const origin=site?new URL(site).origin:'';
const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json'}});}
async function db(action:string,data:Record<string,unknown>){const r=await fetch(base+'/rest/v1/rpc/zags_payment',{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({p_action:action,p_data:data}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Не удалось проверить заказ');return await r.json();}
async function bank(method:string,data:Record<string,unknown>){const payload={...data,TerminalKey:terminal};const r=await fetch('https://securepay.tinkoff.ru/v2/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,Token:await makeToken(payload,password)}),signal:AbortSignal.timeout(20000),client:tbankHttpClient});if(!r.ok)throw Error('Банк временно недоступен');const result=await r.json();if(result.Success!==true)throw Error('Банк не подтвердил операцию. Обратитесь в поддержку с номером заявления.');return result;}
async function reconcile(order:any){if(!order.payment_id)return false;const state=await bank('GetState',{PaymentId:order.payment_id});if(!verifiedState(state,order,terminal))throw Error('Параметры платежа не совпадают');await db('settle',{id:order.id,order_id:order.order_id,payment_id:order.payment_id,amount:state.Amount,status:state.Status});return state.Status==='CONFIRMED';}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 try{
  if(!site||!terminal||!password||!base||!service)return json({error:'Оплата свадеб ещё не подключена'},503);
  if(Number(req.headers.get('content-length')||0)>16000)return json({error:'Слишком большой запрос'},413);
  const text=await req.text();if(text.length>16000)return json({error:'Слишком большой запрос'},413);
  const body=JSON.parse(text);
  // T-Bank calls ?webhook=1; no user JWT, instead bank signature + GetState.
  if(new URL(req.url).searchParams.get('webhook')==='1'){
   if(body.TerminalKey!==terminal||!sameToken(body.Token,await makeToken(body,password)))return json({error:'Invalid signature'},403);
   const lookup=await fetch(base+'/rest/v1/zags_couples?order_id=eq.'+encodeURIComponent(String(body.OrderId))+'&select=id',{headers:{apikey:service,Authorization:'Bearer '+service},signal:AbortSignal.timeout(10000)});
   if(!lookup.ok)throw Error('Заказ пока недоступен');const rows=await lookup.json();if(rows.length!==1)throw Error('Заказ пока не найден');
   const order=await db('get',{id:rows[0].id});
   if(!order.payment_id)throw Error('Платёж ещё регистрируется');
   if(String(body.PaymentId)!==order.payment_id)throw Error('Платёж не совпадает');
   await reconcile(order);return new Response('OK',{headers:{'Content-Type':'text/plain'}});
  }
  if(req.headers.get('Origin')!==origin)return json({error:'Неверный источник запроса'},403);
  const authorization=req.headers.get('Authorization')||'';
  const auth=await fetch(base+'/auth/v1/user',{headers:{apikey:service,Authorization:authorization},signal:AbortSignal.timeout(10000)});
  if(!auth.ok)return json({error:'Войдите в аккаунт'},401);const user=await auth.json();
  if(!user.id||!user.email_confirmed_at)return json({error:'Подтвердите почту'},403);
  if(!['init','check','quote'].includes(body.action))return json({error:'Неизвестное действие'},400);
  const order=await db('get',{id:body.id});
  if(![order.creator,order.partner].includes(user.id))return json({error:'Нет доступа'},403);
  if(order.payment_status==='refunded')return json({error:'По этому заказу оформлен возврат'},409);
  // The quote is read-only. Client-provided price is NEVER used.
  if(body.action==='quote')return order.amount===1000?json({live_test:true,amount_kopecks:1000}):json({error:'Проверочный заказ на 10 ₽ не разрешён'},403);
  if(order.payment_id){const paid=await reconcile(order);if(paid)return json({paid:true});if(body.action==='check')return json({paid:false});if(order.payment_url)return json({url:order.payment_url});}
  if(body.action==='check')return json({paid:false});
  // Public sales remain disabled. Only DB-allowlisted orders with 1000 kopecks can use the live test.
  if(env('ZAGS_PAYMENTS_ENABLED')!=='true'&&order.amount!==1000)return json({error:'Оплата свадеб ещё не включена'},503);
  // Fiscal settings must be selected by the owner to match the existing merchant.
  const receiptMode=env('ZAGS_RECEIPT_MODE');
  if(!['bank','external'].includes(receiptMode))return json({error:'Нужно завершить настройку чеков'},503);
  if(receiptMode==='bank'&&(!env('ZAGS_TAXATION')||!env('ZAGS_TAX')))return json({error:'Нужно завершить настройку чеков'},503);
  const reserved=await db('claim',{id:body.id,user_id:user.id});
  if(reserved.amount!==order.amount)throw Error('Стоимость заказа изменилась. Пожалуйста, обновите страницу.');
  if(!reserved.fresh){if(reserved.payment_url)return json({url:reserved.payment_url});return json({error:'Заказ уже создаётся. Не оплачивайте повторно. Обновите страницу или обратитесь в поддержку.'},409);}
  const returnUrl=new URL(site);returnUrl.searchParams.set('couple',reserved.id);returnUrl.searchParams.set('payment','return');
  const payload:Record<string,unknown>={Amount:reserved.amount,OrderId:reserved.order_id,Description:'Шуточная виртуальная свадебная церемония',PayType:'O',Language:'ru',NotificationURL:base+'/functions/v1/zags-payment?webhook=1',SuccessURL:returnUrl.href,FailURL:returnUrl.href};
  if(receiptMode==='bank')payload.Receipt={Email:user.email,Taxation:env('ZAGS_TAXATION'),Items:[{Name:'Шуточная виртуальная свадебная церемония',Price:reserved.amount,Quantity:1,Amount:reserved.amount,Tax:env('ZAGS_TAX'),PaymentMethod:'full_payment',PaymentObject:'service'}]};
  const payment=await bank('Init',payload);
  if(!payment.PaymentId||!payment.PaymentURL||payment.Amount!==reserved.amount||String(payment.OrderId)!==reserved.order_id)throw Error('Некорректный ответ банка');
  const url=new URL(payment.PaymentURL);if(url.protocol!=='https:')throw Error('Некорректная ссылка банка');
  await db('attach',{id:reserved.id,order_id:reserved.order_id,payment_id:String(payment.PaymentId),url:url.href});
  return json({url:url.href});
 }catch(err){return json({error:err instanceof Error?err.message:'Временная ошибка. Попробуйте позже.'},503);}
});
