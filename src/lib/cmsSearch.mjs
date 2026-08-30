/**
 * Finding one field in the CMS.
 *
 * The tab renders every setting the site has — around 170 inputs across a
 * dozen pages — all expanded, all at once. Changing the support email meant
 * scrolling past the promo ticker, the press band, the offer cards, three
 * footers and the whole blog editor. The content was never the problem; the
 * absence of any way to narrow it was.
 *
 * Filtering happens in CSS rather than in React on purpose. The fields arrive
 * from two different rendering paths — shared helpers for the page settings,
 * hand-written markup for the contact block — and a generated stylesheet
 * treats both identically, without either path having to learn about search.
 * `:has()` then hides any group or section left with nothing in it, so the
 * filtered view has no empty boxes standing where content used to be.
 */

/** Collapse whitespace and case so "Support  Email" finds "support email". */
export function normalizeCmsSearchTerm(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

/**
 * Make a string safe to sit inside a double-quoted CSS attribute selector.
 *
 * The term comes from a text input and is interpolated into a stylesheet, so
 * an unescaped quote would end the selector early and let the rest of the typed
 * text be parsed as CSS. Backslash first, or it would escape the escapes.
 */
export function escapeCssString(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\n\r\f]/g, ' ');
}

/**
 * The stylesheet that narrows the CMS to fields matching `term`.
 *
 * Empty when nothing is being searched, so the tab pays nothing for the
 * feature until it is used.
 *
 * Every rule is scoped under `.cms-filtering`, which the container only carries
 * while a search is active — a stale rule can therefore never hide a field
 * during normal editing.
 */
export function cmsSearchStyle(term) {
  const needle = normalizeCmsSearchTerm(term);
  if (!needle) return '';
  const safe = escapeCssString(needle);
  const match = `[data-cms-search*="${safe}" i]`;

  return [
    // Hide every field, then bring back the ones that match.
    `.cms-filtering [data-cms-search] { display: none; }`,
    `.cms-filtering ${match} { display: block; }`,
    // A group or section with no surviving field would otherwise sit there as
    // an empty box with a heading, which reads as "no results" in the wrong
    // place.
    `.cms-filtering .cms-group:not(:has(${match})) { display: none; }`,
    `.cms-filtering .cms-section:not(:has(${match})) { display: none; }`,
  ].join('\n');
}

/**
 * Whether one field's searchable text matches, for the result count.
 *
 * Kept in step with the CSS above: substring, case-insensitive, both sides
 * whitespace-collapsed.
 */
export function cmsFieldMatches(haystack, term) {
  const needle = normalizeCmsSearchTerm(term).toLowerCase();
  if (!needle) return true;
  return normalizeCmsSearchTerm(haystack).toLowerCase().includes(needle);
}

/**
 * The searchable text for one field: what it is called, and where it lives.
 *
 * The page id is folded in so "affiliate" finds every field on the affiliate
 * page, even the ones labelled only "Hero title EN" — which is most of them,
 * and exactly the search a person actually types.
 */
export function cmsSearchText(pageId, label, key = '') {
  return [cmsPageLabel(pageId), label, key]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

/** `page_info_center` reads as "Info Center" to everyone except the database. */
export function cmsPageLabel(pageId) {
  return String(pageId ?? '')
    .replace(/^page_/, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
