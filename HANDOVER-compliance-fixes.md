# Handover — `compliance-fixes` branch

Branched from `main` at `b559f98`. Six commits. Build passes, 1751 of 1753 tests
pass (the 2 failures are pre-existing `trustpilot-rating` assertions, unrelated).

**Not merged to `main` on purpose.** Omer reviews before it ships.

---

## Why this branch exists

The card processor shut off card payments. Getting them back needs specific
changes to the site. An earlier pass on `main` made some of them but missed
others, and introduced a few new faults. This branch is the cleanup.

One pattern is worth knowing before you read anything else, because it explains
most of what went wrong:

> **`site_settings` rows in the database override the defaults in
> `landingContent.js`.** Editing copy in code changes nothing on the live site
> if a DB row exists for that page. A diff can look completely done while
> production is unchanged.

Some pages are protected from this — `mergePublicPageSettings` discards a stored
row whose `pageVersion` no longer matches the code's, which is why the About and
homepage rewrites did land. Not every page has that guard. Check before assuming.

---

## What is in here

| Commit | What it does |
|---|---|
| `8136813` | **Checkout acknowledgement gate** — the headline processor requirement |
| `f7b3df9` | Entry disclaimer: bilingual, and no longer breaks inside the iframe |
| `358c4ce` | Footer links repaired; dosing guidance removed from the Info Center |
| `d901f7c` | Help bot privilege hole (`/api/ai` trusted the browser's claimed role) |
| `3de133e` | WhatsApp assistant no longer honours expired promo codes |
| `f7ae629` | Tests pinning all of the above |

Each commit message explains its own reasoning in full. Read those rather than
this file if you are touching one of them.

---

## Two migrations to run by hand

Repo convention: paste into the Supabase SQL editor. Both are safe to re-run.

**1. `add-order-research-acknowledgement.sql`** — adds two nullable columns to
`orders` recording which wording a customer agreed to and when.

Not urgent. The gate works without it: `api/orders/create` refuses an order
lacking the acknowledgement whether or not the columns exist, and the columns
are on the droppable list so a deploy landing before the SQL cannot break
checkout. Without it you simply lose the audit trail, which is the thing an
underwriter asks to see.

**2. `deactivate-expired-promo-codes.sql`** — corrects `is_active` on 163 promo
codes whose `valid_until` has passed.

Also not urgent, and changes nothing for customers: checkout and the assistant
both check the date, not the flag. It exists so the next person to read
`is_active` is not misled — right now the flag is wrong on about 98% of rows.
Deliberately does **not** touch codes that merely hit a `usage_limit`.

---

## Still outstanding — needs a decision, not code

These are real and verified against the live database. They were left alone
because they are content and business calls, not engineering ones.

**Retatrutide is still live in two places.**

- 10 product rows still open their description with *"Retatrutide is an
  investigational triple-receptor agonist… for obesity and type 2 diabetes…
  patients losing up to 24% of body weight"*. The rename commit on `main`
  touched CSVs, tests and comments — not the database, which is what the site
  reads. Spanish says *"la retatrutida"*, so a find/replace on the English
  spelling misses it.
- The catalog hero photo has a vial labelled **"Retatrutide 10 mg"** visible on
  it. Needs a new photo; cannot be fixed in code.

**The category names.** Live categories still include `Weight Loss & Metabolism`
(26 products), `Anti-Aging & Longevity`, `Recovery & Healing`, `Sexual Health`,
`Sleep`. Renaming changes the chips, the nav and every deep link, so it needs
Joe's sign-off on the replacements.

**Three switched-off announcement banners still say Retatrutide** (`RETA15`,
`FLASH10`, `RETA10`). Invisible to customers, but one click in admin from being
live again. Also three duplicate `CELLULAR40` banners. Admin UI job, no code.

---

## Things to be careful of

**`src/app/catalog/page.js` is one inline file of ~5,300 lines.** Both of us will
be in it. Coordinate before you start, or expect a painful merge.

**Do not `git checkout --` a file in this repo without checking what is in it
first.** It discards uncommitted work with no undo. It cost the checkout gate
once in this session; recovery was only possible because a source map in
`.next/` still held the original. Everything here is committed now, which is
partly why this branch exists.

**The before/after transformation photo stays.** It was removed at one point and
put back — the decision is Joe's, not ours. If it comes up again, that is a
conversation to have with him, not a change to make.

**Run the tests with a glob**, not the bare directory:

```bash
node --test tests/*.test.mjs
```

---

## If you want to build on this

```bash
git fetch origin
git checkout compliance-fixes
```

Please branch off this rather than duplicating the work on `main` — several of
these touch the same files.

Questions go to Omer.
