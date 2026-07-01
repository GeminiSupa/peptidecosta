import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  const { data, error } = await supabase.from('scheduled_broadcasts').insert({
    audience: 'custom',
    custom_contacts: 'test1@test.com,test2@test.com',
    channels: { email: true, whatsapp: false, emailSubject: "Nuevos Productos Disponibles" },
    message: "Test message",
    scheduled_at: new Date().toISOString(),
    status: 'pending'
  }).select().single();
  console.log("Error:", error);
}
test();
