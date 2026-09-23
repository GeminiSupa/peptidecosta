import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HONEYPOT_FIELD,
  JUNK_BLOCK_SCORE,
  junkOrderMessage,
  junkOrderSummary,
  scoreJunkOrder,
} from '../src/lib/checkoutJunkGuard.mjs';

/**
 * The orders this guard was written for, copied out of the recycle bin exactly
 * as they were posted on 23 Sep 2026.
 */
const SPAM_ORDERS = [
  {
    customer_name: 'test',
    customer_phone: '50688888888',
    customer_email: 'f@b.com',
    shipping_address: 'sdfdsf\nAlajuelita, Alajuelita, San José\n44444',
  },
  {
    customer_name: 'test',
    customer_phone: '50688888888',
    customer_email: 'f@b.com',
    shipping_address: 'fdfd\nLegua, Aserrí, San José\n33333',
  },
  {
    customer_name: 'test',
    customer_phone: '50688888888',
    customer_email: 'a@b.com',
    shipping_address: 'eretetr\nSantiago, Puriscal, San José\n55555',
  },
];

/**
 * Real orders that were paid for, taken from the order history. Every one of
 * these trips at least one signal, and every one of them must still check out
 * — this is the list that decides the weights, so an addition to the rules
 * that breaks a row here is refusing a customer who gave us money.
 */
const REAL_ORDERS = [
  // The staff's stand-in email for a customer who gives no address. Eight paid
  // orders carry it, plus another twenty on abc@abc.com.
  { customer_name: 'Amadeo Rouzier Rodríguez', customer_phone: '72080553', customer_email: 'a@b.com', shipping_address: 'Condominio be cariari apartamento 209' },
  // Same stand-in email AND 00000 typed into a postal box nobody knows.
  { customer_name: 'Marcelo (Medico, Jacobay Pickup)', customer_phone: '87385524', customer_email: 'a@b.com', shipping_address: 'n/a\nPuntarenas, Central, Puntarenas\n00000' },
  { customer_name: 'Chema Meléndez', customer_phone: '50688306148', customer_email: 'a@b.com', shipping_address: 'Jacobay\nJacó, Garabito, Puntarenas\n11111' },
  // A placeholder phone on a completed order — the customer was reached some
  // other way, and the order is still real.
  { customer_name: 'Eric Friend', customer_phone: '8888888888', customer_email: '', shipping_address: '' },
  { customer_name: 'Henry Camacho Chacon', customer_phone: '50655555555', customer_email: 'henryca@yahoo.com', shipping_address: '' },
  { customer_name: 'Cynthia Fonseca Molina', customer_phone: '50688207381', customer_email: 'abc@abc.com', shipping_address: 'Moravia' },
  { customer_name: 'fiorella', customer_phone: '71053493', customer_email: 'k@hotmail.com', shipping_address: 'Heredia' },
  // A Costa Rican company legally named after its own cédula jurídica, at an
  // address full of the acronyms a vowel rule would call gibberish.
  { customer_name: '3102736108 SRL', customer_phone: '50684094223', customer_email: 'daquiros@ccss.sa.cr', shipping_address: 'CCSS sucursal SJ, MSJ' },
  { customer_name: 'Li Wu', customer_phone: '13159524152', customer_email: 'granitewall66@gmail.com', shipping_address: 'PO Box 4455, Escazú' },
  { customer_name: "O'Brien", customer_phone: '50660355089', customer_email: 'clary@hotmail.com', shipping_address: 'Tibás' },
  { customer_name: 'Graciela Quesada Fernández', customer_phone: '50683562062', customer_email: 'graci45@gmail.com', shipping_address: 'Barrio Luján, 200m sur\nSan José\n10101' },
];

test('the three orders that started this are all refused', () => {
  for (const order of SPAM_ORDERS) {
    const result = scoreJunkOrder(order);
    assert.equal(result.blocked, true, junkOrderSummary(result));
  }
});

