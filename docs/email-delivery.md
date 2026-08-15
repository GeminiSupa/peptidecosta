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

The application refuses Rackspace, generic `SMTP_*`, campaign credentials, and
an `ORDER_SMTP_USER` that matches `CAMPAIGN_SMTP_USER`.

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
