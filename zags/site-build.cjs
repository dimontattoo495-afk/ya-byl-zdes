// Assemble an isolated public HTTPS preview, without modifying the production Pages site.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const source=fs.readFileSync('zags/index.html','utf8');
const config=fs.readFileSync('config.js','utf8');
const origin='https://dimontattoo495-afk.github.io/ya-byl-zdes/';
const dst='dist/zags-preview';
assert(source.includes('<script src="../config.js">'));
assert(source.includes('paymentsEnabled:false'));
assert(/SUPABASE_ANON_KEY/.test(config));
let html=source
 .replace('<script src="../config.js">','<script>'+config+'</script>')
 .replaceAll('../index.html',origin)
 .replaceAll('../contacts.html',origin+'contacts.html')
 .replaceAll('../privacy.html',origin+'privacy.html')
 .replace('<head>','<head><meta name="robots" content="noindex,nofollow,noarchive">')
 .replace('<title>Виртуальный ЗАГС · Я был здесь</title>','<title>ТЕСТ · Виртуальный ЗАГС · Я был здесь</title>')
 .replace('<body>','<body><div style="position:sticky;top:0;z-index:9999;background:#fce8cc;color:#533c20;padding:10px;text-align:center;font:600 14px Arial,sans-serif">ТЕСТОВАЯ ВЕРСИЯ · ПЛАТЕЖИ ОТКЛЮЧЕНЫ · НЕ ГОСУДАРСТВЕННАЯ УСЛУГА</div>');
assert(!html.includes('src="../config.js"'));
assert(!html.includes('href="../'));
assert(html.includes('paymentsEnabled:false'));
fs.mkdirSync(dst,{recursive:true});
fs.writeFileSync(path.join(dst,'index.html'),html,'utf8');
fs.writeFileSync(path.join(dst,'robots.txt'),'User-agent: *\nDisallow: /\n','utf8');
console.log('PASS: standalone hosting build; '+Buffer.byteLength(html)+' bytes, published payment UI off');
