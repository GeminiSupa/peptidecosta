const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('/Users/apple/Desktop/costapeptides/.env.local', 'utf8').split('\n').reduce((a, l) => {
  const [k, ...v] = l.split('='); if (k && v.length) a[k.trim()] = v.join('=').trim(); return a;
}, {});
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY);
(async () => {
  const { count } = await supabase.from('email_subscribers').select('id', { count: 'exact', head: true });
  // Exactly what /api/admin/subscribers does: no limit, no range.
  const { data } = await supabase.from('email_subscribers').select('*').order('created_at', { ascending: false });
  console.log(`email_subscribers: table has ${count}, unlimited select returned ${data.length}`);
  const subscribed = data.filter(s => s.status === 'subscribed').length;
  const { count: trueSubscribed } = await supabase.from('email_subscribers').select('id', { count: 'exact', head: true }).eq('status', 'subscribed');
  console.log(`"subscribed" — route would report ${subscribed}, actual ${trueSubscribed}`);

  const { count: leadCount } = await supabase.from('catalog_leads').select('id', { count: 'exact', head: true });
  const { data: leads } = await supabase.from('catalog_leads').select('*').order('created_at', { ascending: false });
  console.log(`catalog_leads: table has ${leadCount}, unlimited select returned ${leads.length}`);
})();
