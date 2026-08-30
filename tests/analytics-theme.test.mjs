import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { ANALYTICS_COLORS, CHART_SERIES, chartColor } from '../src/lib/analyticsTheme.mjs';

const readTokens = async () => {
  const css = await readFile(new URL('../src/app/admin.css', import.meta.url), 'utf8');
  const tokens = {};
  for (const [, name, value] of css.matchAll(/(--an-[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})/g)) {
    tokens[name] = value.toLowerCase();
  }
  return tokens;
};

const CSS_NAMES = {
  ink: '--an-ink',
  inkSoft: '--an-ink-soft',
  inkMuted: '--an-ink-muted',
  inkFaint: '--an-ink-faint',
  inkDim: '--an-ink-dim',
  surface: '--an-surface',
  surfaceRaised: '--an-surface-raised',
  rule: '--an-rule',
  accent: '--an-accent',
  accentAlt: '--an-accent-alt',
  positive: '--an-positive',
  negative: '--an-negative',
  warning: '--an-warning',
};

test('the JS palette and the CSS tokens hold the same values', async () => {
  const tokens = await readTokens();
  for (const [key, cssName] of Object.entries(CSS_NAMES)) {
    assert.equal(
      tokens[cssName],
      ANALYTICS_COLORS[key].toLowerCase(),
      `${cssName} and ANALYTICS_COLORS.${key} have drifted apart`,
    );
  }
});

test('every chart series has a matching CSS token', async () => {
  const tokens = await readTokens();
  CHART_SERIES.forEach((colour, index) => {
    assert.equal(tokens[`--an-chart-${index + 1}`], colour.toLowerCase());
  });
});

test('the series palette has no duplicates', () => {
  assert.equal(new Set(CHART_SERIES).size, CHART_SERIES.length);
});

test('a chart with more series than the palette wraps rather than running out', () => {
  assert.equal(chartColor(0), CHART_SERIES[0]);
  assert.equal(chartColor(CHART_SERIES.length), CHART_SERIES[0]);
  assert.equal(chartColor(-1), CHART_SERIES[CHART_SERIES.length - 1]);
});
