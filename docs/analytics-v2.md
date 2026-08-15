# Analytics V2 deployment

1. Run `analytics-v2-migration.sql` in the Supabase SQL Editor.
2. Deploy this catalog/CRM application.
3. Add the shared tracker to the marketing-site layout, immediately before `</body>`:

```html
<script
  src="https://catalog.peptidescostarica.net/analytics-tracker.js"
  data-endpoint="https://catalog.peptidescostarica.net/api/analytics/track"
  defer
></script>
```

The script shares a `pcr_visitor_id` first-party cookie across
`peptidescostarica.net` and its catalog subdomain. It records page views and a
15-second live heartbeat without exposing the Supabase anonymous key or allowing
public reads of visitor sessions.

Known-customer status is resolved server-side from contact details already held
by the catalog browser after the customer identifies themselves. IP address is
stored as a secondary operational signal, not used as the sole identity match.
