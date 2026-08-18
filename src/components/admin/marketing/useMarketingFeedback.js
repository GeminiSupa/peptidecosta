"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from 'lucide-react';

const TONE_ICONS = { success: CheckCircle2, error: AlertTriangle, warning: AlertTriangle, info: Info };
const DISMISS_MS = { success: 4000, info: 4000, warning: 7000, error: 9000 };

let nextToastId = 0;

/**
 * In-app replacement for alert() and confirm() across Marketing Studio.
 *
 * Native dialogs were the wrong shape for this surface twice over. alert()
 * blocks the whole tab, so a background send finishing mid-edit froze the
 * editor, and it drops the message the moment it is dismissed — there was no
 * way to re-read what a failed send actually said. confirm() cannot describe
 * what it is about to do beyond one line of plain text, which is thin for
 * "send to 1,481 people".
 *
 * confirm() here returns a promise so call sites keep reading the way they
 * did: `if (!(await confirm({...}))) return;`
 */
export function useMarketingFeedback() {
  const [toasts, setToasts] = useState([]);
  const [request, setRequest] = useState(null);
  const timersRef = useRef(new Map());
  const resolveRef = useRef(null);

  const dismiss = useCallback((id) => {
    setToasts(current => current.filter(toast => toast.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const notify = useCallback((message, tone = 'info') => {
    if (!message) return null;
    const id = ++nextToastId;
    setToasts(current => [...current.slice(-3), { id, message: String(message), tone }]);
    // Errors stay put until dismissed; a failed send is the one message you
    // want to still be on screen after you have looked something up.
    if (tone !== 'error') {
      timersRef.current.set(id, setTimeout(() => dismiss(id), DISMISS_MS[tone] ?? 5000));
    }
    return id;
  }, [dismiss]);

  const confirm = useCallback((options) => {
    const settings = typeof options === 'string' ? { message: options } : (options || {});
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setRequest({
        title: settings.title || 'Are you sure?',
        message: settings.message || '',
        detail: settings.detail || '',
        confirmLabel: settings.confirmLabel || 'Confirm',
        cancelLabel: settings.cancelLabel || 'Cancel',
        tone: settings.tone || 'default',
      });
    });
  }, []);

  const settle = useCallback((answer) => {
    setRequest(null);
    const resolve = resolveRef.current;
    resolveRef.current = null;
    resolve?.(answer);
  }, []);

  useEffect(() => {
    if (!request) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') settle(false);
      if (event.key === 'Enter') settle(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [request, settle]);

  const timers = timersRef;
  useEffect(() => () => {
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
  }, [timers]);

  const feedback = (
    <>
      {toasts.length > 0 && (
        <div className="mkt-toast-stack" role="region" aria-label="Notifications">
          {toasts.map(({ id, message, tone }) => {
            const Icon = TONE_ICONS[tone] || Info;
            return (
              <div key={id} className={`mkt-toast mkt-toast-${tone}`} role="status" aria-live="polite">
                <Icon size={15} aria-hidden="true" />
                <span>{message}</span>
                <button type="button" onClick={() => dismiss(id)} aria-label="Dismiss">
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {request && (
        <div className="mkt-confirm-backdrop" role="presentation" onClick={() => settle(false)}>
          <div
            className="mkt-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="mkt-confirm-title"
            onClick={event => event.stopPropagation()}
          >
            <h4 id="mkt-confirm-title">{request.title}</h4>
            {request.message && <p>{request.message}</p>}
            {request.detail && <p className="mkt-confirm-detail">{request.detail}</p>}
            <div className="mkt-confirm-actions">
              <button type="button" className="mkt-btn" onClick={() => settle(false)}>
                {request.cancelLabel}
              </button>
              <button
                type="button"
                className={`mkt-btn ${request.tone === 'danger' ? 'mkt-btn-danger' : 'mkt-btn-primary'}`}
                onClick={() => settle(true)}
                autoFocus
              >
                {request.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return { notify, confirm, feedback, dismiss };
}

/** Small helper for the common "spinner while a row action runs" case. */
export function ActionSpinner({ busy, icon: Icon, size = 13 }) {
  return busy ? <Loader2 size={size} className="animate-spin" /> : <Icon size={size} />;
}
