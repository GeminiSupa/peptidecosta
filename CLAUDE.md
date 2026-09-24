@AGENTS.md

# How the owner wants you to work

Omer (`omerforce@gmail.com`, pushes as `GeminiSupa`) is the developer here. Joe
Webster holds money authority — never ask Omer to approve payouts.

- **Plain language, numbered steps, one topic at a time.** He is in Pakistan,
  11 hours ahead of Costa Rica. Business timestamps are Costa Rica time; use
  `formatCrDate` / `formatCrInstant`, never the reader's clock.
- **Answer what was asked.** When he asks "how do I do X in the admin", give the
  steps. Do not hand back a design discussion, a menu of options, or a question
  he has to answer before he gets anything. If the honest answer is "the portal
  cannot do that yet", say that in one line, then say what you will do about it.
- **Do not offer manual workarounds in place of the thing he asked for.** He has
  said outright that being handed "lame ways" instead of a fix is not acceptable.
- **Write for a vibe coder, in plain English.** Omer's skill is describing a
  problem — his own or a client's — and asking an agent to fix it. He does not
  have the vocabulary for our terminology, and he wants to learn, so explain
  rather than name-drop. No jargon unless you define it in the same breath, in
  ordinary words. No walls of text, no tables of internal function names, no
  "as designed" as if that settles anything. If you must name a file or a
  column, say in one short line what it is for.
- **Always answer in this shape:** what the problem actually is, what you
  changed, why you changed it, and what could be affected. Short. Numbered.
  He should never have to decode an answer to find out whether he is safe.
- **He is frustrated by long, expensive, circling answers.** Do the
  investigation quietly and hand him the conclusion. A wrong guess he can
  correct in one line beats a thorough essay he has to read twice.
- **He wants the real fix, not an explanation of why it is hard.** If something
  truly cannot be fixed without a bigger change, say that in one line and say
  what the bigger change is.

- **He will tell you when he has pushed.** You may be blocked from pushing; if a
  push is refused, commit, say so plainly, and give him the one command to run.

# Do not break nine things fixing one

This has happened often enough to be the standing rule: a change lands, and
things nobody asked about stop working. Scope is not a suggestion here.

- **Change only what was asked for.** Do not refactor, rename, tidy, reformat
  or "improve" code you happened to open. If you spot something else wrong,
  say so in one line and leave it alone until he says to touch it.
- **Find every place the thing you are changing is used before you change it.**
  Grep for the function, the column, the string, the offer type, the status
  value. This codebase prices the cart twice, describes deals in seven places
  and pays commission down two separate paths. One edit is almost never one
  place. The offer-type checklist below is what "look at all the related
  pieces" means in practice.
- **Two implementations of the same rule must move together.** Browser vs
  server pricing, catalog vs deal page copy, affiliate payout vs sales-agent
  payout. Touching one side only is how a customer gets shown one price and
  charged another.
- **Prefer the narrow fix.** A one-line guard that solves the reported problem
  beats a rewrite that solves it more elegantly and breaks two other callers.
- **Never delete or overwrite data, rows or files to make a problem go away.**
  Diagnose first. Read the row before you write it.
- **Say what you did not test.** Listing green tests while a surface went
  unexercised is how the last three breakages were reported as done.

If the correct fix genuinely is large, say that plainly and wait for him to
agree before you start — do not begin a wide change on your own judgement.

# What "done" means for the admin portal

Omer's standard, in his words: good software is **easy to use** and **does what
it promises**. The admin portal exists to make someone's job easier. It has
drifted the other way — too static, too confusing, screens that state facts
instead of letting a person act on them.

So when you touch the admin:

- If the portal cannot do the thing he asked for, the answer is to **build it
  there**, not to hand him a link to paste or a database row to edit by hand.
- A screen that shows a number but no way to change it is unfinished. So is one
  that needs him to already know which of two reports a person appears on.
- Two ways to do the same job, where one silently does less (a link that
  attributes a sale but cannot discount it), is a bug in the portal even when
  every line of code is behaving as written.

# QA: the rule that matters most

**A test passing is not evidence that the feature works.** Twice in one day a
change was reported as verified on the strength of unit tests, and both times
production was broken: a flash sale that ribboned $35 on the card and billed the
full $70, and product saving that threw for every admin.

## Never say "verified", "working" or "tested" unless you exercised the real thing

For anything a customer or an admin touches, unit tests are the floor, not the
proof. Before reporting success you must have driven the actual surface.

**Always state, explicitly, what you did *not* test.** A short "I have not
exercised X" is worth more than a confident summary that turns out to be wrong.
Do not let a list of green tests imply coverage you do not have.

## Live QA on the storefront

The site is `https://catalog.peptidescostarica.net` (never a `*.vercel.app` URL
in shipped code or instructions).

