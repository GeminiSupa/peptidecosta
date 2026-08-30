const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('/Users/apple/Desktop/costapeptides/.env.local', 'utf8').split('\n').reduce((a, l) => {
  const [k, ...v] = l.split('='); if (k && v.length) a[k.trim()] = v.join('=').trim(); return a;
}, {});
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY);
const fmt = (s) => { const d = Math.floor(s/86400), h = Math.floor(s%86400/3600), m = Math.floor(s%3600/60); return `${d}d ${h}h ${m}m`; };
(async () => {
  const { data } = await supabase.from('visitor_sessions')
    .select('catalog_duration, created_at, last_active')
    .gt('catalog_duration', 0).order('last_active', { ascending: false }).limit(5000);
  const d = data.map(r => r.catalog_duration).sort((a,b)=>a-b);
  const pct = (p) => d[Math.floor(d.length * p)];
  console.log(`sample ${d.length} sessions with duration > 0`);
  console.log(`  median ${fmt(pct(0.5))}   p75 ${fmt(pct(0.75))}   p95 ${fmt(pct(0.95))}   max ${fmt(d[d.length-1])}`);
  const overADay = data.filter(r => r.catalog_duration > 86400).length;
  const underTenMin = data.filter(r => r.catalog_duration <= 600).length;
  console.log(`  longer than a day: ${overADay} (${Math.round(overADay/d.length*100)}%)`);
  console.log(`  under ten minutes: ${underTenMin} (${Math.round(underTenMin/d.length*100)}%)`);

  // City spelling split
  const { data: cities } = await supabase.from('visitor_sessions').select('city').limit(20000);
  const counts = {};
  cities.forEach(r => { const c = (r.city||'').trim(); if (c && c !== 'Unknown') counts[c] = (counts[c]||0)+1; });
  const norm = {};
  Object.entries(counts).forEach(([c,n]) => {
    const key = c.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
    (norm[key] ||= { total: 0, spellings: [] }); norm[key].total += n; norm[key].spellings.push(`${c}=${n}`);
  });
  console.log('\ncities where spelling splits one place in two:');
  Object.entries(norm).filter(([,v]) => v.spellings.length > 1)
    .sort((a,b)=>b[1].total-a[1].total).slice(0,5)
    .forEach(([k,v]) => console.log(`  ${k}: total ${v.total} — ${v.spellings.join(', ')}`));
})();
