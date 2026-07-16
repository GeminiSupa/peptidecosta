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
