# Analytics aggregation

`analytics-aggregates-migration.sql` adds one Postgres function,
`analytics_overview(range_start, range_end)`, and the indexes it groups on.

## Why it exists

The analytics dashboard read seven tables and derived every figure in the
browser. Four of them are far past the endpoint's 1,000-row ceiling:

| table | rows (30 Aug 2026) | rows the tab read |
| --- | --- | --- |
| `visitor_sessions` | 127,199 | 1,000 |
| `click_events` | 101,229 | 1,000 |
| `analytics_events` | 75,770 | 1,000 |
| `product_views` | 14,334 | 1,000 |

So product view counts, per-product conversion, traffic by domain and page,
acquisition channels, top cities, the device split and average catalog time were
all computed from the newest 1,000 rows. The tab admitted it in a banner
covering the whole page — and a conversion rate that comes with a disclaimer is
not a conversion rate.

`analytics_overview` returns the grouped result instead of the rows behind it:
about a hundred rows however large the tables get. The endpoint calls it once
per window, so a previous-period comparison is the same call with a shifted
window rather than a second download of everything.

## What is deliberately not in it

Order and cart figures. Refund handling lives in `src/lib/orderRevenue.mjs` and
is shared with every other screen; a second copy in SQL would eventually
disagree with it, and two revenue numbers that disagree are worse than one.
Both tables are inside the row ceiling anyway (816 orders, 33 carts).

The mobile click heatmap also stays on sampled rows — it is a density picture,
not a figure anyone decides on, and it is labelled as a sample.

## Before and after

The dashboard prefers the aggregate and keeps every row-derived path as its
fallback, so nothing breaks before the migration runs and nothing needs
redeploying after. The only visible difference is the sampling banner: it names
only what is still read from a sample, which after the migration is the heatmap
alone.

## Applying it

Paste the whole file into the Supabase SQL editor and run it. It is idempotent —
`CREATE OR REPLACE FUNCTION` and `CREATE INDEX IF NOT EXISTS` throughout.

If it errors on line 1, the copy dropped the leading `--`. Select from the very
first character.
