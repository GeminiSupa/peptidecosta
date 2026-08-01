const USD_PLACEHOLDER_RE = /\{\{usd_(\d+(?:\.\d+)?)\}\}/g;
const FULL_MARKDOWN_LINK_RE = /^\s*\[([\s\S]+?)\]\(([^)\s]+)\)\s*$/;
const FIRST_INLINE_MARKDOWN_LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/;
const INLINE_MARKDOWN_LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

export function replaceUsdPlaceholders(text = '', formatter = (amount) => `$${amount}`) {
  return String(text || '').replace(USD_PLACEHOLDER_RE, (_, amount) => formatter(Number(amount)));
}

export function sanitizeBannerHref(href = '') {
  const value = String(href || '').trim();
  if (!value) return '';
  if (
    value.startsWith('/') ||
    value.startsWith('#') ||
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('mailto:') ||
    value.startsWith('tel:')
  ) {
    return value;
  }
  return '';
}

export function normalizeBannerCopy(rawText = '', options = {}) {
  const withCurrency = replaceUsdPlaceholders(rawText, options.formatUsd);
  const fullLink = withCurrency.match(FULL_MARKDOWN_LINK_RE);
  const markdownHref = fullLink ? sanitizeBannerHref(fullLink[2]) : '';
  const inlineHref = fullLink ? '' : sanitizeBannerHref(withCurrency.match(FIRST_INLINE_MARKDOWN_LINK_RE)?.[2]);
  const textSource = fullLink ? fullLink[1] : withCurrency;
  const text = textSource
    .replace(INLINE_MARKDOWN_LINK_RE, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    text,
    href: markdownHref || inlineHref,
  };
}
