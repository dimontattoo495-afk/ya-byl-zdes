const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('zags/index.html','utf8');
const info=fs.readFileSync('zags/how-it-works.html','utf8');
const privacy=fs.readFileSync('zags/privacy.html','utf8');
const offer=fs.readFileSync('zags/offer.html','utf8');
const checks=[
 ["live checkout enabled",html.includes('paymentsEnabled:true')],
 ["test banner removed",!html.includes('ТЕСТОВАЯ ВЕРСИЯ')],
 ["not an official registry",html.includes('НЕ ГОСУДАРСТВЕННЫЙ ЗАГС')],
 ["prices disclosed",html.includes('149 <small>₽</small>')&&html.includes('299 <small>₽</small>')&&html.includes('499 <small>₽</small>')],
 ["public offer linked",html.includes('href="offer.html"')],
 ["paid-service terms published",offer.includes('Условия платной виртуальной церемонии')],
 ["seller details present",offer.includes('ИНН 500404099944')&&offer.includes('ОГРНИП 320508100007401')],
 ["consumer rights preserved",offer.includes('Права потребителя, установленные законом, настоящими условиями не ограничиваются')],
 ["refund path published",offer.includes('фактически понесённых расходов')&&offer.includes('dimontatoo@yandex.ru')],
 ["privacy policy linked",html.includes('href="privacy.html"')&&info.includes('href="privacy.html"')],
 ["Russia API disclosed",privacy.includes('api.smoke-tattoo.ru')&&privacy.includes('Beget в России')],
 ["payment processor disclosed",privacy.includes('Т‑Банк')&&privacy.includes('Чеки Т‑Бизнеса')],
 ["no false prelaunch claims",!info.includes('платежи выключены')&&!info.includes('не является действующей публичной офертой')],
 ["both-participant consent",info.includes('согласия обоих участников')],
 ["offer checkout acceptance",html.includes('Нажимая «Оплатить»')||html.includes('условиями платной услуги')],
];
for(const [name,pass] of checks)assert.ok(pass,name);
assert.ok((info.match(/<article>/g)||[]).length===4);
console.log('PASS: '+checks.length+' ZAGS live-launch, offer, privacy and consent checks');
