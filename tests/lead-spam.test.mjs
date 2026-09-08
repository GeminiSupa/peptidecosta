import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyLeadSubmission,
  HONEYPOT_FIELD,
  MIN_FORM_FILL_MS,
} from '../src/lib/leadSpam.mjs';

// A plausible enquiry off the Costa Rican storefront, filled in at human speed.
const realLead = {
  name: 'Ana Rojas',
  email: 'ana.rojas@gmail.com',
  phone: '+506 8404 6973',
  honeypot: '',
  elapsedMs: 21000,
  hasBrowserOrigin: true,
};

test('lets an ordinary enquiry through', () => {
  const verdict = classifyLeadSubmission(realLead);
  assert.equal(verdict.spam, false);
  assert.deepEqual(verdict.reasons, []);
});

test('a filled honeypot is enough on its own', () => {
  const verdict = classifyLeadSubmission({ ...realLead, honeypot: 'SEO services' });
  assert.equal(verdict.spam, true);
  assert.deepEqual(verdict.hard, ['honeypot']);
});

test('a form completed faster than a person could type is enough on its own', () => {
  const verdict = classifyLeadSubmission({ ...realLead, elapsedMs: MIN_FORM_FILL_MS - 1 });
  assert.equal(verdict.spam, true);
  assert.deepEqual(verdict.hard, ['too_fast']);
});

test('a page cached from before the timer shipped is judged on everything else', () => {
  // No form_ms in the body at all. Silence must not read as speed, or the
  // rollout would throw away every visitor still on the old bundle — and it
  // must not read as zero either, which is what Number() would make of it.
  for (const elapsedMs of [undefined, null, '']) {
    const verdict = classifyLeadSubmission({ ...realLead, elapsedMs });
    assert.deepEqual(verdict.hard, [], `elapsedMs=${JSON.stringify(elapsedMs)}`);
    assert.deepEqual(verdict.soft, ['no_form_timer'], `elapsedMs=${JSON.stringify(elapsedMs)}`);
    assert.equal(verdict.spam, false, `elapsedMs=${JSON.stringify(elapsedMs)}`);
  }
});

test('a script posting straight at the route with no page behind it is caught', () => {
  // curl with a hand-written body: no Origin because nothing navigated, and no
  // duration because no form was ever open. Neither is damning alone; together
  // they describe something that never loaded the page.
  const verdict = classifyLeadSubmission({
    name: 'Ana Rojas',
    email: 'ana.rojas@gmail.com',
    phone: '+506 8404 6973',
    hasBrowserOrigin: false,
  });
  assert.deepEqual(verdict.soft, ['no_origin', 'no_form_timer']);
  assert.equal(verdict.spam, true);
});

test('a standalone ad page we do not control still gets through', () => {
  // Posts cross-origin from a real browser, so it has an Origin, but it is not
  // our bundle and sends no duration. One oddity, and it is allowed.
  const verdict = classifyLeadSubmission({
    ...realLead,
    elapsedMs: undefined,
    hasBrowserOrigin: true,
  });
  assert.equal(verdict.spam, false);
});

test('a page that sends no duration is still judged only on the person', () => {
  // The AdWords pages at /lp and /glp-1 are plain HTML rather than our React
  // forms, and neither reported a duration. Every lead off them therefore
  // arrived already carrying no_form_timer, and one ordinary quirk on top —
  // a Costa Rican number that happens to read as a run, a throwaway inbox, a
  // long name — was enough to bin it. The visitor was told it had been
  // received and Ads counted the conversion, so nothing looked wrong until the
  // leads did not arrive.
  //
  // From a real browser, silence about the page must not be evidence about the
  // person: it takes two things wrong with the submission itself.
  for (const quirk of [
    { phone: '+506 8765 4321' },
    { email: 'ana@mailinator.com' },
    { name: 'Dr. Roberto Castillo Mena de la Vega Jiménez Rojas Solano Mora' },
  ]) {
    const verdict = classifyLeadSubmission({
      ...realLead,
      ...quirk,
      elapsedMs: undefined,
      hasBrowserOrigin: true,
    });
    assert.ok(verdict.soft.includes('no_form_timer'), JSON.stringify(quirk));
    assert.equal(verdict.spam, false, JSON.stringify(quirk));
  }

  // Two things wrong with the submission itself is still a drop, timer or no.
  const twoQuirks = classifyLeadSubmission({
    ...realLead,
    email: 'x@guerrillamail.com',
    phone: '11111111',
    elapsedMs: undefined,
    hasBrowserOrigin: true,
  });
  assert.equal(twoQuirks.spam, true);

  // And the pair that describes a script — no page behind it at all — is
  // untouched by this: silence about the duration still counts there.
  const scripted = classifyLeadSubmission({
    ...realLead,
    elapsedMs: undefined,
    hasBrowserOrigin: false,
  });
  assert.equal(scripted.spam, true);
});

test('a clock that moved backwards is not treated as a bot', () => {
  const verdict = classifyLeadSubmission({ ...realLead, elapsedMs: -4000 });
  assert.equal(verdict.spam, false);
});

