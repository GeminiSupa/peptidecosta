# Email delivery configuration

Marketing and critical email use separate Elastic Email identities so a bulk
campaign throttle cannot stop order receipts, shipping notices, lead alerts,
inquiry replies, review requests, or payout reports.

## Transactional email

Configure a dedicated Elastic Email subaccount/SMTP identity with these
server-only deployment variables:

```text
ORDER_SMTP_HOST=smtp.elasticemail.com
ORDER_SMTP_PORT=2525
ORDER_SMTP_SECURE=false
ORDER_SMTP_USER=<dedicated transactional SMTP user>
ORDER_SMTP_PASS=<dedicated transactional SMTP key>
```

The application refuses Rackspace and generic `SMTP_*` for customer-facing
transactional mail. A shared campaign identity is reported as unhealthy but is
still used rather than silently dropping critical mail.

## Accounting copies

The PBAG mailbox is hosted by Rackspace. A message submitted through Elastic
with `From: info@peptidescostarica.net` can be accepted by Elastic and then
rejected by Rackspace as an external sender impersonating its local domain.

Accounting copies use a dedicated Rackspace/accounting SMTP mailbox as their
primary transport. Elastic acceptance is not treated as proof that Rackspace
delivered the message. If the accounting mailbox rejects a send, the failure is
reported and is not hidden by retrying through Elastic. If accounting SMTP is
missing, PBAG copies are skipped and reported as failed rather than submitted
to the known-unreliable path.

The existing Rackspace `SMTP_*` mailbox is detected when `SMTP_HOST` ends in
`emailsrvr.com`. Prefer the dedicated settings below so accounting mail is
isolated from other application mail:

```text
TAX_RECORDS_SMTP_HOST=secure.emailsrvr.com
TAX_RECORDS_SMTP_PORT=465
TAX_RECORDS_SMTP_SECURE=true
TAX_RECORDS_SMTP_USER=<authenticated Rackspace mailbox>
TAX_RECORDS_SMTP_PASS=<Rackspace mailbox password>
TAX_RECORDS_SMTP_FROM=Peptides Costa Rica Records <authenticated Rackspace mailbox>
TAX_RECORDS_CC_EMAIL=pbagcr@peptidescostarica.net
```

`TAX_RECORDS_CC_EMAIL` may contain a comma-separated backup address. The live
configuration is reported, with credentials masked, by
`/api/admin/email-diagnostics?verify=1`.

The order detail panel has two different recovery actions. **Send / resend
email** sends the customer receipt and a new accounting copy. **Resend
accounting only** sends only PBAG's private copy, so backfills never duplicate a
customer receipt or a Trustpilot invitation.

## Marketing campaign pacing

The safe defaults are 50 recipients per batch, 30 minutes between batches,
1.5 seconds between messages, and one SMTP connection. They can be adjusted in
the deployment environment with:

```text
EMAIL_CAMPAIGN_BATCH_SIZE=50
EMAIL_CAMPAIGN_BATCH_INTERVAL_MINUTES=30
EMAIL_CAMPAIGN_SEND_DELAY_MS=1500
EMAIL_CAMPAIGN_SMTP_CONNECTIONS=1
EMAIL_CAMPAIGN_SEND_BUDGET_MS=240000
```

## Elastic Email bounce domain

Add this record in Namecheap Advanced DNS, then validate the custom bounce
domain in Elastic Email:

```text
Type: CNAME
Host: bounces
Value: bounces.elasticemail.net
```

The resulting hostname is `bounces.peptidescostarica.net`.
