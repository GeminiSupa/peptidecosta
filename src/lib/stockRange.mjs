/**
 * Customer-facing stock wording. The real count still limits the cart and
 * checkout. The catalog only says which band the count falls in.
 *
 * 1–9 less than 10, 10–50 more than 10, 51–100 more than 50, 101+ more than 100.
 */
export function stockRangePhrase(count, lang = 'en') {
  const units = Number(count);
  if (!Number.isFinite(units) || units <= 0) return null;
  const en = lang === 'en';
  if (units < 10) return en ? 'less than 10' : 'menos de 10';
  if (units <= 50) return en ? 'more than 10' : 'más de 10';
  if (units <= 100) return en ? 'more than 50' : 'más de 50';
  return en ? 'more than 100' : 'más de 100';
}
