// Read-only probe against live Supabase. Never creates users, couples, OTPs, or payments.
const fs = require('node:fs');
const vm = require('node:vm');
(async () => {
  const context = {window:{}};
  vm.runInNewContext(fs.readFileSync('config.js','utf8'), context);
  const {SUPABASE_URL, SUPABASE_ANON_KEY} = context.window.YBZ_CONFIG;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw Error('Public Supabase settings missing');
  const health = await fetch(SUPABASE_URL + '/auth/v1/health', {headers:{apikey:SUPABASE_ANON_KEY},signal:AbortSignal.timeout(12000)});
  if (!health.ok) throw Error('Auth health not OK: '+health.status);
  console.log('PASS: Supabase Auth reachable');

  const denied = await fetch(SUPABASE_URL + '/rest/v1/rpc/zags_action', {
    method: 'POST',
    headers: {'apikey':SUPABASE_ANON_KEY,'Content-Type':'application/json'},
    body: JSON.stringify({p_action:'list',p_data:{}}),
    signal: AbortSignal.timeout(12000)
  });
  if (denied.ok) throw Error('Unsafe: anonymous user can execute zags_action');
  console.log('PASS: anonymous invocation rejected (HTTP '+denied.status+')');
})().catch(e => {console.error('Backend probe failed:', e.message); process.exitCode=1});
