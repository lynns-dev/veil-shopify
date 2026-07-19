import { ThemeEvents } from '@theme/events';

/**
 * Meta Pixel client-side tracking (PageView, ViewContent, AddToCart, Search, InitiateCheckout).
 * Purchase is intentionally not tracked here — it's reported server-side via the
 * Conversions API relay (see /capi-relay), since the checkout/order-status page
 * can't run theme script and the relay has access to full, unblocked order data.
 */
(function () {
  const config = Theme?.metaPixel;
  if (!config?.enabled || !config?.pixelId) return;

  const PIXEL_ID = config.pixelId;

  /* eslint-disable */
  !(function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = !0;
    n.version = '2.0';
    n.queue = [];
    t = b.createElement(e);
    t.async = !0;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */

  window.fbq('init', PIXEL_ID);

  /** Generates a random event ID so server-side CAPI events can be deduplicated against this one. */
  function generateEventId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function track(eventName, params) {
    window.fbq('track', eventName, params, { eventID: generateEventId() });
  }

  window.fbq('track', 'PageView');

  const productData = Theme?.currentProduct;
  if (productData) {
    track('ViewContent', {
      content_ids: [String(productData.variantId)],
      content_type: 'product',
      value: productData.price / 100,
      currency: productData.currency,
    });
  }

  const searchData = Theme?.currentSearch;
  if (searchData?.term) {
    track('Search', {
      search_string: searchData.term,
    });
  }

  document.addEventListener(ThemeEvents.cartUpdate, (event) => {
    const data = event.detail?.data;
    // Only genuine "add to cart" submissions, not cart-drawer quantity edits or other sources.
    const addToCartSources = ['product-form-component', 'cart-upsell'];
    if (!data || data.didError || !addToCartSources.includes(data.source)) return;

    const cart = event.detail.resource;
    if (!cart?.items?.length) return;

    const matches = cart.items.filter((item) => String(item.product_id) === String(data.productId));
    if (!matches.length) return;

    const quantity = data.itemCount || 1;
    const referenceItem = matches[matches.length - 1];

    track('AddToCart', {
      content_ids: matches.map((item) => String(item.variant_id)),
      content_type: 'product',
      value: (referenceItem.price * quantity) / 100,
      currency: cart.currency,
    });
  });

  // Delegated on document (rather than bound to the button directly) because the cart
  // drawer/page re-renders its contents via morph, which would otherwise detach a direct listener.
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element) || !event.target.closest('#checkout')) return;

    fetch('/cart.js')
      .then((response) => response.json())
      .then((cart) => {
        if (!cart?.items?.length) return;
        track('InitiateCheckout', {
          content_ids: cart.items.map((item) => String(item.variant_id)),
          content_type: 'product',
          value: cart.total_price / 100,
          currency: cart.currency,
          num_items: cart.item_count,
        });
      })
      .catch(() => {});
  });
})();
