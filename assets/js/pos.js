// Simple frontend POS (product grid + cart) - stores cart in localStorage and redirects to checkout.html
(function(){
  const PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="100%" height="100%" fill="#f0f0f0"/><text x="50%" y="50%" font-size="18" text-anchor="middle" fill="#c0c0c0" dy=".3em">No image</text></svg>');
  // Start with an empty products array; we'll try to fetch real Stripe products from the server
  let PRODUCTS = [];

  function formatPrice(cents){ return '$' + (cents/100).toFixed(2); }

  function $(sel, ctx){ return (ctx||document).querySelector(sel); }
  function $all(sel, ctx){ return Array.from((ctx||document).querySelectorAll(sel)); }

  let cart = JSON.parse(localStorage.getItem('pos_cart')||'{}');

  function saveCart(){ localStorage.setItem('pos_cart', JSON.stringify(cart)); renderCart(); }

  function renderProducts(list){ const grid = $('#productGrid'); grid.innerHTML=''; list.forEach(p=>{
    const card = document.createElement('div'); card.className='product-card';
    const img = (p.img && p.img.length) ? p.img : PLACEHOLDER;
    const priceVal = (typeof p.price === 'number') ? p.price : (p.unit_amount || 0);
    card.innerHTML = `<img src="${img}" alt="${p.name}" onerror="this.onerror=null;this.src='${PLACEHOLDER}';"><div><h3>${p.name}</h3><div class='price'>${formatPrice(priceVal)}</div></div><div><button data-id='${p.id}'>Agregar</button></div>`;
    grid.appendChild(card);
  });
  if(list.length === 0){
    grid.innerHTML = '<div style="padding:20px;color:#666">No hay productos disponibles.</div>';
  }
}

  function addToCart(id){ const prod = PRODUCTS.find(p=>p.id===id); if(!prod) return; if(!cart[id]) cart[id] = { ...prod, qty: 0 }; cart[id].qty += 1; saveCart(); }

  function changeQty(id, qty){ if(!cart[id]) return; cart[id].qty = qty; if(cart[id].qty <= 0) delete cart[id]; saveCart(); }

  function renderCart(){ const cont = $('#cartItems'); cont.innerHTML=''; let subtotal = 0; Object.values(cart).forEach(item=>{
    subtotal += (item.price || item.unit_amount || 0) * item.qty;
    const div = document.createElement('div'); div.className='cart-item';
    div.innerHTML = `<div class='meta'><strong>${item.name}</strong><div class='small'>${formatPrice(item.price || item.unit_amount || 0)} x ${item.qty}</div></div><div class='qty-controls'><button data-id='${item.id}' data-action='dec'>-</button><button data-id='${item.id}' data-action='inc'>+</button><button data-id='${item.id}' data-action='rem'>x</button></div>`;
    cont.appendChild(div);
  });
  const tax = Math.round(subtotal * 0.12); // 12% tax example
  const total = subtotal + tax;
  $('#cartSubtotal').textContent = formatPrice(subtotal);
  $('#cartTax').textContent = formatPrice(tax);
  $('#cartTotal').textContent = formatPrice(total);
  // attach handlers
  $all('.qty-controls button').forEach(b=> b.addEventListener('click', function(e){ const id = this.dataset.id; const a = this.dataset.action; if(a==='inc') changeQty(id, (cart[id]?.qty||0) + 1); else if(a==='dec') changeQty(id, (cart[id]?.qty||0) - 1); else if(a==='rem') { delete cart[id]; saveCart(); } }));
}

  // Fetch products from server; fallback to a small local catalog if fetch fails
  async function loadProducts(){
    const statusEl = document.getElementById('productsStatus');
    if(statusEl) statusEl.textContent = 'Cargando productos...';
    try {
      const res = await fetch('/api/products');
      if(!res.ok) throw new Error('Network response not ok');
      const data = await res.json();
      if(Array.isArray(data.products) && data.products.length>0){
        PRODUCTS = data.products.map(p=>({
          id: p.id,
          name: p.name,
          description: p.description,
          img: (p.images && p.images.length) ? p.images[0] : null,
          // prefer first price unit_amount if available
          price: (p.prices && p.prices[0] && typeof p.prices[0].unit_amount === 'number') ? p.prices[0].unit_amount : 0,
          unit_amount: (p.prices && p.prices[0] && typeof p.prices[0].unit_amount === 'number') ? p.prices[0].unit_amount : 0,
        }));
        if(statusEl) statusEl.textContent = 'Productos cargados desde Stripe.';
        return;
      }
    } catch (err) {
      console.debug('Could not load products from API.', err);
      if(statusEl) statusEl.textContent = 'No se pudieron cargar productos desde Stripe; inténtalo de nuevo más tarde.';
      PRODUCTS = [];
      return;
    }
  }

  document.addEventListener('DOMContentLoaded', async function(){
    await loadProducts();
    renderProducts(PRODUCTS);
    renderCart();

    // Single delegated click handler for product grid buttons
    const grid = document.getElementById('productGrid');
    if(grid) grid.addEventListener('click', function(e){ const b = e.target.closest('button'); if(!b) return; const id = b.dataset.id; addToCart(id); });

    $('#productSearch').addEventListener('input', function(e){ const q = (this.value||'').trim().toLowerCase(); renderProducts(PRODUCTS.filter(p=>p.name.toLowerCase().indexOf(q)!==-1)); });
    $('#checkoutBtn').addEventListener('click', function(){ if(Object.keys(cart).length===0){ alert('Carrito vacío'); return; } localStorage.setItem('checkout_cart', JSON.stringify(cart)); window.location.href = '/checkout.html'; });
    $('#posBack').addEventListener('click', function(){ window.location.href = '/admin.html'; });
    $('#posClear').addEventListener('click', function(){ if(confirm('Limpiar carrito?')){ cart={}; saveCart(); } });
  });

})();
