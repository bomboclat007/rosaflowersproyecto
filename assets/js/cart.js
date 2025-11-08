function getCart() {
  try {
    return JSON.parse(localStorage.getItem('stripe_cart') || '[]');
  } catch(e) {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem('stripe_cart', JSON.stringify(cart));
  renderCart();
  updateCartCount();
}

function formatMoney(cents, currency) {
  try {
    return (cents/100).toFixed(2) + ' ' + (currency || 'USD').toUpperCase();
  } catch(e) {
    return '—';
  }
}

function updateCartCount() {
  const cart = getCart();
  const count = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
  const countElements = document.querySelectorAll('.sqs-cart-quantity');
  countElements.forEach(el => el.textContent = count);
}

function renderCart() {
  const cartItemsContainer = document.getElementById('cart-items');
  const cartTotalElement = document.getElementById('cart-total');
  const cart = getCart();

  if (!cartItemsContainer) return;

  cartItemsContainer.innerHTML = '';
  let total = 0;

  cart.forEach((item, index) => {
    const tr = document.createElement('tr');
    tr.classList.add('cart-item');
    
    const subtotal = (item.unit_amount || 0) * (item.quantity || 1);
    total += subtotal;

    tr.innerHTML = `
      <td>
        <div class="product-cell">
          <img src="${item.image || '/assets/images/default-product.jpg'}" alt="${item.name}" class="cart-item-image">
          <h3>${item.name}</h3>
        </div>
      </td>
      <td>${formatMoney(item.unit_amount || 0, item.currency)}</td>
      <td>
        <div class="quantity-controls">
          <button onclick="updateQuantity(${index}, ${(item.quantity || 1) - 1})">-</button>
          <span>${item.quantity || 1}</span>
          <button onclick="updateQuantity(${index}, ${(item.quantity || 1) + 1})">+</button>
        </div>
      </td>
      <td>${formatMoney(subtotal, item.currency)}</td>
      <td>
        <button onclick="removeFromCart(${index})" class="remove-button">Eliminar</button>
      </td>
    `;
    cartItemsContainer.appendChild(tr);
  });

  if (cartTotalElement) {
    cartTotalElement.textContent = formatMoney(total, cart[0]?.currency);
  }
}

function updateQuantity(index, newQuantity) {
  if (newQuantity < 1) return;
  
  const cart = getCart();
  if (index >= 0 && index < cart.length) {
    cart[index].quantity = newQuantity;
    saveCart(cart);
  }
}

function removeFromCart(index) {
  const cart = getCart();
  if (index >= 0 && index < cart.length) {
    cart.splice(index, 1);
    saveCart(cart);
  }
}

function clearCart() {
  if (confirm('¿Estás seguro que deseas vaciar el carrito?')) {
    saveCart([]);
  }
}

function checkout() {
  // Crear sesión de Stripe Checkout usando los items en localStorage (stripe_cart)
  (async function(){
    try{
      const cart = getCart();
      if(!Array.isArray(cart) || cart.length === 0){
        alert('Tu carrito está vacío. Añade productos antes de continuar.');
        return;
      }

      // Normalizar items: { price_id, quantity }
      const items = cart.map(it => ({ price_id: it.priceId || it.price_id || it.price || it.productId || '', quantity: parseInt(it.quantity,10) || 1 })).filter(i=>i.price_id);
      if(!items.length){
        alert('No se encontraron price_id válidos en el carrito.');
        return;
      }

      // Opcional: deshabilitar un botón si existe
      const continueBtn = document.querySelector('.continue-to-payment, #continueToPayment');
      if(continueBtn){ continueBtn.disabled = true; continueBtn.dataset.origText = continueBtn.textContent; continueBtn.textContent = 'Procesando...'; }

      // Intentar endpoint canónico y fallback si 404
      const canonical = '/api/create-checkout-session';
      const fallback = '/api/create-checkout-session.js';

      let res = await fetch(canonical, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ items })
      });
      if(res.status === 404){
        res = await fetch(fallback, {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ items })
        });
      }

      if(!res.ok) throw new Error('HTTP '+res.status);
      const json = await res.json();
      if(json && json.url){ window.location.href = json.url; return; }

      throw new Error(json && json.error ? json.error : 'No redirect URL returned');
    }catch(err){
      console.error('Checkout error', err);
      alert('Error al iniciar el pago: ' + (err.message || err));
      const continueBtn = document.querySelector('.continue-to-payment, #continueToPayment');
      if(continueBtn){ continueBtn.disabled = false; if(continueBtn.dataset && continueBtn.dataset.origText) continueBtn.textContent = continueBtn.dataset.origText; }
    }
  })();
}

// Inicializar el carrito cuando se carga la página
document.addEventListener('DOMContentLoaded', () => {
  renderCart();
  updateCartCount();
});