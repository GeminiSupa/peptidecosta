import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env.local', 'utf8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);

const supabase = createClient(urlMatch[1], keyMatch[1]);

async function check() {
  const { data, error } = await supabase
    .from('commission_payouts')
    .select('id, agent_email, status, start_date, approved_at, email_sent, email_error')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log(JSON.stringify(data, null, 2));
}

check();
