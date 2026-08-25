# TikTok Form Lead Posting

Use this server-to-server endpoint to send TikTok Instant Form leads into the
Peptides Costa Rica CRM. Do **not** give a connector the Supabase URL, anon key,
or service-role key.

## Endpoint

```text
POST https://catalog.peptidescostarica.net/api/leads/tiktok
Content-Type: application/json
Authorization: Bearer <TIKTOK_LEAD_POSTING_SECRET>
```

Create a dedicated random secret (32 bytes or longer is recommended), add it to
the production environment as `TIKTOK_LEAD_POSTING_SECRET`, and give only that
secret and the endpoint URL to the posting service.

Example secret generation:

```bash
openssl rand -hex 32
```

## Request fields

| Field | Required | Description |
| --- | --- | --- |
| `lead_id` | Yes | TikTok's stable unique lead/submission ID. Reuse the same value on retries. |
| `email` | One contact method | Lead email address. |
| `phone` | One contact method | Lead phone number, preferably including country code. `phone_number` is also accepted. |
| `full_name` | No | Full name. `name`, or `first_name` plus `last_name`, are also accepted. |
| `language` | No | `en` or `es`; defaults to `es`. |
| `campaign_id` | No | TikTok campaign ID. |
| `campaign_name` | No | Human-readable campaign name. |
| `form_id` | No | TikTok Instant Form ID. |
| `form_name` | No | Human-readable form name. |
| `ad_id` | No | TikTok ad ID. |
| `ad_name` | No | Human-readable ad name. |
| `submitted_at` | No | TikTok submission timestamp. |
| `answers` | No | Object of question/answer pairs, or an array of `{question, answer}` objects. |
| `marketing_consent` | No | `true` only when the submitted form explicitly collected marketing consent. |
| `whatsapp_consent` | No | `true` only when the submitted form explicitly collected WhatsApp consent. |

At least one valid `email` or `phone` is required.

## Example

```bash
curl --request POST \
  'https://catalog.peptidescostarica.net/api/leads/tiktok' \
  --header 'Authorization: Bearer REPLACE_WITH_POSTING_SECRET' \
  --header 'Content-Type: application/json' \
  --data '{
    "lead_id": "7289440012345678901",
    "full_name": "Maria Rodriguez",
    "email": "maria@example.com",
    "phone": "+506 8888-1234",
    "language": "es",
    "campaign_id": "183746281",
    "campaign_name": "Costa Rica Research Leads",
    "form_id": "74920133",
    "form_name": "Catalog Enquiry",
    "ad_id": "183746299",
    "submitted_at": "2026-08-25T15:10:00Z",
    "answers": {
      "Research interest": "Weight management research",
      "Estimated volume": "5-9 vials"
    },
    "marketing_consent": true,
    "whatsapp_consent": true
  }'
```

## Successful responses

New CRM row (`201 Created`):

```json
{
  "success": true,
  "record": "created",
  "leadId": "crm-uuid",
  "assignedAgent": "Yese",
  "source": "tiktok_form",
  "notification": {
    "tracked": true,
    "status": "delivered",
    "sent": 1,
    "failed": 0
  }
}
```

A repeated request with the same `lead_id` returns `200 OK`, `record` set to
`duplicate`, and does not send a second notification.

If the email or phone already exists in the CRM, the existing record is updated
with the new TikTok enquiry and assigned to Yese instead of creating a duplicate
contact.

## CRM behavior

Every accepted submission is stored with:

- `sales_agent`: Yese
- `lead_source`: `tiktok_form`
- `utm_source`: `tiktok`
- `utm_medium`: `lead_form`
- `utm_campaign`: campaign name/ID, falling back to the form name/ID
- `referrer`: `TikTok Instant Form · Lead <lead_id>`
- TikTok campaign, form, ad, timestamp, and custom answers in the lead details

The notification uses the existing retryable lead outbox and sends to Yese's
active team-profile email, `surfyesi@hotmail.com`, with this exact subject:

```text
New Lead From TikTok Forms
```

## Error responses

| HTTP | Error | Meaning |
| --- | --- | --- |
| `400` | `lead_id_required` | No TikTok lead ID was supplied. |
| `400` | `email_or_phone_required` | Neither contact method was usable. |
| `400` | `email_invalid` | Email format was invalid. |
| `401` | `unauthorized` | Bearer secret is missing or incorrect. |
| `409` | `identity_conflict` | Phone and email point to two different CRM contacts; an admin must merge them. |
| `409` | `contact_race` | Another request saved the same contact concurrently; retry with the same `lead_id`. |
| `429` | `rate_limited` | More than 120 requests arrived from one IP within 10 minutes. |
| `503` | `posting_not_configured` | `TIKTOK_LEAD_POSTING_SECRET` is not installed. |
| `503` | `tiktok_assignee_unavailable` | Yese's active Leads-enabled profile could not be found. |
| `500` | `save_failed` | The server could not save the lead. Retry the same `lead_id`. |

For Make, Zapier, LeadsBridge, or another connector, create an HTTP POST step,
map TikTok's lead ID to `lead_id`, map the contact/form/ad fields above, and
treat every `2xx` response as accepted. Retry `409` `contact_race`, `429`, `500`,
and `503` responses with the same `lead_id`; do not retry validation or
authentication errors until the mapping or secret is corrected.
