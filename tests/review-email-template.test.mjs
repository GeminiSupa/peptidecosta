import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BUTTONS_PLACEHOLDER,
  buildReviewRequestEmail,
  reviewDestinations,
} from '../src/lib/reviewRequestEmail.mjs';
import { normalizeReviewSettings, reviewEmailTemplate } from '../src/lib/reviewSettings.mjs';

const dest = { google: 'https://site/click?p=google', facebook: 'https://site/click?p=facebook', trustpilot: '' };
const build = (template, lang = 'es') =>
  buildReviewRequestEmail({ customerName: 'Ana', lang, destinations: dest, template });

test('no template means the built-in email, unchanged', () => {
  const withNone = build(null);
  const withBlank = build({ subject: '', body: '' });
  assert.equal(withNone.html, withBlank.html);
  assert.ok(withNone.html.includes(dest.google), 'the buttons are still there');
});

test('a custom body is used, with the placeholders filled', () => {
  const { html } = build({ body: `<h1>Hola {{name}}</h1>${BUTTONS_PLACEHOLDER}<p>Gracias</p>` });
  assert.ok(html.includes('<h1>Hola Ana</h1>'));
  assert.ok(html.includes('Gracias'));
  assert.ok(html.includes(dest.google), 'the real buttons are injected');
  assert.doesNotMatch(html, /\{\{buttons\}\}/, 'the placeholder itself is gone');
});

test('a custom subject is used, and can carry the name', () => {
  const { subject } = build({ subject: '{{name}}, how did we do?', body: '' });
  assert.equal(subject, 'Ana, how did we do?');
});

test('a blank subject keeps the built-in one even with a custom body', () => {
  const { subject } = build({ subject: '', body: `x${BUTTONS_PLACEHOLDER}` });
  assert.equal(subject, build(null).subject);
});

test('a body without the buttons placeholder is refused, not sent', () => {
  // The failure this prevents: an email that arrives looking fine with nothing
  // to click, which nobody notices because the send succeeded.
  const { html } = build({ body: '<p>Please review us!</p>' });
  assert.equal(html, build(null).html, 'falls back to the built-in email');
  assert.ok(html.includes(dest.google));
});

test('the settings refuse to store a body with no buttons', () => {
  const s = normalizeReviewSettings({ emailBodyEs: '<p>no buttons here</p>' }, {});
  assert.equal(s.emailBodyEs, '', 'blank means the built-in email is used');

  const ok = normalizeReviewSettings({ emailBodyEs: `<p>hi</p>${BUTTONS_PLACEHOLDER}` }, {});
  assert.ok(ok.emailBodyEs.includes(BUTTONS_PLACEHOLDER));
});

test('the two languages are kept apart', () => {
  const settings = normalizeReviewSettings({
    emailSubjectEs: 'Asunto ES',
    emailBodyEs: `ES ${BUTTONS_PLACEHOLDER}`,
    emailSubjectEn: 'Subject EN',
    emailBodyEn: `EN ${BUTTONS_PLACEHOLDER}`,
  }, {});

  assert.deepEqual(reviewEmailTemplate(settings, 'es'), { subject: 'Asunto ES', body: `ES ${BUTTONS_PLACEHOLDER}` });
  assert.deepEqual(reviewEmailTemplate(settings, 'en'), { subject: 'Subject EN', body: `EN ${BUTTONS_PLACEHOLDER}` });

  assert.ok(build(reviewEmailTemplate(settings, 'es'), 'es').html.includes('ES '));
  assert.ok(build(reviewEmailTemplate(settings, 'en'), 'en').html.includes('EN '));
});

test('editing one language leaves the other on the built-in email', () => {
  const settings = normalizeReviewSettings({ emailBodyEs: `custom ${BUTTONS_PLACEHOLDER}` }, {});
  assert.equal(reviewEmailTemplate(settings, 'en').body, '');
  assert.equal(build(reviewEmailTemplate(settings, 'en'), 'en').html, build(null, 'en').html);
});

test('an unknown placeholder is left visible rather than blanked', () => {
  // So a typo shows up in the preview instead of silently deleting a line.
  const { html } = build({ body: `{{nmae}} ${BUTTONS_PLACEHOLDER}` });
  assert.ok(html.includes('{{nmae}}'));
});

test('the customer name is escaped inside a custom template', () => {
  const { html } = buildReviewRequestEmail({
    customerName: '<script>alert(1)</script>',
    lang: 'es',
    destinations: dest,
    template: { body: `{{name}} ${BUTTONS_PLACEHOLDER}` },
  });
  assert.doesNotMatch(html, /<script>/);
  assert.ok(html.includes('&lt;script&gt;'));
});

test('only the offered sites appear, custom template or not', () => {
  const oneSite = { google: '', facebook: 'https://site/click?p=facebook', trustpilot: '' };
  const { html } = buildReviewRequestEmail({
    customerName: 'Ana', lang: 'es', destinations: oneSite,
    template: { body: `hi ${BUTTONS_PLACEHOLDER}` },
  });
  assert.ok(html.includes(oneSite.facebook));
  assert.doesNotMatch(html, /Rese.ar en Google/);
});

test('the save route explains a rejected template instead of blanking it', async () => {
  const src = await readFile(new URL('../src/app/api/admin/review-settings/route.js', import.meta.url), 'utf8');
  assert.match(src, /BUTTONS_PLACEHOLDER/);
  assert.match(src, /422/, 'rejected with a reason, not silently normalised away');
});

test('both send paths pass the template through', async () => {
  const cron = await readFile(new URL('../src/app/api/cron/review-requests/route.js', import.meta.url), 'utf8');
  const manual = await readFile(new URL('../src/app/api/admin/reviews/send/route.js', import.meta.url), 'utf8');
  for (const [name, src] of [['cron', cron], ['manual send', manual]]) {
    assert.match(src, /reviewEmailTemplate\(/, `${name} uses the configured template`);
  }
});

test('the built-in email still works with nothing configured at all', () => {
  const d = reviewDestinations({}, {});
  const { subject, html } = buildReviewRequestEmail({ customerName: 'Ana', lang: 'es', destinations: d });
  assert.ok(subject.length > 0);
  assert.ok(html.includes(d.google));
});
