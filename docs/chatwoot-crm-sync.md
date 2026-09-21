# Chatwoot → CRM sync

The CRM receives signed Chatwoot webhooks at:

`POST https://peptidecosta.vercel.app/api/webhooks/chatwoot`

## What is synchronized

- conversation status (`open`, `pending`, `snoozed`, or `resolved`)
- Chatwoot assignee back to the CRM lead owner
- message count and last-message direction/time
- first agent response time
- resolution time
- agent replies as `last_contacted_at` in the CRM
- notification-bell items for new customer messages, assignments, resolved chats, and reopened chats

The webhook stores a small event ledger for deduplication and analytics. It does
not store message bodies in that ledger; only the notification bell receives a
short preview of a new incoming message.

## One-time activation

1. Run `chatwoot-crm-sync-migration.sql` in the Supabase SQL editor.
2. Deploy the application so the endpoint exists. Until its signing secret is
   installed, it deliberately answers `503` and changes no data.
3. In Chatwoot, open **Settings → Integrations → Webhooks**, add the endpoint
   above, and copy the generated webhook secret.
4. Subscribe to `conversation_created`, `conversation_updated`,
   `conversation_status_changed`, and `message_created`.
5. Add that generated secret to production as `CHATWOOT_WEBHOOK_SECRET`, then redeploy.

Chatwoot sends `X-Chatwoot-Signature`, `X-Chatwoot-Timestamp`, and
`X-Chatwoot-Delivery`. The CRM verifies the HMAC-SHA256 signature against the
untouched request body, rejects deliveries older than five minutes, checks the
configured account and inbox IDs, and safely ignores duplicate delivery IDs.

If the endpoint returns `503` with `Run chatwoot-crm-sync-migration.sql first`,
the code is deployed but the database migration has not been installed yet.
