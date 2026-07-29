import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBulkDeleteMessage, buildDeleteMessage } from '../src/lib/confirmDelete.mjs';

test('the dialog names what is being deleted', () => {
  const message = buildDeleteMessage('order', [
    '#WPCR-MS55M554',
    'Omer Test',
    '015560190572',
    '₡113,800',
    'Status: Pending',
  ]);

  assert.equal(message, [
    'Delete this order?',
    '',
    '  • #WPCR-MS55M554',
    '  • Omer Test',
    '  • 015560190572',
    '  • ₡113,800',
    '  • Status: Pending',
    '',
    'This cannot be undone.',
  ].join('\n'));
});

test('missing details are dropped rather than shown as blanks', () => {
  // Call sites pass `order?.customer_name && ...`, so false/undefined/'' all
  // arrive here routinely and must not become empty bullet points.
  const message = buildDeleteMessage('lead', [undefined, null, '', false, '  ', 'Maria']);

  assert.equal(message, 'Delete this lead?\n\n  • Maria\n\nThis cannot be undone.');
});

test('a subject with no details still reads as a sentence', () => {
  assert.equal(buildDeleteMessage('banner'), 'Delete this banner?\n\nThis cannot be undone.');
  assert.equal(buildDeleteMessage('banner', []), 'Delete this banner?\n\nThis cannot be undone.');
});

test('a single detail can be passed without wrapping it in an array', () => {
  assert.equal(buildDeleteMessage('blog post', 'Peptides 101'), 'Delete this blog post?\n\n  • Peptides 101\n\nThis cannot be undone.');
});

test('bulk deletes state the count and get the plural right', () => {
  assert.equal(buildBulkDeleteMessage(3, 'cart entry', 'cart entries'), 'Delete 3 cart entries?\n\nThis cannot be undone.');
  assert.equal(buildBulkDeleteMessage(1, 'cart entry', 'cart entries'), 'Delete 1 cart entry?\n\nThis cannot be undone.');
  assert.equal(buildBulkDeleteMessage(5, 'lead'), 'Delete 5 leads?\n\nThis cannot be undone.');
});
