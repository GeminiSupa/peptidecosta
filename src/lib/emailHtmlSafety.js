// Guards against a known Unlayer export quirk that only bites Outlook desktop.
//
// Every Unlayer button carries a VML fallback (<v:roundrect>) with pixel
// dimensions baked in for Outlook, which ignores the normal CSS button. Now and
// then Unlayer miscomputes those dimensions for a single button (e.g. a 37px
// button exported as height:179px), so Outlook renders it as a giant coloured
// block while every other client — and the editor preview — looks fine. The
// customer sees a broken email they can't reproduce in the builder.
//
// This clamps absurd VML button dimensions on outbound HTML only, so no saved
// design is touched. Normal one/two-line buttons (~37–60px) pass through
// unchanged; only clearly broken values are pulled back to a sane size.
export function clampOutlookButtonSizes(html, { maxHeight = 60, resetHeight = 40, maxWidth = 600 } = {}) {
  if (!html || typeof html !== 'string') return html;

  return html.replace(/<v:roundrect\b[^>]*>/gi, (tag) => {
    let out = tag.replace(/height:\s*(\d+)px/gi, (match, h) => (Number(h) > maxHeight ? `height:${resetHeight}px` : match));
    out = out.replace(/width:\s*(\d+)px/gi, (match, w) => (Number(w) > maxWidth ? `width:${maxWidth}px` : match));
    return out;
  });
}

function addInlineStyle(tag, extraStyle) {
  if (/style\s*=/i.test(tag)) {
    return tag.replace(/style=(["'])(.*?)\1/i, (_match, quote, style) => {
      const separator = String(style || '').trim().endsWith(';') ? '' : ';';
      return `style=${quote}${style}${separator}${extraStyle}${quote}`;
    });
  }

  return tag.replace(/<a\b/i, `<a style="${extraStyle}"`);
}

// Some editor blocks are visually laid out as a navigation row, but the export is
// just adjacent anchors inside a paragraph/div. Webmail clients collapse those
// into a run of plain text links. For simple link-only blocks, emit a tiny
// presentation table so test emails match the editor much more closely.
//
// The links are frequently spaced apart with a <span> full of literal spaces
// (the editor shows the gap, but every client collapses the whitespace, jamming
// the links together on desktop). So "empty spacing" includes whitespace-only
// inline wrappers, not just raw whitespace, when deciding whether a block is a
// link row.
export function stabilizeSimpleLinkRows(html) {
  if (!html || typeof html !== 'string') return html;

  // Match the INNERMOST <p>/<div> only: the inner capture forbids nested
  // block-level tags, so a wrapper <div> can't swallow the <p> nav row inside it
  // (which would otherwise leave the row unconverted).
  const blockRow = /<(p|div)(?:\s[^>]*)?>((?:(?!<\/?(?:p|div|table|td|tr|ul|ol|li)\b)[\s\S])*?)<\/\1>/gi;

  return html.replace(blockRow, (fullBlock, tag, inner) => {
    const anchors = inner.match(/<a\b[\s\S]*?<\/a>/gi) || [];
    if (anchors.length < 2) return fullBlock;

    // Everything that is not an anchor must be "empty" spacing: whitespace,
    // &nbsp;, <br>, or inline wrappers (<span> etc.) that contain only those.
    // If any real text survives (e.g. a footer's " or " between two links),
    // this is not a pure link row — leave it untouched.
    const residue = inner
      .replace(/<a\b[\s\S]*?<\/a>/gi, '')
      .replace(/<br\s*\/?>/gi, '')
      .replace(/<\/?(?:span|font|b|strong|i|em)\b[^>]*>/gi, '')
      .replace(/&nbsp;|&#160;|&#xa0;/gi, '')
      .replace(/\s+/g, '')
      .trim();
    if (residue) return fullBlock;

    const tableStyle = 'width:100%;border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;';
    const cellWidth = `${(100 / anchors.length).toFixed(4)}%`;
    const cells = anchors.map((anchor) => {
      const styledAnchor = anchor.replace(/<a\b[^>]*>/i, (openTag) => addInlineStyle(openTag, 'display:inline-block;padding:8px 10px;'));
      return `<td align="center" valign="top" width="${cellWidth}" style="padding:0;text-align:center;">${styledAnchor}</td>`;
    }).join('');

    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="${tableStyle}"><tr>${cells}</tr></table>`;
  });
}

// Replaces first/last-name merge tags in every style the Unlayer editor might
// emit: bracket ([FIRST_NAME]) and Mailchimp (*|FIRST:NAME|*, *|FNAME|*). Without
// this the raw tag shipped to recipients (e.g. "HOLA *|FIRST:NAME|*!").
//
// Fallback order when a contact has no name: the tag's own inline default
// (e.g. [FIRST_NAME:Cliente] or *|FIRST:NAME:Cliente|*), then the campaign-level
// default passed in, then empty. When the result is empty, one leading space is
// swallowed so a nameless greeting reads "HOLA!" instead of "HOLA !". Non-tag
// content is left untouched.
export function personalizeMergeTags(value, { firstName = '', lastName = '', defaultFirstName = '', defaultLastName = '' } = {}) {
  const first = String(firstName || '').trim();
  const last = String(lastName || '').trim();

  // Capture group 1: an optional leading space. Groups 2/3: an optional inline
  // default from the bracket or Mailchimp form respectively.
  const firstNameTag = /([ \t]?)(?:\[FIRST_NAME(?::([^\]]*))?\]|\*\|\s*(?:FIRST:?NAME|FNAME)(?::([^|]*))?\s*\|\*)/gi;
  const lastNameTag = /([ \t]?)(?:\[LAST_NAME(?::([^\]]*))?\]|\*\|\s*(?:LAST:?NAME|LNAME)(?::([^|]*))?\s*\|\*)/gi;

  const fill = (real, paramDefault) => (space, bracketDefault, mailchimpDefault) => {
    const inlineDefault = bracketDefault ?? mailchimpDefault ?? '';
    const name = real || String(inlineDefault).trim() || String(paramDefault || '').trim();
    return name ? (space ? ' ' : '') + name : '';
  };

  return String(value || '')
    .replace(firstNameTag, (m, space, bDef, mDef) => fill(first, defaultFirstName)(space, bDef, mDef))
    .replace(lastNameTag, (m, space, bDef, mDef) => fill(last, defaultLastName)(space, bDef, mDef));
}