1. **Check the deploy actually landed first.** `git fetch && git log --oneline -1
   origin/main`, then hard-reload. A stale page will happily show you the old
   behaviour and you will report the wrong conclusion — this happened.
2. **Two gates block the catalog.** A "RESEARCH USE ONLY | 21+" dialog, then an
   "Acceso Exclusivo al Catálogo" lead-capture modal. Dismiss the second with its
   X — **never type a phone number or email into it.**
3. **Product cards are lazy-rendered.** Scroll the whole page before looking for
   a card, and read names from `.product-name`, not from `innerText` of the card
   — off-screen cards return empty text and you will conclude the product is
   missing. That happened too.
4. **Read the money off the submit button**, e.g. `ENVIAR PEDIDO - ₡18,203`. The
   cart drawer shows no total; the line item shows the *undiscounted* unit price
   by design, because offer discounts land on the total, not the line.
5. **Never submit a test order.** Read the total and stop.

## The dual-pricing trap — check both sides, every time

**The cart is priced twice, by two separate implementations:**

| Where | File |
|---|---|
| Browser | `src/app/catalog/page.js` — `getPromoDiscountAmount`, `getEffectiveVolumePct`, `getFinalTotal` |
| Server | `src/lib/authoritativeCheckout.mjs` — the authority; recomputes before saving |

Touching one and not the other shows the customer one price and charges another.
If they disagree the order is refused at submission. `tests/flash-sale-cart-parity.test.mjs`
prices the same carts through both paths and fails on divergence — extend it
whenever you add a pricing rule.

The customer-facing summary is a third place: a discount that has no row in
`src/app/catalog/page.js` (`hasWeeklyDealDiscount`, `hasVolumeDiscount`,
`hasPromoDiscount`) simply vanishes from the arithmetic, leaving goods + shipping
that do not add up to the total.

## Adding an offer type or a discount is never one change

A `flat` offer was added to the pricing engine and then surfaced wrong in five
separate places, each found only by looking at the real page. When you add one,
walk every surface that renders or prices it:

1. `chooseDealOffer` — scoring (`src/lib/dealOffers.mjs`)
2. `authoritativeCheckout.mjs` — what the server charges
3. `src/app/catalog/page.js` — the browser's total **and** the order-summary row
4. `checkoutBreakdown.mjs` — the invoice figures
5. `src/app/deal-of-the-week/page.js` — the offer tiles
6. `dealOfferSummaries` / `dealOfferRuleSummaries` / `dealOfferCartMessage` /
   `flatOfferBadgeForProduct` — customer-facing wording and the catalog ribbon
7. `dealBannerText` / `dealBroadcastDrafts` — banner and announcement copy

A branch that reads `if (type === 'bundle') … else …` will silently treat the new
type as the old one — that is exactly how "Buy undefined+ vials" reached
customers. Grep for the existing type names and check every hit.

## Verifying against production data

`.env.local` holds live Supabase credentials. Write a throwaway `.mjs` **inside
the repo** (so `node_modules` resolves), load the env by hand, import the real
module, run it against real rows, then delete the script. This is how the promo
`$0` bug and the two-live-deals breakages were proven rather than guessed.

Tests: `node --test tests/*.test.mjs` — the glob form; the bare directory form
fakes a failure. **Five failures pre-exist on `main`** (catalog exchange rate,
split revenue tiles, three product-save-guard grid tests). Confirm any failure
also fails on a clean tree before blaming your change.

# Deals, flash sales and pricing

## Shape

A promotion is a row in `deals`. `kind` is `'weekly'` or `'flash'`; **one live
deal per kind**, enforced by `idx_deals_single_live_per_kind`. A flash sale is
always `pricing_mode: 'offers'` and never touches shelf prices.

`combineLiveDeals` (`src/lib/dealOfWeek.mjs`) pools every running deal into one
deal-shaped object so the catalog, cart and checkout keep seeing "one deal".
Each offer carries `deal_id` for attribution; offer ids are namespaced
`dealId:offerId` because ids are only unique within a deal.

**Pooling is for pricing, never for describing.** `/api/deals/current` returns
`deal` (pooled, price the cart with this), plus `weekly` and `flash` separately
(describe with these). The Deal of the Week page showed the pooled view and so
announced a flash sale as one of the week's "3 ways to save", under the weekly
deal's end date — telling customers a sale ending Thursday ran until Sunday.
Any new surface must pick the right one deliberately.

**Best saving wins, and discounts never stack.** `chooseDealOffer`
(`src/lib/dealOffers.mjs`) scores every offer plus the volume tier and awards the
single best one. Offer types: `mix` (N+ vials → % off the whole order), `bundle`
(buy X get Y free), `flat` (% off just these products, no minimum — this is what
a flash sale is made of). A promo code causes the deal to stand aside entirely
(`dealOffers = !resolvedPromo && …`), so they cannot combine.

