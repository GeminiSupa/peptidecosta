import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { parseAiSummary, parseInlineSpans } from '../src/lib/aiSummaryMarkdown.mjs';

const flatten = (spans) => spans.map((span) => span.text).join('');

test('bold runs are split out and the rest stays plain text', () => {
  const spans = parseInlineSpans('A **strong** claim');
  assert.deepEqual(spans, [
    { text: 'A ', bold: false },
    { text: 'strong', bold: true },
    { text: ' claim', bold: false },
  ]);
});

test('an unclosed bold marker stays literal instead of eating the line', () => {
  const spans = parseInlineSpans('Revenue **rose sharply');
  assert.equal(spans.length, 1);
  assert.equal(spans[0].bold, false);
  assert.equal(flatten(spans), 'Revenue **rose sharply');
});

test('a lone asterisk is arithmetic, not markup', () => {
  assert.deepEqual(parseInlineSpans('5 * 3 units'), [{ text: '5 * 3 units', bold: false }]);
});

test('consecutive bullets collapse into one list', () => {
  const blocks = parseAiSummary('- first\n- second\nafter');
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].type, 'list');
  assert.equal(blocks[0].items.length, 2);
  assert.equal(flatten(blocks[0].items[1]), 'second');
  assert.equal(blocks[1].type, 'line');
});

test('a blank line ends a list rather than joining the next one to it', () => {
  const blocks = parseAiSummary('- one\n\n- two');
  assert.equal(blocks.filter((block) => block.type === 'list').length, 2);
});

test('headings carry their level', () => {
  const [block] = parseAiSummary('## Key Discoveries');
  assert.equal(block.type, 'heading');
  assert.equal(block.level, 2);
  assert.equal(flatten(block.spans), 'Key Discoveries');
});

test('markup the model returns survives as text, never as structure', () => {
  const blocks = parseAiSummary('<img src=x onerror=alert(1)>\n- <script>steal()</script>');
  assert.equal(flatten(blocks[0].spans), '<img src=x onerror=alert(1)>');
  assert.equal(flatten(blocks[1].items[0]), '<script>steal()</script>');
});

test('blank input parses to nothing rather than throwing', () => {
  assert.deepEqual(parseAiSummary(''), []);
  assert.deepEqual(parseAiSummary(null), []);
});

test('the analytics tab no longer injects model output as HTML', async () => {
  const source = await readFile(new URL('../src/components/admin/AnalyticsDashboard.js', import.meta.url), 'utf8');
  // The attribute, not the word — the renderer's comment explains what it replaced.
  const injections = source.split('\n').filter((line) => line.includes('dangerouslySetInnerHTML={'));
  assert.deepEqual(injections, []);
  assert.match(source, /renderAiSummary\(aiInsightText\)/);
});

test('the AI panel reports failure inline, not through a browser dialog', async () => {
  const source = await readFile(new URL('../src/components/admin/AnalyticsDashboard.js', import.meta.url), 'utf8');
  assert.equal(/(^|[^.\w])alert\(/m.test(source), false);
  assert.match(source, /setAiInsightError/);
});
