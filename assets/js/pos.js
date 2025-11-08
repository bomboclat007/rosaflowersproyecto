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
          // keep the price id so we can create a Checkout Session
          price_id: p.default_price_id || (p.prices && p.prices[0] && p.prices[0].id) || null,
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
    $('#checkoutBtn').addEventListener('click', async function(){
      if(Object.keys(cart).length===0){ alert('Carrito vacío'); return; }
      // Build items array for the server: { price_id, quantity }
      const items = Object.values(cart).map(i => ({ price_id: i.price_id || i.default_price_id || i.priceId || i.price, quantity: i.qty }));
      // Validate price_id presence
      if (!items.every(it => it.price_id)){
        alert('Algunos productos no tienen un price_id configurado. Reintenta o usa el panel de Stripe para revisar los precios.');
        return;
      }

      const btn = this;
      const originalText = btn.textContent;
      btn.disabled = true; btn.textContent = 'Redirigiendo...';
      try {
        const res = await fetch('/api/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error creando sesión');
        // server returns { url }
        if (data.url) {
          window.location.href = data.url;
        } else {
          throw new Error('No se recibió url de checkout');
        }
      } catch (err) {
        console.error('Checkout error', err);
        alert('No se pudo iniciar el pago: ' + (err.message || err));
        btn.disabled = false; btn.textContent = originalText;
      }
    });
    $('#posBack').addEventListener('click', function(){ window.location.href = '/admin.html'; });
    $('#posClear').addEventListener('click', function(){ if(confirm('Limpiar carrito?')){ cart={}; saveCart(); } });

    // Orders snapshot panel (fetch persisted orders from /api/orders)
    const ordersLink = document.querySelector("nav ul li a[href='#']");
    let ordersPoller = null;
    function createOrdersPanel(){
      let panel = document.getElementById('ordersPanel');
      if(panel) return panel;
      panel = document.createElement('div'); panel.id = 'ordersPanel';
      panel.style.position = 'fixed'; panel.style.right = '20px'; panel.style.top = '80px'; panel.style.width = '420px'; panel.style.maxHeight = '70vh'; panel.style.overflow = 'auto'; panel.style.background = '#fff'; panel.style.border = '1px solid #ddd'; panel.style.boxShadow='0 6px 18px rgba(0,0,0,0.08)'; panel.style.zIndex = 9999; panel.style.padding='12px';
      panel.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong>Orders Snapshot</strong><button id='closeOrdersPanel'>Cerrar</button></div><div id='ordersPanelBody' style='font-size:13px;color:#333'></div>`;
      document.body.appendChild(panel);
      panel.querySelector('#closeOrdersPanel').addEventListener('click', ()=>{ panel.remove(); if(ordersPoller) { clearInterval(ordersPoller); ordersPoller=null; } });
      return panel;
    }

    async function fetchOrdersForPanel(){
      const body = document.getElementById('ordersPanelBody'); if(!body) return;
      body.textContent = 'Cargando...';
      try{
        // try persisted orders
        let res = await fetch('/api/orders');
        if(!res.ok) res = await fetch('/api/stripe-orders');
        if(!res.ok) throw new Error('No orders');
        const data = await res.json();
        const orders = data.orders || [];
        if(orders.length===0){ body.innerHTML = '<div style="color:#666">No hay órdenes aún.</div>'; return; }
        body.innerHTML = '';
        orders.slice(0,20).forEach(o=>{
          const el = document.createElement('div'); el.style.borderBottom='1px solid #f0f0f0'; el.style.padding='8px 0';
          const when = o.session_created ? new Date(o.session_created*1000).toLocaleString() : (o.created? new Date(o.created*1000).toLocaleString(): '');
          el.innerHTML = `<div style='display:flex;justify-content:space-between'><div><strong>${o.id}</strong><div style='font-size:12px;color:#666'>${o.customer_name||o.customer_email||'-'}</div></div><div style='text-align:right'><div style='font-weight:600'>${o.amount_total?('$'+(o.amount_total/100).toFixed(2)):'-'}</div><div style='font-size:12px;color:#666'>${when}</div></div></div><div style='margin-top:6px;font-size:13px;color:#444'>${(o.recipient?('Para: '+o.recipient+' · '):'') + (o.delivery_address? o.delivery_address : '')}</div>`;
          body.appendChild(el);
        });
      }catch(err){ console.error('Orders fetch failed', err); body.textContent='Error cargando órdenes.'; }
    }

    if(ordersLink){
      ordersLink.addEventListener('click', function(e){ e.preventDefault(); const panel = createOrdersPanel(); fetchOrdersForPanel(); if(ordersPoller) clearInterval(ordersPoller); ordersPoller = setInterval(fetchOrdersForPanel, 8000); });
    }
  });

})();
