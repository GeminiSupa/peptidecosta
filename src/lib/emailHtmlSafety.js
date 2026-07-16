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
