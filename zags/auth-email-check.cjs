const fs = require('node:fs');
const assert = require('node:assert/strict');

const page = fs.readFileSync('zags/index.html', 'utf8');
const confirmation = fs.readFileSync('zags/email-templates/confirmation.html', 'utf8');
const magicLink = fs.readFileSync('zags/email-templates/magic-link.html', 'utf8');

assert.equal((page.match(/signInWithOtp\\(/g) || []).length, 2, 'signup and resend should both request an OTP');
assert.equal((page.match(/data:\\{auth_app_name:'Виртуальный ЗАГС «Я был здесь»'\\}/g) || []).length, 2, 'signup and resend should identify the ZAGS app');
assert.equal((page.match(/emailRedirectTo:emailRedirectTo\\(\\)/g) || []).length, 2, 'signup and resend should pass the ZAGS return URL');
assert.match(page, /verifyOtp\\(\\{email,token,type:'email'\\}\\)/, 'the submitted code should be verified as email OTP');
assert.match(page, /function emailRedirectTo\\(/, 'the page should construct a return URL');

for (const [name, template] of [['confirmation', confirmation], ['magic link', magicLink]]) {
  assert.match(template, /\\{\\{ \.Token \\}\\}/, name + ' email should show the OTP code');
  assert.match(template, /\\{\\{ \.ConfirmationURL \\}\\}/, name + ' email should include its confirmation link');
  assert.match(template, /\\{\\{ if \.Data\.auth_app_name \\}\\}/, name + ' email should use app-specific branding');
  assert.doesNotMatch(template, /TATTOO\\s*PRICE/i, name + ' email must not show Tattoo Price branding');
}

console.log('PASS: ZAGS signup and resend request an OTP, identify ZAGS, and include Russian code/link email templates.');
