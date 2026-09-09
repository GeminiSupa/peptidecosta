# Pausing card payments

A kill switch for every card charge on the site. Use it when the payment
system is misbehaving and you would rather take no card money at all than take
it badly — a gateway acting up, a run of unexplained declines, a suspected
double-charge, or planned maintenance.

It does **not** touch WhatsApp orders, SINPE, or bank transfer. Those keep
working normally, which is the point: the shop stays open, only the card
button goes away.

---

## To pause

1. Vercel → the project → **Settings → Environment Variables**
2. Add (or edit) `NEXT_PUBLIC_CARD_PAYMENTS_PAUSED` = `true`, on **Production**
3. **Redeploy.** The variable is read into the browser bundle at build time, so
   saving it alone changes nothing until a deploy runs.

`true`, `1`, `yes`, `on` and `paused` all work, in any capitalisation.

## To un-pause

Set it to `false`, or delete the variable, then redeploy. Anything that is not
one of the words above means "not paused", so a typo leaves card payments
**working** rather than silently off. That is deliberate: a mistyped variable
must never close the till by accident.

## Check it actually took effect

Do all three. The first two are the ones customers see; the third is the one
that matters if a customer has an old tab or an old payment link open.

1. Open `/catalog`, add anything to the cart, go to checkout. The **Card** tile
   is greyed out with a "Maintenance" badge, and an amber apology sits under
   the payment methods.
2. Open any `/pay-card?order=...&token=...` link. It shows the apology in both
   Spanish and English, with a WhatsApp button that names the order number,
   instead of a card form.
3. Open the admin portal. An amber "Card payments are paused for maintenance"
   banner sits under the page title on every tab, and on any order the
   "Copy card payment link" button is disabled and reads "Card payments
   paused".

If the storefront still offers a card form, the redeploy did not pick the
variable up. Check it is set on the **Production** environment, not only
Preview, and redeploy again.

---

## What is closed, and why each one needed closing

Hiding the button is not the same as stopping the money. There are three ways
a card gets charged on this site, and the pause has to close all of them.

| Path | Who reaches it | Closed by |
|---|---|---|
| Storefront checkout, `POST /api/shieldhubpay/process-card` | Any customer on `/catalog` | Card tile disabled, plus a refusal at the top of the route |
| Pay-by-link, `POST /api/card-payment-link/pay` | Anyone holding a link we already sent | Apology on `/pay-card`, plus a refusal at the top of the route |
| New payment links, `POST /api/admin/orders/card-payment-link` | Staff, from the Orders screen | Route refuses with a 503 |

The **routes** are the real switch; the pages are courtesy. A tab opened five
minutes before the pause began still has a working card form in it, and a
payment link already sitting in a customer's WhatsApp is still correctly
signed. Neither of those asks the page whether it is allowed — they post
straight to the API. So the refusal lives at the top of each route, before the
gateway is configured, before the order row is written, and long before a card
is charged. `tests/card-payments-paused.test.mjs` asserts that ordering, so it
cannot drift later.

## Where the customer is pointed instead

The card tile is a plain disabled tile during a pause, with a "Maintenance"
badge, and the apology sits underneath the payment methods. The apology itself
is what tells them to message on WhatsApp — there is no popup, and tapping the
tile does nothing. (A click-through popup was tried and removed on purpose; if
you are thinking of adding one back, that was a deliberate decision, not an
oversight.)

`/pay-card` is the exception. That customer has an order already agreed and
only needs another way to pay it, so the page carries a WhatsApp button with
their order number on it. Sending them back to the catalog to start over would
lose the sale.

## What staff see

A pause looks like a bug from the inside unless somebody says otherwise: the
"Copy card payment link" button starts refusing, customers start asking where
the card option went, and only the person who set the variable knows it was
deliberate. So the admin portal says so in three places:

- An amber banner under the page title on **every** admin tab. A pause changes
  what the whole team can promise, and the person who needs to know is as
  likely to be in Leads or the Facebook inbox as in Orders.
- The **"Copy card payment link"** button on an order is disabled and reads
  "Card payments paused", with the same banner inline above it. A button that
  visibly cannot be pressed explains itself; one that errors on click reads as
  a broken admin panel.
- Switching an order's payment method **to** card still works — an order can be
  marked as a card order ready for when payments resume — but no link is minted,
  and the agent is told why in the notice that comes back.

All of it renders nothing at all when card payments are running, so it can live
in the layout permanently.

## What the customer sees

One piece of copy, defined once in `src/lib/cardCheckoutMessages.mjs` under the
`paused` key, in Spanish and English. It says three things, and all three earn
their place:

- **We are sorry, and we are working on it.** Not "card payment is not
  available", which reads as a shrug.
- **Nothing has been charged to your card.** This is the sentence that stops
  the support message. During a pause it is true without qualification,
  because the refusal happens before the gateway is touched.
- **Message us on WhatsApp and we will take your order right away.** The sale
  is not lost, it just moves channel.

It is marked `retryable: false`, so the submit button stays locked. Letting
someone retry during a pause is not merely useless — the checkout builds a
**new order number** on every attempt, and the double-charge lock only covers
a single order number. An error message that invites a retry is exactly how
one customer ends up billed twice. See the note on `unconfirmed` in the same
file.

## Files

| File | What it does |
|---|---|
| `src/lib/cardPaymentsPaused.mjs` | The switch. Read `areCardPaymentsPaused` on the server, `areCardPaymentsPausedForClient` in client components |
| `src/lib/cardCheckoutMessages.mjs` | The `paused` copy, ES + EN |
| `src/app/api/shieldhubpay/process-card/route.js` | Storefront charge, refused |
| `src/app/api/card-payment-link/pay/route.js` | Pay-by-link charge, refused |
| `src/app/api/admin/orders/card-payment-link/route.js` | Link generation, refused |
| `src/app/catalog/page.js` | Card tile disabled, apology shown |
| `src/app/pay-card/page.js` | Apology instead of the card form |
| `src/components/admin/CardPaymentsPausedBanner.js` | The staff banner, page-wide and `compact` |
| `src/app/admin/page.js` | Banner under the page title, every tab |
| `src/components/admin/OrderDetailPanel.js` | Payment-link button disabled, banner inline |
| `src/app/api/admin/orders/payment-method/route.js` | Mints no link while paused, says why |

### Why two reader functions

Next.js inlines `process.env.NEXT_PUBLIC_*` into the browser bundle by matching
that **literal text** in the source. A dynamic lookup like `env[KEY]` is not
matched, so in a client component it compiles to `undefined` and the pause
would never reach the browser — the checkout would happily show a card form
that the API then refuses.

`areCardPaymentsPausedForClient()` spells the name out for the compiler to
find. Client components must use it. Server code can use either.

Verified on a real build: with the variable set, the client chunk contains
`String("true")`; with it unset, the lookup stays dynamic against an empty
shim and evaluates false.

---

## If you are adding another way to pay by card

Add the same guard to the top of your route, before anything is written or
charged, and add it to the table above and to
`tests/card-payments-paused.test.mjs`. A payment path that does not check the
pause is a payment path that keeps charging cards during an incident, and
nobody finds out until the chargebacks arrive.

## Related

- `docs/email-delivery-runbook.md` — the same lesson from the email side: one
  path gets fixed, the others keep the bug.
