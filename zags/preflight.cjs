const fs = require('fs');
const assert = require('assert');
const html = fs.readFileSync('zags/index.html','utf8');
const config = fs.readFileSync('config.js','utf8');
const signupTemplate = fs.readFileSync('zags/templates/confirm-signup.html','utf8');
const loginTemplate = fs.readFileSync('zags/templates/magic-link-otp.html','utf8');
const checks = [
 ['Signup email includes OTP token', signupTemplate.includes('{{ .Token }}') && !signupTemplate.includes('{{ .ConfirmationURL }}')],
 ['Login email includes OTP token', loginTemplate.includes('{{ .Token }}') && !loginTemplate.includes('{{ .ConfirmationURL }}')],
 ['HTML language', /<html lang="ru">/.test(html)],
 ['Supabase SDK', html.includes('@supabase/supabase-js@2')],
 ['Shared config', html.includes('src="../config.js"')],
 ['OTP sending', html.includes('signInWithOtp({email')],
 ['OTP verification', html.includes('verifyOtp({email')],
 ['Six/eight digit OTP', html.includes('pattern="[0-9]{6,8}"') && html.includes('maxlength="8"')],
 ['Backend RPC', html.includes("sb.rpc('zags_action'")],
 ['Payment disabled', html.includes('paymentsEnabled:false')],
 ['Invitation requires login', html.includes('needAuth(showInvite)')],
 ['Supabase URL configured', config.includes('SUPABASE_URL')],
 ['No service-role key in page', !/service_role|sb_secret_/.test(html)],
 ['Test uses no actual payment init', !html.includes('paymentsEnabled:true')]
];
checks.forEach(([name, ok]) => console.log((ok?'PASS':'FAIL')+' '+name));
assert(checks.every(c=>c[1]), 'Static preflight failed');
