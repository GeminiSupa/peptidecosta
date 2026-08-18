/**
 * Correos de Costa Rica is where a customer actually follows their parcel.
 *
 * The shipped email has always printed the tracking number and left the
 * customer to work out where to type it. The site takes the number on its own
 * lookup page — there is no deep link that pre-fills it — so the mail points
 * them at the page and tells them to paste the number they already have.
 */
export const CORREOS_TRACKING_URL = 'https://correos.go.cr/rastreo/';

// The email prints "N/A" when nothing was entered, and an order edited by hand
// can end up holding that literal string, a dash, or a stray space. None of
// those are a parcel anybody can look up, and offering a tracking link beside
// one is worse than staying quiet.
const PLACEHOLDERS = new Set(['n/a', 'na', 'n.a.', '-', '--', 'none', 'pending', 'tbd']);

export function hasTrackingNumber(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return false;
  return !PLACEHOLDERS.has(trimmed.toLowerCase());
}

export function correosTrackingStrings(lang) {
  const isEn = lang === 'en';
  return {
    heading: isEn ? 'Follow your parcel' : 'Siga su paquete',
    body: isEn
      ? 'Enter the tracking number above on the Correos de Costa Rica website to see where your parcel is.'
      : 'Ingrese el número de rastreo de arriba en el sitio de Correos de Costa Rica para ver dónde está su paquete.',
    button: isEn ? 'Track on Correos de Costa Rica' : 'Rastrear en Correos de Costa Rica',
    // Repeated in the plain-text part, where there is no button to click.
    textLine: isEn
      ? `Track your parcel: ${CORREOS_TRACKING_URL} (enter the tracking number above)`
      : `Rastree su paquete: ${CORREOS_TRACKING_URL} (ingrese el número de rastreo de arriba)`,
  };
}
