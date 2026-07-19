import { CartAddEvent, CartErrorEvent } from '@theme/events';

/**
 * Generic single-variant "add to cart" button: performs a real AJAX
 * add-to-cart and dispatches the theme's CartAddEvent so the cart drawer,
 * cart bubble, etc. all update normally. Used by the cart drawer's upsell
 * card and the collection/product-card grid buttons.
 */
class AddToCartInlineComponent extends HTMLElement {
  connectedCallback() {
    this.addEventListener('click', this.#handleClick);
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.#handleClick);
  }

  /** @param {MouseEvent} event */
  #handleClick = async (event) => {
    const button = /** @type {HTMLElement} */ (event.target).closest('[data-add-to-cart-inline]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) return;

    const variantId = button.dataset.variantId;
    if (!variantId) return;

    const source = button.dataset.source || 'add-to-cart-inline';
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
          source,
          itemCount: 1,
          productId: data.product_id,
        })
      );
    } catch (error) {
      console.error('Add to cart failed', error);
    } finally {
      button.disabled = false;
    }
  };
}

if (!customElements.get('add-to-cart-inline')) {
  customElements.define('add-to-cart-inline', AddToCartInlineComponent);
}
