const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, ...val] = line.split('=');
  if (key && val) acc[key.trim()] = val.join('=').trim();
  return acc;
}, {});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: current, error: readError } = await supabase.from('site_settings').select('value').eq('id', 'business_links').single();
  if (readError) throw readError;
  
  if (current && current.value) {
    const newVal = {
      ...current.value,
      googleMapsUrl: 'https://maps.app.goo.gl/b9YaeUXyuvBuj8vo8',
      googleReviewUrl: 'https://maps.app.goo.gl/b9YaeUXyuvBuj8vo8',
      trustpilotUrl: 'https://www.trustpilot.com/review/peptidescostarica.net',
      trustpilotUrlEn: 'https://www.trustpilot.com/review/peptidescostarica.net',
      trustpilotUrlEs: 'https://es.trustpilot.com/review/peptidescostarica.net'
    };
    const { error } = await supabase.from('site_settings').update({ value: newVal }).eq('id', 'business_links');
    if (error) throw error;
    console.log("Updated successfully!");
  } else {
    console.log("No business_links row found.");
  }
}
run().catch((error) => {
  console.error("Error updating:", error);
  process.exit(1);
});
