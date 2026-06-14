import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('users').select('*').limit(1);
  if (error) console.log('Error users:', error);
  else console.log('users fields:', data.length > 0 ? Object.keys(data[0]) : 'no users');
  
  const { data: aData, error: aError } = await supabase.from('affiliate_codes').select('*').limit(1);
  if (aError) console.log('Error affiliate_codes:', aError);
  else console.log('affiliate_codes fields:', aData.length > 0 ? Object.keys(aData[0]) : 'no affiliate_codes');

  const { data: cData, error: cError } = await supabase.from('affiliate_commissions').select('*').limit(1);
  if (cError) console.log('Error affiliate_commissions:', cError);
  else console.log('affiliate_commissions fields:', cData.length > 0 ? Object.keys(cData[0]) : 'no affiliate_commissions');
}
check();
