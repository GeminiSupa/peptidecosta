/**
 * The businesses this shop sells to, as one controlled list.
 *
 * Two things used to decide a prospect's category and they disagreed. A
 * discovered business arrived with whatever Google or OpenStreetMap called it,
 * and a manually added one arrived with whatever the agent typed. Both were
 * then matched against a list of keyword fragments written for gyms, clinics
 * and spas — so "Farmacia La Bomba", a pharmacy chain with a purchasing
 * department, scored 5 out of 100 and sorted below a CrossFit box.
 *
 * These keys are the fix. A row that carries one is scored by what it actually
 * is. Free text still works — see matchesTargetCategory in prospects.mjs, which
 * remains the fallback for everything discovered from a directory — but a key
 * is the difference between ranking a pharmacy correctly and not ranking it at
 * all.
 *
 * `es` is the term the business uses for itself in Costa Rica, and is here to
 * be searched, not displayed: nobody scraping this country finds a droguería by
 * looking for "drug distributor".
 */

/**
 * Tiers are commercial, not alphabetical, and they are the whole point of the
 * list: a pharmacy chain and a personal training studio are both real
 * prospects, and treating them as equally good is what the flat keyword list
 * did wrong.
 */
export const PROSPECT_CATEGORY_TIERS = {
  1: { label: 'Licensed to resell', hint: 'Buys stock to sell on — pharmacies, drogerías, distributors, importers.' },
  2: { label: 'Prescribes or administers', hint: 'Clinics using product directly with patients.' },
  3: { label: 'Manufacturing and research', hint: 'Labs, biotech and formulators. Large orders, slow cycles.' },
  4: { label: 'Veterinary', hint: 'A separate market reached through separate channels.' },
  5: { label: 'Fitness and wellness', hint: 'The most businesses and the smallest orders.' },
};

/**
 * What matching a tier is worth.
 *
 * Tier 5 is 45, which is what every target category scored before this file
 * existed — gyms and clinics keep the number they already had, and only the
 * tiers above them move. A rescore therefore cannot demote anything already in
 * the pipeline; it can only lift the businesses that were undervalued.
 */
export const CATEGORY_TIER_POINTS = { 1: 60, 2: 55, 3: 52, 4: 50, 5: 45 };

