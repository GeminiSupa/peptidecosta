# Checkout lockout fix — status

**Status: code is live. One optional SQL step is still outstanding (section 4).**

Written 10 Sep 2026, after a customer could not place an order from any device.

---

## 1. What went wrong

Order `WPCR-MTSWNGWP`, 8 Sep 2026. The customer tried to check out by card and by
WhatsApp and got the same red banner both times:

> No pudimos guardar su pedido. Presione el botón de nuevo…

The owner reproduced it on two other machines, on other networks, in a private
window, and got the same banner. It looked like a site-wide outage. It was not:
40+ other customers checked out normally that day.

Two bugs, stacked.

### Bug 1 — the abuse limiter counted attempts, not orders

`api_rate_limits` shows **12 attempts** against that customer's contact key on
8 Sep against a limit of **5 per 24 hours**. Last attempt 16:39:09 UTC; her
screenshot is timestamped 10:40 a.m. Costa Rica, which is 16:40 UTC. No order of
hers reached the database that day, and `admin_notifications` logged no
`order_save_failed` row, so nothing ever got as far as an insert.

The counter was consumed at the top of the handler, **before** any validation.
Every refused attempt therefore cost the customer one of her five daily slots —
including attempts refused by our own bugs. Five presses of a button that could
not work, and she was locked out of the shop for a day.

The limiter keys on email + phone, not on device or network. So the owner's
reproduction attempts, entered with the customer's details, landed in the same
locked bucket. That is why it looked global.

### Bug 2 — a repricing loop that could not be escaped

Colón totals are compared to the exact colón (`tolerance = 0` in
`authoritativeCheckout`). The catalog fetched the USD/CRC rate once, in a mount
effect with `[]` deps, and never again. The server re-prices every order with
its own rate, refreshed hourly.

So a page left open across an hourly rate refresh posts a total that can never
match. The 409 told the customer "we updated the cart, submit again" and merged
`pricing.products` back into her cart — but only the **dollar** price came back,
and the dollar price had not changed. Only the rate had, and nothing touched it.

Demonstrated against the real pricing code, browser on 450.00, server on 448.065:

```
attempt 1: posted ₡297000  server ₡295724  -> REFUSED
attempt 2: posted ₡297000  server ₡295724  -> REFUSED
attempt 3: posted ₡297000  server ₡295724  -> REFUSED
attempt 4: posted ₡297000  server ₡295724  -> REFUSED
```

Identical forever. Only a hard reload could break it — and five presses hit
bug 1.

**Not proven:** that bug 2 is specifically what burned her first five attempts.
That day's runtime logs are gone. It is the only path in the codebase that
produces an unbreakable retry loop, and her order was priced at ₡450.63/USD
while the stored rate was ₡448.065, but the evidence to close it does not exist.

---

## 2. What changed

### Limits

| | Before | After |
|---|---|---|
| Per person | 5/day on a combined `email\|phone` key | 15/day per email **and** 15/day per phone, separately |
| Counts | every attempt | only orders that saved |
| Per IP | 6/hour | 40/hour, still attempt-based |

Per-person limits are now **peeked** before the work and **consumed** after a
successful insert (`src/app/api/orders/create/route.js`). Every `return` above
the insert leaves the customer's allowance untouched.

The IP limit stays attempt-based on purpose — catching a machine hammering the
endpoint is the one job it has. It was raised because Costa Rican mobile
carriers put many subscribers behind one public address, so 6/hour could block
strangers for each other's traffic.

Splitting email and phone into separate buckets also fixed a latent bug: with
the combined key, a guest with no email hashed to the same empty prefix as every
other guest. `orderContactLimits()` now skips a bucket whose value is absent.

### Messages

The route's real reason (promo expired, out of stock, limit reached) is now what
the customer reads. It used to be discarded in favour of one generic line that
fitted none of them and, for a rate-limited customer, was actively wrong: it told
her to press the button again, which is what kept her blocked.

Rate-limited customers now get, in full:

> **Demasiados intentos**
> Detectamos actividad inusual. Escríbanos por WhatsApp y hacemos su pedido.

Kept deliberately short. `tests/checkout-rate-limits.test.mjs` asserts a length
ceiling so it cannot grow back into a paragraph.

### The repricing loop

The 409 now carries `exchangeRate`. The catalog adopts it, re-posts at the
server's own total, and stops. Two rules keep that safe:

