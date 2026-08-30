const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('/Users/apple/Desktop/costapeptides/.env.local', 'utf8').split('\n').reduce((a, l) => {
  const [k, ...v] = l.split('='); if (k && v.length) a[k.trim()] = v.join('=').trim(); return a;
}, {});
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY);
(async () => {
  for (const [label, days] of [['24h', 1], ['7d', 7], ['30d', 30]]) {
    const start = new Date(Date.now() - days * 864e5).toISOString();
    const t = Date.now();
    const { data, error } = await supabase.rpc('analytics_overview', { range_start: start, range_end: null });
    console.log(`${label.padEnd(4)} ${String(Date.now() - t).padStart(6)}ms  ${error ? 'ERROR ' + error.message : `sessions=${data.sessions.total} events-domains=${data.domains.length} products=${data.productViews.length}`}`);
  }
})();
