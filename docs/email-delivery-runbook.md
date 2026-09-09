# Runbook: "the email says sent but nobody got it"

Start here whenever someone reports a missing notification. This document
exists because the same failure has now cost three separate investigations,
each one starting from zero and each one derailed by the same false comfort:
**our database saying `sent` is not evidence that anybody received anything.**

## The one thing to understand first

Mail leaves this application through **Elastic Email**. Mailboxes on
`@peptidescostarica.net` are hosted at **Rackspace**.

```
app  ->  Elastic Email  ->  recipient's mail host  ->  inbox
         ^                  ^
         we hear this       we hear NOTHING from here on
```

We record `sent` the moment Elastic accepts the message. Elastic then tries to
deliver it, and whatever the receiving host says back goes to Elastic, not to
us. So a row reading `status = 'sent', error_message = null` means only:

> Elastic agreed to take the message.

It does not mean delivered. Every investigation that has gone wrong went wrong
by treating that row as proof.

## The own-domain trap (the cause of every incident so far)

Rackspace refuses mail claiming to be **from** a domain it hosts when that mail
arrives from anywhere but Rackspace. It reads as spoofing. SPF authorising
Elastic does not help; this is a separate own-domain rule and it is enforced
regardless.

So any message with `From: ...@peptidescostarica.net` **to**
`...@peptidescostarica.net` that is submitted through Elastic gets accepted by
Elastic, logged by us as `sent`, and then binned at Rackspace's boundary. The
sender never hears about it.

The remedy is in `src/lib/ownDomainSmtp.mjs`: recipients on our own domain are
sent from our own Rackspace host (`OWN_DOMAIN_SMTP_*`), everyone else keeps
going through Elastic. Sending direct also closes the blind spot, because
Rackspace's answer becomes our answer and a real failure is recorded as a real
failure.

**Anything that emails our own staff must use that split.** A new mail path
that skips it will look fine in testing against Gmail and fail silently for
every mailbox on our own domain.

## Incident log

| Date | Symptom | Cause | Fix |
|---|---|---|---|
| 12 Aug 2026 | New-order alerts to `info@` vanished; dashboard reported delivery | Own-domain trap | `ownDomainSmtp.mjs` created; order notification routed through it. A personal address was CC'd as a stopgap ("Joe (temp CC until info@ fixed)") |
| ~Sep 2026 | Accountant's PBAG copies not arriving | Own-domain trap | Dedicated Rackspace mailbox, `TAX_RECORDS_SMTP_*` |
| 2 Sep 2026 | AdWords lead alerts stopped reaching `info@`, while order alerts to the same mailbox kept working | Own-domain trap. The fix existed but only `/api/order-notification` was wired to it; the lead alert path never was | `sendLeadEmails` in `leadNotificationDelivery.js` given the same split |

The pattern across all three: **one mail path gets fixed, the others keep the
bug.** When you fix this again, grep for every place that builds a transport
and check each one.

## Investigation order

Work down this list. Do not skip to guessing.

### 1. Did the app try to send it at all?

```sql
select j.created_at, j.source, j.status, j.last_error,
       d.channel, d.destination, d.status as delivery_status, d.error_message
from lead_notification_jobs j
left join lead_notification_deliveries d on d.job_id = j.id
order by j.created_at desc
limit 30;
```

- Destination missing entirely -> the recipient was never on the list. Go to step 2.
- Destination present, `failed` -> `error_message` names the cause. Done.
- Destination present, `sent` -> the app did its part. Go to step 3.

### 2. Is the person actually on the alert list?

```sql
select label, channel, destination, active, new_lead, adwords_lead
from notification_recipients
order by channel, label;
```

Rules that decide who is included, all in `src/lib/leadAlertAudience.mjs`:

- Ad-page leads (`adwords_lp`, `glp1_lp`) go **only** to rows with
  `adwords_lead` ticked. If any such row exists, the `new_lead` rows are
  skipped entirely.
- A row whose **label exactly matches a team member's name** is treated as that
  person's private address and only fires for leads they own. `Ops inbox` and
  `Joe (temp CC until info@ fixed)` are shared; `Dani` is not.
- The hardcoded fallback (`omerforce@gmail.com`, `info@`) only runs when the
  table is unreachable. Once anything is ticked, it never fires.

Note: this table has **no `updated_at`**, so `created_at` cannot tell you when
a tickbox was changed. Do not build a theory on that column. Submit a live test
lead instead; it settles the question in two minutes.

### 3. What settings is the running deployment actually using?

Vercel does not read encrypted values back, so the dashboard cannot answer
this. Ask the process:

```
https://catalog.peptidescostarica.net/api/admin/email-diagnostics?verify=1
```

Admin login required. Returns hosts, masked logins, the exact `From` header
each sender will use, and — with `verify=1` — proof that the SMTP credentials
are accepted. No secrets are exposed.

### 4. Read the headers of a message that DID arrive

This is the highest-value step and needs no provider dashboard access. In
Rackspace webmail: open the message -> **More -> View Source**.

What to look for:

- `Received: from ... api.elasticemail.com` -> it went via Elastic.
- `Received: from ... rsapps.net` only -> it went direct via Rackspace.
- `Authentication-Results: ... spf=pass ... dkim=pass ... dmarc=pass` -> the
  sending setup is correct, and a missing message is **not** an authentication
  problem. Stop blaming SPF.
- `X-Spam-Flag: NO`, `X-Spam-Score: 0` -> it was not filtered as spam.
- `List-Unsubscribe: ...@bounces.elasticemail.net` -> Elastic injected an
  unsubscribe footer, which means it treated the message as marketing.

Compare a working message against the date a missing one should have arrived.
The difference between the two is the bug.

### 5. Rule out the mailbox itself

All available to the mailbox user, no admin needed. Rackspace webmail, ☰ menu
top right -> Settings:

- **Incoming Email -> Filtering** — a rule set to delete would explain an
  abrupt, total disappearance with nothing in Spam.
- **Spam Settings -> Preferences** — check whether spam is deleted outright
  rather than foldered, and check the **Blocklist** tab.
- Search **All Folders** for the subject line. Spam and Trash are included.

### 6. Only now, the provider dashboards

If everything above is clean, the message died between Elastic and the
receiving host. That record only exists in Elastic Email's activity log
(search the recipient; look for bounced, suppressed, or complained) or in
Rackspace's logs. Both need account access.

## Rules for anyone adding a new email path

1. Split own-domain recipients through `OWN_DOMAIN_SMTP_*`. Use
   `splitOwnDomainRecipients` or `isOwnDomainAddress` from
   `src/lib/ownDomainSmtp.mjs`. Testing only against Gmail will not catch this.
2. Never treat Elastic's acceptance as delivery in a status field, a log line,
   or a message to a user.
3. Read environment variables **inside** the handler, never at module scope. A
   warm serverless instance freezes whatever was set at import time; that alone
   cost days of lost order mail once already.
4. Marketing stays on `CAMPAIGN_SMTP_*` and must never use the Rackspace
   mailbox. Pushing bulk volume through a small business mailbox is what caused
   the 12 Aug abuse block.
5. Give the new path a test. Every fix in the incident log above was a
   one-liner; the expensive part was finding it.
