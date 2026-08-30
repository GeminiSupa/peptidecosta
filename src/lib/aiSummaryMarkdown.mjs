/**
 * The AI summary, parsed rather than injected.
 *
 * The analytics tab used to build the summary's HTML with two regexes and hand
 * it to `dangerouslySetInnerHTML`. Everything the model emitted that those two
 * regexes did not recognise — a tag, an `onerror` attribute — was passed
 * straight through and executed inside the admin session. Product names are
 * interpolated into the prompt, so the model always had material to echo back.
 *
 * Parsing to a small block/span tree instead means the renderer only ever
 * creates React elements, and text is text no matter what the model returns.
 * There is no HTML anywhere in this path to escape or forget to escape.
 *
 * The grammar is deliberately the small one the prompt asks for: headings,
 * dash/star bullets, and `**bold**`. Anything else stays literal, which is the
 * safe failure — a stray `<b>` shows up as `<b>` rather than as markup.
 */

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const BOLD = /\*\*([\s\S]+?)\*\*/g;

/**
 * Split one line into bold and plain runs.
 *
 * An unclosed `**` is not markup, so it stays in the text — the alternative is
 * a report that silently loses its last paragraph because the model dropped a
 * pair of asterisks.
 */
export function parseInlineSpans(line) {
  const text = String(line ?? '');
  const spans = [];
  let cursor = 0;

  BOLD.lastIndex = 0;
  let match = BOLD.exec(text);
  while (match) {
    if (match.index > cursor) spans.push({ text: text.slice(cursor, match.index), bold: false });
    spans.push({ text: match[1], bold: true });
    cursor = match.index + match[0].length;
    match = BOLD.exec(text);
  }
  if (cursor < text.length) spans.push({ text: text.slice(cursor), bold: false });

  return spans.filter((span) => span.text !== '');
}

/**
 * Parse the model's reply into blocks: headings, bullet lists, and lines.
 *
 * Consecutive bullets collapse into one list so the renderer can emit a real
 * `<ul>`. The old version injected bare `<li>` elements with no list around
 * them, which is why the bullets never quite lined up.
 */
export function parseAiSummary(text) {
  const blocks = [];
  let list = null;

  for (const rawLine of String(text ?? '').split('\n')) {
    const line = rawLine.replace(/\s+$/, '');
    const bullet = line.match(BULLET);

    if (bullet) {
      if (!list) {
        list = { type: 'list', items: [] };
        blocks.push(list);
      }
      list.items.push(parseInlineSpans(bullet[1]));
      continue;
    }

    list = null;
    if (line.trim() === '') continue;

    const heading = line.match(HEADING);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, spans: parseInlineSpans(heading[2]) });
      continue;
    }

    blocks.push({ type: 'line', spans: parseInlineSpans(line) });
  }

  return blocks;
}