- **One retry, ever.** `repriceRetriesLeft` cannot loop.
- **Silent only if the total did not go up.** If the customer would pay more
  than the figure on the button, she is shown the new total and has to agree.

No rounding tolerance was added. The owner declined it; the exact-colón
comparison stands.

### Exchange rate

- A stale stored rate now keeps pricing the shop **indefinitely** instead of
  expiring after 24h into `FALLBACK_EXCHANGE_RATE` (454.48). That constant is
  not a better number than the stored one, it is an older one, and switching to
  it moved every colón price several colones per dollar in one silent step —
  while also guaranteeing a browser/server mismatch, i.e. bug 2.
- Past 48 hours with no fresh quote, `omerforce@gmail.com` is emailed with
  **IMPORTANT** in the subject, once per day, until the feed returns.
  (`src/lib/exchangeRateAlert.mjs`)
- `fetchLiveExchangeRate` now checks `res.ok`. The rate route answers a failure
  with HTTP 500 **and a hardcoded rate in the body**, and the old code read the
  body without looking at the status.

---

## 3. SQL already applied to production

Run and verified on 10 Sep 2026. Full file: `fix-checkout-limits-and-rate-lock.sql`.

- `public.peek_api_rate_limit(...)` created, execute granted to `service_role`
  only. Verified live: `service_role` OK, `anon` permission denied, and a peek
  writes no row.
- `site_settings` write policy narrowed to `using (id <> 'exchange_rate')`.

**The code depends on `peek_api_rate_limit` existing.** The limiter fails closed,
so a deploy without it returns 503 on every checkout. It is already applied;
this note is for anyone restoring or rebuilding the database.

---

## 4. OUTSTANDING — settings are still writable by any logged-in account

The applied SQL locked the exchange rate row. It did **not** lock the other 20
`site_settings` rows, which are still `USING (true) TO authenticated`.

Customer signup is self serve (`/api/account/request-code`, Turnstile-gated but
open to anyone with an email; `disable_signup: false` on the project). The
"Accounts are coming soon" page is a client-side render gate only —
`NEXT_PUBLIC_ACCOUNTS_LIVE`, checked in `useAccountAccess` — and the signup API
does not consult it. `AccountShell.js` says so in its own comment: *"The guard is
a convenience, not the security boundary."*

So anyone on the internet can currently sign up and rewrite banners, landing page
content and the exit-intent offer.

The owner wants signups to stay open, so the fix is to check for staff rather
than for merely being logged in:

```sql
drop policy if exists "Allow authenticated write access to settings" on public.site_settings;

create policy "Allow authenticated write access to settings"
on public.site_settings
for all
to authenticated
using (public.is_admin_user() and id <> 'exchange_rate')
with check (public.is_admin_user() and id <> 'exchange_rate');
```

Checked before proposing it:

- `is_admin_user()` exists in production (`orders_admin_all` already references it).
- All 12 `admin_profiles` rows have a `user_id`, so every staff member passes.
- Every browser write to `site_settings` is in the admin panel
  (`src/app/admin/page.js` ×3, `src/components/admin/LandingLeadSettingsManager.js`).
  Public pages only read, and reads are untouched.
- API routes write with the service role, which bypasses RLS.

Nothing in the shipped code depends on this. It is hardening.

---

## 5. Also noticed, not acted on

`orders_admin_all` is `FOR ALL TO authenticated USING (is_admin_user())`, and
`is_admin_user()` checks only that a non-suspended `admin_profiles` row exists —
no tier, no permission check. Every staff row, including outside affiliates, can
read, update and delete **every** order, with customer phone numbers and
addresses. `src/app/admin/page.js` fetches all orders with the browser client and
narrows them in React, so `filterOrdersVisibleToAgent` is presentation only.

Blocked on a product decision nobody has made: does an outside affiliate see the
customer's name and shipping address, or only the order and their commission?

---

## 6. Verification

- `node --test tests/*.test.mjs` → 1728 pass, 2 fail.
- The 2 failures are pre-existing and unrelated: `tests/trustpilot-rating.test.mjs`
  expects rating 4.4 against 4.6 in the code, and expects a `{TRUSTPILOT_RATING}`
  placeholder removed in `fe24fb0`/`36f191e`.
- `npx next build` → `✓ Compiled successfully`, full route table emitted.
- New coverage: `tests/checkout-rate-limits.test.mjs` (14 tests).
