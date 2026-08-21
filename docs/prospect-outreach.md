# Prospect outreach and meeting booking

Turns a discovered prospect into a booked call: the AI drafts a first-touch message, the rep reviews and sends it, and a Cal.com booking flows back into the pipeline.

## Setup

1. Run `add-prospect-channel-permissions.sql`, `add-prospect-enrichment-jobs.sql`, then `prospect-outreach-migration.sql`, in the Supabase SQL Editor (after `prospector-migration.sql`).
2. Set the environment variables below.
3. In Cal.com, add a webhook pointing at `POST /api/webhooks/cal` subscribed to `BOOKING_CREATED`, `BOOKING_RESCHEDULED`, and `BOOKING_CANCELLED`, using the same secret as `CAL_WEBHOOK_SECRET`.

| Variable | Purpose |
| --- | --- |
| `CAL_BOOKING_URL` | The Cal.com event link, e.g. `https://cal.com/peptides/intro`. Drafting is refused without it. |
| `CAL_WEBHOOK_SECRET` | Shared secret Cal.com signs each delivery with. |
| `OPENAI_API_KEY` or `GEMINI_API_KEY` | Drafting model. OpenAI is preferred when both are set. |
| `CAMPAIGN_SMTP_*` | Reused for the 1:1 send; no new mail configuration. |

## Attribution

Each prospect is lazily assigned an unguessable `booking_token`. The token is appended to the booking link as `?metadata[prospectToken]=…`, which Cal.com passes through to the webhook. If the token is missing — usually because the link was forwarded internally — the webhook falls back to matching the attendee's email against the prospect's.

`prospect_meetings` is unique on `(provider, provider_event_id)`, so Cal.com's retries update one row instead of creating duplicates.

## Sending rules

- **Permission is channel-specific.** Email and WhatsApp each require their own `business_contact` source URL or `consented` evidence. A status recorded for one channel never authorizes the other. The historic global permission value remains only as a derived compatibility summary.
- **Unknown is refused.** A channel with no verified evidence cannot be drafted to or sent to. A channel opt-out blocks that channel; a prospect-level `do_not_contact` blocks everything.
- **The gate runs on the server on every send**, not just at draft time, and the marketing suppression list is checked before delivery.
- **Email sends automatically.** Every message carries a disclosure line derived from the evidence that actually authorized it, explaining why the recipient was contacted and how to stop it.
- **WhatsApp does not send automatically.** Meta's Cloud API only accepts free-form messages inside a 24-hour window opened by the recipient, and cold outreach has no such window; sending anyway risks the business number. The draft opens as a prefilled `wa.me` link and a person presses send.
- Every attempt, successful or failed, is written to `prospect_outreach` with the permission basis it relied on.

## Fit versus readiness

`fit_score` measures commercial relevance from public business signals such as category, web presence, location, operating status, rating, and review volume. Contact details, permission, ownership, and decision-maker records never add fit points. The API recomputes the score and reasons instead of accepting values supplied by the browser.

Contact readiness is calculated separately for Email and WhatsApp through the same permission-and-identity gate used by drafting and sending. A lead may therefore be a strong fit while still needing channel evidence, or have one channel ready while the other remains blocked. Readiness is derived at request time and needs no additional SQL migration.

## Durable enrichment queue

Saved prospects use `prospect_enrichment_jobs` for website scans. A unique prospect constraint prevents duplicate queued/running work. Workers atomically claim a queued job, preserve the scan payload before updating the prospect, and retry transient failures up to three times with exponential backoff. Interrupted running jobs are returned to the queue after two minutes, so refreshing or reopening Prospector resumes them. Discovery previews remain local until the business is saved.

## Pipeline effects

A send moves the prospect to `contacted`, unless they are already at `responded`, `meeting_booked`, `partner`, `won`, or `lost` — a follow-up must not erase a better outcome. A booking moves them to `meeting_booked`. A cancellation does **not** move them back; reps re-stage manually.
