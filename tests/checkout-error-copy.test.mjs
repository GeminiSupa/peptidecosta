import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const catalog = fs.readFileSync('src/app/catalog/page.js', 'utf8');
const templates = fs.readFileSync('src/lib/orderEmailTemplates.mjs', 'utf8');

// The customer-facing strings only; the file's own code comments legitimately
// talk about elements being above or below one another.
const customerCopy = (source) => source
  .split('\n')
  .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
  .join('\n');

test('checkout errors never point at a direction the layout does not guarantee', () => {
  // The decline notice read "check the card details above" while sitting
  // directly above those fields.
  assert.doesNotMatch(customerCopy(catalog), /card details above|datos de la tarjeta arriba/i);
  assert.doesNotMatch(customerCopy(catalog), /card details below|datos de la tarjeta abajo/i);
});

test('the gateway reason is closed off before our own sentence starts', () => {
  // "Card brand not allowed" comes back with no full stop, and joining it
  // straight onto ours produced one run-on sentence out of two.
  assert.match(catalog, /endSentence\(data\.error\)/);
});

test('a refusal we made is not blamed on the customer bank', () => {
  // "Card brand not allowed" is the gateway rejecting a card type we do not
  // accept — the customer's bank never saw it.
  assert.doesNotMatch(customerCopy(templates), /bank's reason|motivo de su banco/i);
  assert.match(templates, /Reason given/);
  assert.match(templates, /Motivo indicado/);
});