test('real orders that trip a signal still check out', () => {
  for (const order of REAL_ORDERS) {
    const result = scoreJunkOrder(order);
    assert.equal(
      result.blocked,
      false,
      `${order.customer_name} would have been refused: ${junkOrderSummary(result)}`,
    );
  }
});

test('a name that is only filler is refused on its own', () => {
  // Nothing else about these is wrong — a real phone, a real email, a real
  // street. Over 1,166 historical orders no paying customer has ever had a
  // name like this, which is what earns it a blocking weight by itself.
  for (const name of ['test', 'Test', 'test test', 'TESTING', 'prueba', 'Prueba Prueba', 'asdf']) {
    const result = scoreJunkOrder({
      customer_name: name,
      customer_phone: '50683562062',
      customer_email: 'graci45@gmail.com',
      shipping_address: 'Barrio Luján, San José 10101',
    });
    assert.equal(result.blocked, true, `"${name}" should be refused`);
  }
});

test('a real name that merely contains a filler word is left alone', () => {
  // The rule asks whether EVERY word is filler, not whether any word is.
  for (const name of ['Teresa Testa', 'Demonte Abarca', 'Ana Prueba Mora']) {
    assert.equal(scoreJunkOrder({ customer_name: name }).blocked, false, name);
  }
});

test('the hidden field refuses the order by itself', () => {
  const clean = {
    customer_name: 'Graciela Quesada Fernández',
    customer_phone: '50683562062',
    customer_email: 'graci45@gmail.com',
    shipping_address: 'Barrio Luján, San José 10101',
  };
  assert.equal(scoreJunkOrder(clean).blocked, false);
  assert.equal(scoreJunkOrder({ ...clean, [HONEYPOT_FIELD]: 'http://spam.example' }).blocked, true);
  // Empty is what every human sends, and an absent key is what the WhatsApp
  // bot and the admin paths send.
  assert.equal(scoreJunkOrder({ ...clean, [HONEYPOT_FIELD]: '' }).blocked, false);
  assert.equal(scoreJunkOrder({ ...clean, [HONEYPOT_FIELD]: '   ' }).blocked, false);
});

test('the country code is not mistaken for the number', () => {
  // 506 8888 8888 is only a repeated digit once the dial code comes off, and
  // 5065555555 must not read as one because of the 5s in front.
  assert.equal(junkOrderSummary(scoreJunkOrder({ customer_phone: '50688888888' })), 'phone:phoneRepeatedDigit');
  assert.equal(junkOrderSummary(scoreJunkOrder({ customer_phone: '50687063824' })), '');
  assert.equal(junkOrderSummary(scoreJunkOrder({ customer_phone: '50612345678' })), 'phone:phoneSequential');
});

test('one odd field is never enough on its own', () => {
  const single = [
    { customer_phone: '50688888888' },
    { customer_email: 'a@b.com' },
    { customer_email: 'abc@abc.com' },
    { shipping_address: 'Puntarenas, Central\n00000' },
    { customer_name: 'Sdfg Mora' },
  ];
  for (const order of single) {
    const result = scoreJunkOrder(order);
    assert.ok(result.score < JUNK_BLOCK_SCORE, `${JSON.stringify(order)} scored ${result.score}`);
  }
});

test('an empty order scores nothing rather than everything', () => {
  // The required-field check runs before this one; a blank order reaching here
  // must not be scored as junk on the strength of its blanks.
  assert.deepEqual(scoreJunkOrder({}), { score: 0, signals: [], blocked: false });
  assert.equal(scoreJunkOrder(null).blocked, false);
});

test('the refusal never names the rule that caught it', () => {
  for (const lang of ['es', 'en']) {
    const message = junkOrderMessage(lang);
    assert.ok(message.length > 0);
    for (const leak of ['honeypot', 'score', 'bot', 'spam']) {
      assert.ok(!message.toLowerCase().includes(leak), `${lang} message leaks "${leak}"`);
    }
    // It has to leave her a way through that does not depend on this form.
    assert.ok(/whatsapp/i.test(message));
  }
});
