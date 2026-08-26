# Analytics V2 deployment

1. Run `analytics-v2-migration.sql` in the Supabase SQL Editor.
2. Deploy this catalog/CRM application.
3. Add the shared tracker to the layout of the apex site and every independently
   hosted subdomain, immediately before `</body>`:

```html
<script
  src="https://catalog.peptidescostarica.net/analytics-tracker.js"
  data-endpoint="https://catalog.peptidescostarica.net/api/analytics/track"
  defer
></script>
```

The collector accepts the HTTPS apex and any legitimate
`*.peptidescostarica.net` origin, so new subdomains do not require an API code
change. The script shares a `pcr_visitor_id` first-party cookie across the whole
domain family. It records page views and a 15-second live heartbeat without
exposing the Supabase anonymous key or allowing public reads of visitor sessions.

The tracker still has to be installed on each separately hosted site. Subdomains
served by this application already load `AnalyticsTracker` from the root layout.
For WordPress or another application, add the snippet above directly or through
the shared Google Tag Manager container.

Known-customer status is resolved server-side from contact details already held
by the catalog browser after the customer identifies themselves. IP address is
stored as a secondary operational signal, not used as the sole identity match.