test('a link in the name field is enough on its own', () => {
  for (const name of ['Buy now http://cheap.example', 'visit www.example.com', 'Ana [url=x]']) {
    const verdict = classifyLeadSubmission({ ...realLead, name });
    assert.equal(verdict.spam, true, name);
    assert.ok(verdict.hard.includes('link_in_name'), name);
  }
});

test('someone writing their own name and address together is not a link', () => {
  const verdict = classifyLeadSubmission({ ...realLead, name: 'Ana Rojas <ana.rojas@gmail.com>' });
  assert.equal(verdict.spam, false);
});

test('one oddity on its own is never enough', () => {
  // A throwaway inbox, and nothing else out of place. Unusual, but a real
  // person can send this and would expect a call back.
  const verdict = classifyLeadSubmission({ ...realLead, email: 'ana@mailinator.com' });
  assert.deepEqual(verdict.soft, ['disposable_email']);
  assert.equal(verdict.spam, false);
});

test('two oddities together are', () => {
  const verdict = classifyLeadSubmission({
    ...realLead,
    email: 'x@guerrillamail.com',
    phone: '11111111',
  });
  assert.deepEqual(verdict.soft, ['disposable_email', 'filler_phone']);
  assert.equal(verdict.spam, true);
});

test('recognises a phone number typed only to get past validation', () => {
  const filler = ['11111111', '12345678', '9876543210', '+506 1111-1111'];
  for (const phone of filler) {
    const verdict = classifyLeadSubmission({ ...realLead, phone });
    assert.ok(verdict.soft.includes('filler_phone'), phone);
  }
});

test('leaves real Costa Rican and US numbers alone', () => {
  for (const phone of ['+506 8404 6973', '506 7019 5752', '+1 (831) 471-5559']) {
    const verdict = classifyLeadSubmission({ ...realLead, phone });
    assert.ok(!verdict.soft.includes('filler_phone'), phone);
  }
});

test('flags a name written in a script this shop does not sell in', () => {
  const verdict = classifyLeadSubmission({ ...realLead, name: 'Владимир' });
  assert.ok(verdict.soft.includes('name_off_script'));
});

test('keeps Spanish names with accents and ñ', () => {
  for (const name of ['José Muñoz', 'Ángela Peña', 'François Léger']) {
    const verdict = classifyLeadSubmission({ ...realLead, name });
    assert.equal(verdict.spam, false, name);
    assert.deepEqual(verdict.reasons, [], name);
  }
});

test('flags a name that is a paragraph or a keyboard mash', () => {
  assert.ok(classifyLeadSubmission({ ...realLead, name: '#### $$$$ ####' }).soft.includes('name_has_no_letters'));
  assert.ok(classifyLeadSubmission({
    ...realLead,
    name: 'we can rank your website on the first page of Google today',
  }).soft.includes('name_too_long'));
});

test('flags two fingers on a keyboard, but not a person using initials', () => {
  // The junk that reached the inbox: name "Gf", phone "5". The phone is
  // refused outright now (see lead-contact.test.mjs); this is the second lock.
  assert.deepEqual(classifyLeadSubmission({ ...realLead, name: 'Gf' }).soft, ['name_not_wordlike']);
  assert.ok(classifyLeadSubmission({ ...realLead, name: 'qwrt' }).soft.includes('name_not_wordlike'));

  // One oddity is not a drop: "JM" with a real number and a real address is a
  // person who entered their initials.
  assert.equal(classifyLeadSubmission({ ...realLead, name: 'JM' }).spam, false);

  // And real short names keep their vowels.
  for (const name of ['Ana', 'Li', 'Jose', 'Muñoz', 'Ángela']) {
    assert.deepEqual(classifyLeadSubmission({ ...realLead, name }).soft, [], name);
  }
});

test('a missing Origin header is suspicious but not disqualifying on its own', () => {
  // Still timed, so this is a browser that sent no Origin rather than a script.
  const scripted = classifyLeadSubmission({ ...realLead, hasBrowserOrigin: false });
  assert.deepEqual(scripted.soft, ['no_origin']);
  assert.equal(scripted.spam, false);

  // Paired with anything else, though, it is a script.
  const withJunk = classifyLeadSubmission({
    ...realLead,
    hasBrowserOrigin: false,
    name: 'ana.rojas@gmail.com',
  });
  assert.equal(withJunk.spam, true);
});

test('an empty submission is not mistaken for a bot', () => {
  // The route still rejects this for having no name; the classifier must not
  // be what turns it away, or the visitor gets a fake success instead of the
  // validation message that tells them what to fix.
  const verdict = classifyLeadSubmission({});
  assert.deepEqual(verdict.hard, []);
  assert.equal(verdict.spam, false);
});

test('the honeypot field name is the one the forms post', () => {
  // The form and the route agree only because both read this constant; if it
  // is ever renamed in one place the trap silently stops catching anything.
  assert.equal(HONEYPOT_FIELD, 'subject');
});
