// Cargar productos de Stripe (ajustado a la estructura { products: [...] })
async function loadStripeProducts() {
  try {
    const response = await fetch('/api/products');
    const data = await response.json();
    const products = data && data.products ? data.products : (Array.isArray(data) ? data : []);

    const productsContainer = document.getElementById('stripe-products');
    if (!productsContainer) return;

    productsContainer.innerHTML = products.map(product => {
      // Obtener imagen principal
      const image = Array.isArray(product.images) && product.images.length ? product.images[0] : '';

      // Obtener precio (tomamos el precio por defecto si existe)
      const priceObj = (Array.isArray(product.prices) && product.prices.length) ? product.prices[0] : null;
      const unitAmount = priceObj && typeof priceObj.unit_amount === 'number' ? priceObj.unit_amount : null;
      const currency = priceObj && priceObj.currency ? priceObj.currency : (product.currency || '');
      const formattedPrice = unitAmount !== null ? (unitAmount / 100).toFixed(2) : '—';

      // price id a usar para la sesión de checkout
      const priceId = product.default_price_id || (priceObj && priceObj.id) || '';

      return `
      <div class="product-card">
        ${image ? `<img src="${image}" alt="${escapeHtml(product.name)}" class="product-image">` : ''}
        <h3 class="product-name">${escapeHtml(product.name)}</h3>
        <p class="product-description">${escapeHtml(product.description || '')}</p>
        <p class="product-price">${(currency || '').toUpperCase()} ${formattedPrice}</p>
        <button data-price-id="${priceId}" class="buy-button">Comprar</button>
      </div>`;
    }).join('');

    // Añadir listeners a botones (evita usar inline onclick)
    productsContainer.querySelectorAll('.buy-button').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid = btn.getAttribute('data-price-id');
        if (!pid) return alert('Precio no disponible para este producto');
        handlePurchase(pid);
      });
    });
  } catch (error) {
    console.error('Error cargando productos:', error);
  }
}

// Función para manejar la compra: guarda priceId en el carrito y redirige a checkout
async function handlePurchase(priceId) {
  try {
    const existing = JSON.parse(localStorage.getItem('stripe_cart') || '[]');
    existing.push({ priceId: priceId, quantity: 1 });
    localStorage.setItem('stripe_cart', JSON.stringify(existing));
    window.location.href = '/checkout.html';
  } catch (error) {
    console.error('Error al procesar la compra:', error);
  }
}

// Pequeña función para escapar texto interpolado en HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Cargar productos cuando la página esté lista
document.addEventListener('DOMContentLoaded', loadStripeProducts);