import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { HONEYPOT_FIELD } from '../src/lib/leadSpam.mjs';

/**
 * The two paid-ad landing pages are plain HTML in public/ rather than React,
 * so nothing makes them use LeadFormTrap and nothing made them agree with the
 * route about what to send. They drifted, and the drift was invisible: the
 * route answers a dropped submission with the same success body a saved one
 * gets, so the page said thank you, Google Ads counted the conversion, and the
 * lead was gone. Three of them went missing off /lp before anyone noticed.
 *
 * These tests are the tie the React forms get from importing the constant.
 */

const PAGES = [
  ['/lp', '../public/lp/index.html'],
  ['/glp-1', '../public/glp-1/index.html'],
];

for (const [route, path] of PAGES) {
  test(`${route} posts the honeypot for the route to judge, not just the browser`, async () => {
    const html = await readFile(new URL(path, import.meta.url), 'utf8');

    // The field has to arrive under the name src/lib/leadSpam.mjs reads. Both
    // pages called it "company" and checked it only in their own submit
    // handler, which catches a bot driving the page and nothing at all posting
    // straight at the route.
    assert.match(
      html,
      new RegExp(`name="${HONEYPOT_FIELD}"`),
      `the hidden input is named ${HONEYPOT_FIELD}`,
    );
    assert.match(
      html,
      new RegExp(`${HONEYPOT_FIELD}:\\s`),
      'and its value is in the posted payload',
    );
    assert.doesNotMatch(html, /name="company"/, 'the old name is gone from the markup');
  });

  test(`${route} reports how long the form was open`, async () => {
    const html = await readFile(new URL(path, import.meta.url), 'utf8');

    // Without this every lead off the page arrived carrying no_form_timer, so
    // one ordinary quirk — a number that reads as a run, a throwaway inbox —
    // was enough to bin a paid lead. The classifier no longer counts silence
    // from a real browser, but the duration is what lets a fast script be
    // caught at all, so both pages have to send it.
    assert.match(html, /form_ms:\s/, 'form_ms is in the posted payload');
    assert.match(
      html,
      /Date\.now\(\) - (formOpenedAt|openedAt)/,
      'measured from when the visitor was shown the form',
    );
  });
}
