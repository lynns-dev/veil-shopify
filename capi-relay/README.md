# Meta Conversions API relay

Receives Shopify `orders/paid` webhooks and forwards a server-side `Purchase`
event to Meta's Conversions API. Runs as a Vercel serverless function
(`api/meta-capi.js`) — no framework, no build step.

## Deploy

1. Create a new Vercel project from this repository, with **Root Directory**
   set to `capi-relay`.
2. In the Vercel project's Environment Variables settings, add:
   - `META_ACCESS_TOKEN`
   - `META_PIXEL_ID`
   - `SHOPIFY_WEBHOOK_SECRET` (the Shopify custom app's Client Secret)
   - `META_TEST_EVENT_CODE` (optional, remove once verified in Events Manager)
3. Deploy. Note the resulting URL, e.g. `https://<project>.vercel.app`.
4. The webhook endpoint is `https://<project>.vercel.app/api/meta-capi`.
   Register a Shopify `orders/paid` webhook pointing at that URL (via Admin
   API or Settings -> Notifications -> Webhooks in Shopify admin).

## Verify

With `META_TEST_EVENT_CODE` set, place a test order and check Events
Manager's "Test Events" tab for a `Purchase` event. Once confirmed, remove
`META_TEST_EVENT_CODE` so events count toward live reporting.

## Notes

- The Meta access token and webhook secret only ever live in Vercel's
  environment variables — never in this repo.
- `event_id` is the Shopify order ID. There's currently no client-side
  `Purchase` event to deduplicate against (the order-status/thank-you page
  isn't editable via theme code), so this is the sole source of `Purchase`
  events.
- `orders/create` is accepted as well as `orders/paid` in case a COD or
  manual-payment flow needs it later — both use the same `event_id`, so Meta
  dedupes if both ever fire for the same order.
