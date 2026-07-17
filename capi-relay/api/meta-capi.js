const crypto = require('crypto');

// Vercel: read the raw body ourselves so the Shopify HMAC signature can be verified
// against the exact bytes Shopify signed, before any JSON parsing touches them.
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function isValidShopifyWebhook(rawBody, hmacHeader, secret) {
  if (!hmacHeader || !secret) return false;
  const digest = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  const digestBuf = Buffer.from(digest);
  const headerBuf = Buffer.from(hmacHeader);
  return digestBuf.length === headerBuf.length && crypto.timingSafeEqual(digestBuf, headerBuf);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');
}

function buildUserData(order, req) {
  const userData = {};

  if (order.email) userData.em = [sha256(order.email)];

  const phone = order.phone || order.customer?.phone || order.billing_address?.phone;
  if (phone) userData.ph = [sha256(phone.replace(/[^\d]/g, ''))];

  if (order.customer?.first_name) userData.fn = [sha256(order.customer.first_name)];
  if (order.customer?.last_name) userData.ln = [sha256(order.customer.last_name)];
  if (order.billing_address?.city) userData.ct = [sha256(order.billing_address.city)];
  if (order.billing_address?.province_code) userData.st = [sha256(order.billing_address.province_code)];
  if (order.billing_address?.zip) userData.zp = [sha256(order.billing_address.zip)];
  if (order.billing_address?.country_code) userData.country = [sha256(order.billing_address.country_code)];

  // Populated only if the theme's checkout button handler is extended to stash _fbp/_fbc
  // into a cart note attribute before redirecting to checkout — not required to function.
  const fbp = order.note_attributes?.find((attr) => attr.name === '_fbp')?.value;
  const fbc = order.note_attributes?.find((attr) => attr.name === '_fbc')?.value;
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;

  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) userData.client_ip_address = String(forwardedFor).split(',')[0].trim();
  if (req.headers['user-agent']) userData.client_user_agent = req.headers['user-agent'];

  return userData;
}

function buildEventPayload(order, req) {
  const lineItems = order.line_items || [];

  return {
    event_name: 'Purchase',
    event_time: Math.floor(new Date(order.processed_at || order.created_at).getTime() / 1000),
    event_id: String(order.id),
    action_source: 'website',
    event_source_url: order.order_status_url,
    user_data: buildUserData(order, req),
    custom_data: {
      currency: order.currency,
      value: Number(order.total_price),
      content_type: 'product',
      content_ids: lineItems.map((item) => String(item.variant_id || item.product_id)),
      contents: lineItems.map((item) => ({
        id: String(item.variant_id || item.product_id),
        quantity: item.quantity,
        item_price: Number(item.price),
      })),
      order_id: String(order.id),
    },
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const rawBody = await readRawBody(req);
  const hmacHeader = req.headers['x-shopify-hmac-sha256'];
  const topic = req.headers['x-shopify-topic'];

  if (!isValidShopifyWebhook(rawBody, hmacHeader, process.env.SHOPIFY_WEBHOOK_SECRET)) {
    res.status(401).json({ error: 'invalid_signature' });
    return;
  }

  // orders/paid is the primary subscription; orders/create is accepted too in case it's
  // ever wired up (e.g. for COD orders that never emit orders/paid) — same event_id either
  // way, so Meta dedupes if both somehow fire for the same order.
  if (topic !== 'orders/paid' && topic !== 'orders/create') {
    res.status(200).json({ skipped: true, topic });
    return;
  }

  const order = JSON.parse(rawBody);
  const payload = { data: [buildEventPayload(order, req)] };

  if (process.env.META_TEST_EVENT_CODE) {
    payload.test_event_code = process.env.META_TEST_EVENT_CODE;
  }

  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;

  try {
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${accessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const metaJson = await metaRes.json();

    if (!metaRes.ok) {
      console.error('Meta CAPI error', metaJson);
      res.status(502).json({ error: 'meta_capi_failed', details: metaJson });
      return;
    }

    res.status(200).json({ success: true, meta: metaJson });
  } catch (err) {
    console.error('Meta CAPI request failed', err);
    res.status(500).json({ error: 'internal_error' });
  }
};