export const PROSPECT_CATEGORIES = [
  { key: 'pharmacy',                  tier: 1, label: 'Pharmacy',                     es: 'Farmacia' },
  { key: 'pharmacy_chain',            tier: 1, label: 'Pharmacy chain',               es: 'Cadena de farmacias' },
  { key: 'compounding_pharmacy',      tier: 1, label: 'Compounding pharmacy',         es: 'Farmacia magistral' },
  { key: 'pharma_company',            tier: 1, label: 'Pharmaceutical company',       es: 'Laboratorio farmacéutico' },
  { key: 'drug_distributor',          tier: 1, label: 'Drug distributor',             es: 'Droguería' },
  { key: 'medical_distributor',       tier: 1, label: 'Medical distributor',          es: 'Distribuidora médica' },
  { key: 'pharma_importer',           tier: 1, label: 'Pharmaceutical importer',      es: 'Importadora farmacéutica' },

  { key: 'anti_aging_clinic',         tier: 2, label: 'Anti-aging clinic',            es: 'Clínica antienvejecimiento' },
  { key: 'weight_loss_clinic',        tier: 2, label: 'Weight-loss clinic',           es: 'Clínica de obesidad' },
  { key: 'metabolic_clinic',          tier: 2, label: 'Metabolic health clinic',      es: 'Clínica metabólica' },
  { key: 'hormone_clinic',            tier: 2, label: 'Hormone / men’s health',  es: 'Clínica hormonal' },
  { key: 'regenerative_clinic',       tier: 2, label: 'Regenerative medicine',        es: 'Medicina regenerativa' },
  { key: 'longevity_clinic',          tier: 2, label: 'Longevity clinic',             es: 'Clínica de longevidad' },
  { key: 'dermatology_clinic',        tier: 2, label: 'Dermatology clinic',           es: 'Clínica dermatológica' },
  { key: 'aesthetic_clinic',          tier: 2, label: 'Aesthetic clinic',             es: 'Clínica estética' },
  { key: 'plastic_surgery_clinic',    tier: 2, label: 'Plastic surgery clinic',       es: 'Cirugía plástica' },
  { key: 'medical_spa',               tier: 2, label: 'Medical spa',                  es: 'Spa médico' },
  { key: 'nutrition_clinic',          tier: 2, label: 'Nutrition clinic',             es: 'Clínica de nutrición' },

  { key: 'biotech_company',           tier: 3, label: 'Biotechnology company',        es: 'Empresa de biotecnología' },
  { key: 'biomedical_company',        tier: 3, label: 'Biomedical company',           es: 'Empresa biomédica' },
  { key: 'clinical_lab',              tier: 3, label: 'Clinical laboratory',          es: 'Laboratorio clínico' },
  { key: 'research_lab_private',      tier: 3, label: 'Private research lab',         es: 'Laboratorio de investigación' },
  { key: 'research_lab_university',   tier: 3, label: 'University research lab',      es: 'Laboratorio universitario' },
  { key: 'medical_research_center',   tier: 3, label: 'Medical research center',      es: 'Centro de investigación médica' },
  { key: 'nutraceutical_company',     tier: 3, label: 'Nutraceutical company',        es: 'Empresa nutracéutica' },
  { key: 'supplement_company',        tier: 3, label: 'Supplement company',           es: 'Suplementos' },
  { key: 'cosmetic_manufacturer',     tier: 3, label: 'Cosmetic manufacturer',        es: 'Fabricante de cosméticos' },
  { key: 'skincare_company',          tier: 3, label: 'Skincare company',             es: 'Cuidado de la piel' },

  { key: 'veterinary_clinic',         tier: 4, label: 'Veterinary clinic',            es: 'Veterinaria' },
  { key: 'animal_hospital',           tier: 4, label: 'Animal hospital',              es: 'Hospital veterinario' },
  { key: 'veterinary_pharmacy',       tier: 4, label: 'Veterinary pharmacy',          es: 'Farmacia veterinaria' },
  { key: 'veterinary_distributor',    tier: 4, label: 'Veterinary distributor',       es: 'Distribuidora veterinaria' },
  { key: 'animal_health_company',     tier: 4, label: 'Animal-health company',        es: 'Salud animal' },
  { key: 'veterinary_research',       tier: 4, label: 'Veterinary research',          es: 'Investigación veterinaria' },

  { key: 'gym',                       tier: 5, label: 'Gym',                          es: 'Gimnasio' },
  { key: 'fitness_center',            tier: 5, label: 'Fitness center',               es: 'Centro de acondicionamiento físico' },
  { key: 'crossfit_gym',              tier: 5, label: 'CrossFit gym',                 es: 'CrossFit' },
  { key: 'bodybuilding_gym',          tier: 5, label: 'Bodybuilding gym',             es: 'Fisicoculturismo' },
  { key: 'personal_training_studio',  tier: 5, label: 'Personal training studio',     es: 'Entrenamiento personal' },
  { key: 'sports_performance_center', tier: 5, label: 'Sports-performance center',    es: 'Centro de alto rendimiento' },
  { key: 'weight_loss_program',       tier: 5, label: 'Weight-loss program',          es: 'Programa para bajar de peso' },
  { key: 'wellness_center',           tier: 5, label: 'Wellness center',              es: 'Centro de bienestar' },
  { key: 'beauty_clinic',             tier: 5, label: 'Beauty clinic',                es: 'Clínica de belleza' },
];

const BY_KEY = new Map(PROSPECT_CATEGORIES.map((entry) => [entry.key, entry]));

export const PROSPECT_CATEGORY_KEYS = PROSPECT_CATEGORIES.map((entry) => entry.key);

/**
 * A stored value read as a key, or null if it is free text.
 *
 * Tolerant of the shapes a key takes on the way through a spreadsheet, a form
 * field and a database column — trimmed, lowercased, and spaces or hyphens read
 * as underscores, so "Pharmacy Chain" and "pharmacy-chain" both resolve. It
 * stops there: a value that is not on the list comes back null and is scored as
 * free text rather than being guessed at.
 */
export function prospectCategoryKey(value) {
  const cleaned = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return BY_KEY.has(cleaned) ? cleaned : null;
}

/** The full entry for a stored value, or null. */
export function prospectCategory(value) {
  const key = prospectCategoryKey(value);
  return key ? BY_KEY.get(key) : null;
}

/** 1 to 5 for a known category, or null for free text. */
export function categoryTier(value) {
  return prospectCategory(value)?.tier ?? null;
}

/** Points a known category is worth, or 0 so the caller can fall back. */
export function categoryTierPoints(value) {
  const tier = categoryTier(value);
  return tier ? CATEGORY_TIER_POINTS[tier] : 0;
}

/** The list grouped for a picker, tier order preserved. */
export function categoriesByTier() {
  return Object.keys(PROSPECT_CATEGORY_TIERS)
    .map(Number)
    .sort((a, b) => a - b)
    .map((tier) => ({
      tier,
      ...PROSPECT_CATEGORY_TIERS[tier],
      categories: PROSPECT_CATEGORIES.filter((entry) => entry.tier === tier),
    }));
}
