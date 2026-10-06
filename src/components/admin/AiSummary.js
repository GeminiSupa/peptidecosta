'use client';

import React from 'react';

import { parseAiSummary } from '@/lib/aiSummaryMarkdown.mjs';

/**
 * Model output, rendered as React elements instead of injected as HTML.
 *
 * The Leads and Carts panels used to build their AI panel's HTML from two
 * regexes and hand the result to `dangerouslySetInnerHTML`. Anything the model
 * returned that those two regexes did not recognise — a tag, an `onerror`
 * attribute — went through untouched and ran inside the admin session, where
 * the Supabase token is sitting in localStorage.
 *
 * That mattered because the model's input is not ours. A visitor chooses their
 * own `?utm_source=` on the catalog (src/app/catalog/page.js), it is stored
 * unfiltered by /api/leads/capture, and src/app/admin/page.js interpolates the
 * stored value straight into the prompt as the "Traffic Source Breakdown". The
 * reply is then asked to analyse those channels by name, so the model has both
 * the material and the instruction to echo it back.
 *
 * Everything below is a React child, so model output is text by construction
 * rather than by remembering to escape it. `parseAiSummary` recognises only the
 * small grammar the prompts ask for — headings, bullets, `**bold**` — and
 * leaves anything else literal, which is the safe failure.
 *
 * AnalyticsDashboard.js has its own copy of this renderer, keyed to its own CSS
 * variables, and was already safe; it is deliberately left alone rather than
 * folded in here.
 */
export default function AiSummary({
  text,
  accentColor = '#38bdf8',
  style,
}) {
  const renderSpans = (spans) => spans.map((span, index) => (
    span.bold
      ? <strong key={index} style={{ color: accentColor }}>{span.text}</strong>
      : <React.Fragment key={index}>{span.text}</React.Fragment>
  ));

  return (
    <div style={style}>
      {parseAiSummary(text).map((block, index) => {
        if (block.type === 'list') {
          return (
            <ul
              key={index}
              style={{ margin: '0 0 10px', paddingLeft: '20px', listStyleType: 'square' }}
            >
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} style={{ marginBottom: '6px' }}>{renderSpans(item)}</li>
              ))}
            </ul>
          );
        }

        if (block.type === 'heading') {
          return (
            <div
              key={index}
              role="heading"
              aria-level={block.level}
              style={{
                margin: '14px 0 6px',
                fontWeight: 700,
                color: '#f8fafc',
                fontSize: block.level <= 2 ? '1rem' : '0.9rem',
              }}
            >
              {renderSpans(block.spans)}
            </div>
          );
        }

        return <p key={index} style={{ margin: '0 0 8px' }}>{renderSpans(block.spans)}</p>;
      })}
    </div>
  );
}
