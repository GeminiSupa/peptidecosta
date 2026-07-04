# Marketing delivery webhook

Set `DELIVERY_WEBHOOK_SECRET` in the deployment environment, then configure the email provider (or a small provider adapter) to send normalized events to:

`POST /api/webhooks/delivery`

Authenticate with either `Authorization: Bearer <secret>` or `X-Webhook-Secret: <secret>`.

```json
{
  "events": [
    {
      "event_id": "provider-event-123",
      "provider_id": "smtp-message-id",
      "email": "customer@example.com",
      "channel": "email",
      "status": "hard_bounce",
      "reason": "Mailbox does not exist",
      "provider": "provider-name",
      "timestamp": "2026-07-03T12:00:00Z"
    }
  ]
}
```

Supported status aliases include `delivered`, `sent`, `hard_bounce`, `soft_bounce`, `deferred`, `failed`, `dropped`, `rejected`, `spam`, and `spam_complaint`. Hard bounces and complaints automatically create a global channel suppression.

Up to 500 events may be submitted per request. `event_id` is used for webhook deduplication and `provider_id` reconciles the callback with the original delivery attempt.
