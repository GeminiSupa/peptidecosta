'use client';

import { useCallback, useEffect, useId, useRef } from 'react';
import { HONEYPOT_FIELD } from '@/lib/leadSpam.mjs';

/**
 * The two client-side halves of the bot filtering in src/lib/leadSpam.mjs: a
 * field only a machine will fill, and a clock only a machine will outrun.
 *
 * Both live here rather than in each form so the three public lead forms — the
 * storefront Contáctenos dialog, the standalone AdWords form and the ad
 * landing page's step-through modal — cannot drift apart, and so the field
 * name stays tied to the constant the route reads.
 */

/**
 * Gone from the page, gone from the accessibility tree, gone from the tab
 * order. `position: absolute` with a 1px box and `clip-path` rather than
 * `display: none`: it takes no layout space and cannot widen the page, and it
 * still looks to a script parsing the HTML like an ordinary text input.
 */
const HIDDEN = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  border: 0,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

/**
 * The honeypot input.
 *
 * `aria-hidden` and `tabIndex={-1}` together are what make this safe rather
 * than merely invisible: a screen-reader user is never read the field and a
 * keyboard user can never tab into it, so no real visitor can fill it by
 * accident and be thrown away for it.
 *
 * Uncontrolled on purpose. A controlled input is only worth what React's state
 * says it is, and a script that assigns `input.value` without dispatching an
 * event — the cheapest way to fill a form — would leave that state empty and
 * walk through the trap. Read straight off the DOM at submit time, anything
 * that put a value here is caught, however it did it.
 */
export default function LeadFormTrap({ inputRef }) {
  // Generated, not hard-coded: the global Contáctenos dialog is mounted in the
  // root layout, so it shares a document with whichever other lead form the
  // page renders and a fixed id would appear twice.
  const id = useId();

  return (
    <div style={HIDDEN} aria-hidden="true">
      <label htmlFor={id}>Leave this field empty</label>
      <input
        id={id}
        ref={inputRef}
        name={HONEYPOT_FIELD}
        type="text"
        defaultValue=""
        tabIndex={-1}
        autoComplete="off"
      />
    </div>
  );
}

/**
 * The ref for the trap above, plus the time the form has been open.
 *
 * `resetKey` restarts the clock and empties the field: the dialogs are mounted
 * once and reopened, and a visitor who opens the form twenty minutes after the
 * page loaded and fills it in six seconds must not be measured from page load.
 * Pass whatever marks a fresh start — usually the dialog's `open` flag.
 *
 * `trapFields()` returns the pair to merge into the request body. It reads at
 * submit time rather than tracking state, so the duration is the real one and
 * the field is whatever is actually in the DOM.
 */
export function useLeadFormTrap(resetKey) {
  const trapRef = useRef(null);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    startedAt.current = Date.now();
    if (trapRef.current) trapRef.current.value = '';
  }, [resetKey]);

  const trapFields = useCallback(() => ({
    [HONEYPOT_FIELD]: trapRef.current?.value || '',
    form_ms: Date.now() - startedAt.current,
  }), []);

  return { trapRef, trapFields };
}
