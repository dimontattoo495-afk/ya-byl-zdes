const fs = require('node:fs');
const assert = require('node:assert/strict');

const page = fs.readFileSync('zags/index.html', 'utf8');
const confirmation = fs.readFileSync('zags/email-templates/confirmation.html', 'utf8');
const magicLink = fs.readFileSync('zags/email-templates/magic-link.html', 'utf8');

assert.equal(page.split('signInWithOtp(').length - 1, 2, 'signup and resend should both request an OTP');
assert.equal(page.split("data:{auth_app_name:'Виртуальный ЗАГС «Я был здесь»'}").length - 1, 2, 'signup and resend should identify the ZAGS app');
assert.equal(page.split('emailRedirectTo:emailRedirectTo()').length - 1, 2, 'signup and resend should pass the ZAGS return URL');
assert.ok(page.includes("verifyOtp({email,token:$('#otp').value.trim(),type:'email'})"), 'the submitted code should be verified as email OTP');
assert.ok(page.includes('function emailRedirectTo('), 'the page should construct a return URL');

for (const [name, template] of [['confirmation', confirmation], ['magic link', magicLink]]) {
  assert.ok(template.includes('{{ .Token }}'), name + ' email should show the OTP code');
  assert.ok(template.includes('{{ .ConfirmationURL }}'), name + ' email should include its confirmation link');
  assert.ok(template.includes('{{ if .Data.auth_app_name }}'), name + ' email should use app-specific branding');
  assert.ok(!template.toUpperCase().includes('TATTOO PRICE'), name + ' email must not show Tattoo Price branding');
}

console.log('PASS: ZAGS signup and resend request an OTP, identify ZAGS, and include Russian code/link email templates.');
