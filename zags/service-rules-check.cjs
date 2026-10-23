const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('zags/index.html','utf8');
const info=fs.readFileSync('zags/how-it-works.html','utf8');
const privacy=fs.readFileSync('zags/privacy.html','utf8');
const required=[
 ["payments off",html.includes('paymentsEnabled:false')],
 ["page not indexed",info.includes('noindex,nofollow,noarchive')],
 ["not an offer",info.includes('не является действующей публичной офертой')],
 ["not state registry",info.includes('не регистрирует настоящий брак')],
 ["not accepting money",info.includes('Реальная оплата церемонии и выдача оплаченных свидетельств выключены')],
 ["Russian ZAGS data location disclosed",info.includes('сервере Beget в России')],
 ["operator contacts linked",info.includes('../contacts.html')],
 ["legacy EU test data disclosed",privacy.includes('европейском проекте Supabase')],
 ["no real charge",info.includes('сейчас они не оплачиваются')],
 ["both-person approval",info.includes('обоих')],
 ["prelaunch rule link",html.includes('href="how-it-works.html"')],
 ["create consent has information",html.includes('Хочу пригласить партнёра на шуточную церемонию. ${disclaimer} Ознакомлен(а)')],
 ["accept consent has information",html.includes('Я согласен на шуточную виртуальную свадьбу. ${disclaimer} Ознакомлен(а)')],
 ["no change to paid ZAGS",html.includes("if(!cfg.paymentsEnabled)throw Error('Оплата свадеб ещё не подключена")],
 ["no active payment promise",!info.includes('Реальные платежи принимаются')],
];
for(const [name,passed] of required)assert.ok(passed,name);
assert.match(info,/<a href="privacy\.html">/);
assert.match(info,/<a href="\.\.\/contacts\.html">/);
assert.match(html,/<footer>.*?<a href="how-it-works\.html">/s);
assert.match(info,/<table class="prices">/);
assert.ok((info.match(/<article>/g)||[]).length===4);
console.log('PASS: 15 prelaunch information, privacy, user-consent and payment-lock assertions');
