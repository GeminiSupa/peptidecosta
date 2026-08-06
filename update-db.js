const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, ...val] = line.split('=');
  if (key && val) acc[key.trim()] = val.join('=').trim();
  return acc;
}, {});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const DEFAULT_BUSINESS_LINKS = {
  whatsappNumber: '50660626224',
  whatsappDisplay: '+506 6062 6224',
  apiWhatsAppNumber: '18314715559',
  apiWhatsAppDisplay: '+1 831-471-5559',
  googleMapsUrl: 'https://maps.app.goo.gl/jJCMHBM8aPXx67G3A',
  facebookUrl: '',
  instagramUrl: '',
  trustpilotUrl: 'https://www.trustpilot.com/review/peptidescostarica.net',
  trustpilotUrlEn: 'https://www.trustpilot.com/review/peptidescostarica.net',
  trustpilotUrlEs: 'https://es.trustpilot.com/review/peptidescostarica.net',
  googleReviewUrl: 'https://maps.app.goo.gl/jJCMHBM8aPXx67G3A',
  facebookReviewUrl: 'https://www.facebook.com/Peptidescostaricaresearch/reviews',
  supportEmail: 'support@peptidescostarica.net',
};

async function run() {
  const { data: current, error: readError } = await supabase
    .from('site_settings')
    .select('value')
    .eq('id', 'business_links')
    .maybeSingle();

  if (readError) throw readError;

  const newVal = {
    ...DEFAULT_BUSINESS_LINKS,
    ...(current?.value && typeof current.value === 'object' ? current.value : {}),
    whatsappNumber: '50660626224',
    whatsappDisplay: '+506 6062 6224',
    apiWhatsAppNumber: '18314715559',
    apiWhatsAppDisplay: '+1 831-471-5559',
  };

  const { error } = await supabase
    .from('site_settings')
    .upsert({ id: 'business_links', value: newVal }, { onConflict: 'id' });

  if (error) throw error;
  console.log('Business links updated successfully.');
}
run().catch((error) => {
  console.error('Error updating business links:', error);
  process.exit(1);
});
