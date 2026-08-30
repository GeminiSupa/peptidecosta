const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('/Users/apple/Desktop/costapeptides/.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, ...val] = line.split('=');
  if (key && val) acc[key.trim()] = val.join('=').trim();
  return acc;
}, {});
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY);

(async () => {
  const t0 = Date.now();
  const { data, error } = await supabase.rpc('analytics_overview', { range_start: null, range_end: null });
  if (error) { console.log('ERROR', error.message); return; }
  console.log(`all-time call: ${Date.now() - t0}ms`);
  console.log('sessions      ', JSON.stringify(data.sessions));
  console.log('landingVisitors', data.landingVisitors);
  console.log('cities        ', JSON.stringify(data.cities?.slice(0, 3)));
  console.log('productViews  ', JSON.stringify(data.productViews?.slice(0, 3)));
  console.log('domains       ', JSON.stringify(data.domains?.slice(0, 3)));
  console.log('channels      ', JSON.stringify(data.channels?.slice(0, 5)));
  console.log('pages(top1)   ', JSON.stringify(data.pages?.slice(0, 1)));
  console.log('payload bytes ', JSON.stringify(data).length);

  // Cross-check the aggregate against exact table counts.
  const { count: sessionCount } = await supabase.from('visitor_sessions').select('id', { count: 'exact', head: true });
  console.log(`\ncross-check sessions: rpc=${data.sessions.total} table=${sessionCount} ${Number(data.sessions.total) === sessionCount ? 'MATCH' : 'MISMATCH'}`);
  const { count: pvCount } = await supabase.from('product_views').select('id', { count: 'exact', head: true });
  const rpcViews = (data.productViews || []).reduce((s, r) => s + Number(r.views), 0);
  console.log(`cross-check product views: rpc=${rpcViews} table=${pvCount} (rpc excludes null/'Unknown' names)`);

  const t1 = Date.now();
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const { data: week, error: weekErr } = await supabase.rpc('analytics_overview', { range_start: weekAgo, range_end: null });
  console.log(`\n7d call: ${Date.now() - t1}ms`, weekErr ? weekErr.message : `sessions=${week.sessions.total} landing=${week.landingVisitors}`);
})();
