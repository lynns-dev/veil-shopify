import { CartAddEvent, CartErrorEvent } from '@theme/events';

/**
 * Handles the "Add" button in the cart drawer's discounted upsell card,
 * performing a real AJAX add-to-cart and re-using the theme's existing
 * cart:update event so the drawer, cart bubble, etc. all update normally.
 */
class CartUpsellComponent extends HTMLElement {
  connectedCallback() {
    this.addEventListener('click', this.#handleClick);
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.#handleClick);
  }

  /** @param {MouseEvent} event */
  #handleClick = async (event) => {
    const button = /** @type {HTMLElement} */ (event.target).closest('[data-cart-upsell-add]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) return;

    const variantId = button.dataset.variantId;
    if (!variantId) return;

    button.disabled = true;

    try {
      const response = await fetch(Theme.routes.cart_add_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id: variantId, quantity: 1 }),
      });
      const data = await response.json();

      if (!response.ok) {
        this.dispatchEvent(new CartErrorEvent(this.id, data.message, data.description, data.errors));
        return;
      }

      const cart = await fetch('/cart.js').then((res) => res.json());

      this.dispatchEvent(
        new CartAddEvent(cart, this.id, {
          source: 'cart-upsell',
          itemCount: 1,
          productId: data.product_id,
        })
      );
    } catch (error) {
      console.error('Cart upsell add failed', error);
      button.disabled = false;
    }
  };
}

if (!customElements.get('cart-upsell')) {
  customElements.define('cart-upsell', CartUpsellComponent);
}