Only a **shelf**-mode deal can genuinely stack with a promo code, because it
rewrites catalog prices. That is the only case `promoStackingSafety.mjs` refuses.

## Rules learned the hard way

- **Two deals can be live now.** Any query doing `.eq('status','live')` with
  `.maybeSingle()` / `.single()` / `.limit(1)` breaks — PostgREST errors on two
  rows. This silently killed the WhatsApp bot's deal knowledge and threw on every
  admin product save. `tests/two-live-deals-callers.test.mjs` fails on any new one.
- **There is no "edit a live deal".** Actions are preview, launch, schedule,
  cancel, end, flash_launch, flash_end. To change a running sale's end time,
  update `ends_at` on the row directly.
- **Expiry is by the clock, then by cron.** `combineLiveDeals` drops a deal the
  moment its window passes, so customers stop getting the discount exactly on
  time. `expire-deals` (every 5 min) then closes the row and removes the banner.
- Banners are per-deal (`deal-<id>`), created at launch and removed at end.
  Editing the text afterwards is safe and does not stop the auto-removal.
- Announcement copy comes from the deal's `kind` and `ends_at`. It used to
  hardcode "DEAL OF THE WEEK … Ends Sunday at midnight" on flash sales.
- **`promo_codes` discounts were silently $0** until Sep 2026: `computeOrderTotals`
  computed `discountableSubtotal` and did not return it, and `NaN || 0` turned the
  result into a clean zero. Watch for that pattern.

# Migrations

Hand-run in the Supabase SQL editor, **before** the code that needs them
deploys. A "column not in schema cache" error means an unrun `.sql` in the repo
root. Recent: `add-flash-sales.sql` (Sep 23 2026, applied).

Where a missing column must not break older paths, add it to the droppable list
in `writeDroppingMissingColumns` — but never let a *new* feature silently write
the wrong row that way (`launchFlashSale` probes for `kind` and refuses with the
migration name instead).

# Session log

## Sun 20 – Mon 21 Sep 2026
- Read-only catalog API + stock counts exposed for a partner site; `maaz.md`
  written to explain API keys/digests in plain terms; PDF handover for the client.
- Deal of the Week: scheduled start (`status 'draft'`, started by the
  expire-deals cron), then **multiple offers in one deal** — Mix & Match plus
  Buy X Get Y, with "best saving wins" as the rule. Banner copy EN/ES, and
  "no promo code needed" required in the wording.
- Customer profiles work; recycle bin ("Bin" tab, deletes snapshot into
  `deleted_records`, `add-recycle-bin.sql`).

## Tue 22 Sep 2026
- **Branch cleanup:** main is the source of truth; every other branch deleted
  locally and on GitHub, bundled to `H:\Joe Webster\peptidecosta-cleanup-backup-2026-09-22`.
- **Chatwoot tab** added to the CRM — as its own tab, not folded into Leads.
  Explicit instruction: do not refactor or "clean up" anything outside scope,
  check all related files, do not guess.
- Order panel: single save for customer details, unsaved-changes prompt,
  whitespace-only edits counted as changes.
- Email/WhatsApp copy work: matching box heights, emoji-only additions to a WA
  message, Spanish email translated back for the developer.

## Wed 23 Sep 2026 — flash sales
Goal: 50% off both GHK-Cu sizes for one day, automatic, no promo code, without
disturbing the running weekly deal.

- Found the promo/deal overlap check refusing **every** promo code for the whole
  run of any live deal (it returned a conflict on its first loop iteration
  regardless of products). Narrowed to genuine shelf-price overlap.
- Built flash sales: `deals.kind`, per-kind live index, the `flat` offer type,
  `combineLiveDeals`, admin Flash sale card, `add-flash-sales.sql`.
- **Shipped broken, caught on the live site:** the browser returned 0 discount for
  a `flat` offer, so the card read ₡15,704 and checkout charged ₡33,907. Fixed,
  plus parity tests. Verified live: ₡18,203 / ₡40,637 / $90.57, and a 5-vial
  mixed cart correctly falling back to the volume tier at $655.
- Also fixed: promo codes discounting $0; product saves throwing while two deals
  were live; the WhatsApp bot losing all deal knowledge; the order summary
  showing no line for the flash discount; announcements claiming "Ends Sunday";
  the Deal of the Week page rendering "50% off your order / Buy undefined+ vials".
- Sale extended to **Thu 24 Sep 23:59 CR** by updating `ends_at` directly.

**Still unproven at session end:** no flash sale has ever been through the
23:59 auto-expiry; no real order has been submitted end-to-end with a flash sale
running; the admin "Stop it now" button and the promo-code fix have not been
exercised on the live site.
