// Cargar productos de Stripe
async function loadStripeProducts() {
  try {
    const response = await fetch('/api/products');
    const products = await response.json();
    
    const productsContainer = document.getElementById('stripe-products');
    productsContainer.innerHTML = products.map(product => `
      <div class="product-card">
        ${product.image ? `<img src="${product.image}" alt="${product.name}" class="product-image">` : ''}
        <h3 class="product-name">${product.name}</h3>
        <p class="product-description">${product.description || ''}</p>
        <p class="product-price">${product.currency.toUpperCase()} ${product.price}</p>
        <button onclick="handlePurchase('${product.id}')" class="buy-button">Comprar</button>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error cargando productos:', error);
  }
}

// Función para manejar la compra
async function handlePurchase(productId) {
  try {
    const response = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ productId }),
    });

    const session = await response.json();
    window.location.href = session.url;
  } catch (error) {
    console.error('Error al procesar la compra:', error);
  }
}

// Cargar productos cuando la página esté lista
document.addEventListener('DOMContentLoaded', loadStripeProducts);