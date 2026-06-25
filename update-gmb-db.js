const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, ...val] = line.split('=');
  if (key && val) acc[key.trim()] = val.join('=').trim();
  return acc;
}, {});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: current } = await supabase.from('site_settings').select('value').eq('id', 'business_links').single();
  
  if (current && current.value) {
    const newVal = {
      ...current.value,
      googleMapsUrl: 'https://maps.app.goo.gl/AgpzEd8NNRKYNbJj9'
    };
    const { error } = await supabase.from('site_settings').update({ value: newVal }).eq('id', 'business_links');
    if (error) console.error("Error updating:", error);
    else console.log("Updated successfully!");
  }
}
run();
