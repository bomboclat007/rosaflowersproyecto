// Funciones del carrito
function updateQuantity(id, newQuantity) {
  if (newQuantity < 1) return;
  
  const cart = JSON.parse(localStorage.getItem('cart')) || [];
  const itemIndex = cart.findIndex(item => item.id === id);
  
  if (itemIndex !== -1) {
    cart[itemIndex].quantity = parseInt(newQuantity);
    localStorage.setItem('cart', JSON.stringify(cart));
    renderCart();
    updateCartBadge();
  }
}

function removeItem(id) {
  const cart = JSON.parse(localStorage.getItem('cart')) || [];
  const updatedCart = cart.filter(item => item.id !== id);
  localStorage.setItem('cart', JSON.stringify(updatedCart));
  renderCart();
  updateCartBadge();
}

function clearCart() {
  if (confirm('¿Estás seguro de que quieres vaciar el carrito?')) {
    localStorage.setItem('cart', JSON.stringify([]));
    renderCart();
    updateCartBadge();
  }
}

function checkout() {
  const cart = JSON.parse(localStorage.getItem('cart')) || [];
  if (cart.length === 0) {
    alert('Tu carrito está vacío');
    return;
  }
  
  // Aquí iría la lógica de checkout con Stripe
  alert('Procesando el pago...');
}

function renderCart() {
  const cartContainer = document.getElementById('cart-items');
  const cart = JSON.parse(localStorage.getItem('cart')) || [];
  let total = 0;

  cartContainer.innerHTML = '';
  
  if (cart.length === 0) {
    cartContainer.innerHTML = '<div class="empty-cart-message">Tu carrito está vacío</div>';
    document.getElementById('cart-total').textContent = '0.00 USD';
    return;
  }

  cart.forEach(item => {
    total += item.price * item.quantity;
    const itemElement = document.createElement('div');
    itemElement.className = 'cart-item';
    itemElement.innerHTML = `
      <img src="${item.image}" alt="${item.name}">
      <div class="cart-item-details">
        <span class="cart-item-title">${item.name}</span>
        <span class="cart-item-price">${item.price.toFixed(2)} USD</span>
      </div>
      <div class="cart-item-quantity">
        <button class="quantity-btn" onclick="updateQuantity('${item.id}', ${item.quantity - 1})">-</button>
        <input type="number" class="quantity-input" value="${item.quantity}" min="1" onchange="updateQuantity('${item.id}', this.value)">
        <button class="quantity-btn" onclick="updateQuantity('${item.id}', ${item.quantity + 1})">+</button>
      </div>
      <button class="remove-item" onclick="removeItem('${item.id}')">×</button>
    `;
    cartContainer.appendChild(itemElement);
  });

  document.getElementById('cart-total').textContent = total.toFixed(2) + ' USD';
}

function updateCartBadge() {
  const cart = JSON.parse(localStorage.getItem('cart')) || [];
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const badge = document.getElementById('cart-badge');
  if (badge) {
    badge.textContent = totalItems;
    badge.style.display = totalItems > 0 ? 'block' : 'none';
  }
}

// Inicializar el carrito cuando se carga la página
document.addEventListener('DOMContentLoaded', () => {
  renderCart();
  updateCartBadge();
});