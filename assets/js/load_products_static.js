// Static copy of load_products.js to bypass possible injection/CSP issues
// Identical behavior to load_products.js
(function(){
  async function load(){
    try{
  // If the page URL contains `stripe_test=1` we'll request the server to use the
  // test Stripe key (server will only do this if STRIPE_TEST_SECRET_KEY is set).
  // Also allow the page to force test mode by setting `window.STRIPE_FORCE_TEST = true`.
  const urlHasTest = (typeof window !== 'undefined') && (window.location.search.indexOf('stripe_test=1') !== -1);
  const forceTest = (typeof window !== 'undefined') && !!window.STRIPE_FORCE_TEST;
  // Auto-enable test mode for the dailyflowers page (so /dailyflowers.html shows Stripe products)
  const isDailyFlowersPath = (typeof window !== 'undefined' && window.location && typeof window.location.pathname === 'string')
    ? /dailyflowers(?:\.html)?$/.test(window.location.pathname)
    : false;
  const isTest = !!(urlHasTest || forceTest || isDailyFlowersPath);
  // Allow overriding the API base URL from the page (useful if the API is deployed
  // at a different host). Set `window.STRIPE_API_BASE = 'https://...';` in the page.
  const apiBase = (typeof window !== 'undefined' && window.STRIPE_API_BASE) ? window.STRIPE_API_BASE.replace(/\/$/, '') : '';
  // Try canonical /api/products first; some Vercel setups expose the function as
  // /api/products.js so fall back to that if the first returns 404.
  // Build query params (use_test and optional collection)
  const queryParts = [];
  if (isTest) queryParts.push('use_test=1');
  // Allow page to request a specific collection by setting window.STRIPE_COLLECTION
  const collectionName = (typeof window !== 'undefined' && window.STRIPE_COLLECTION) ? String(window.STRIPE_COLLECTION).trim() : '';
  if (collectionName) queryParts.push('collection=' + encodeURIComponent(collectionName));
  const q = queryParts.length ? ('?' + queryParts.join('&')) : '';
  const canonicalUrl = apiBase + '/api/products' + q;
  const fallbackUrl = apiBase + '/api/products.js' + q;
  let productsUrl = canonicalUrl;
  let res = await fetch(productsUrl, {cache: 'no-store'});
      if(res.status === 404){
        // try fallback (some deployments expose functions as /api/<name>.js)
        res = await fetch(fallbackUrl, {cache: 'no-store'});
      }
      if(!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      const container = document.getElementById('stripe-product-list');
      if(!container) {
        console.warn('load_products_static: #stripe-product-list not found in DOM');
        return;
      }
      // debug: log the raw products payload
      console.info('load_products_static: fetched products', data && data.products ? data.products.length : 0, data);
      container.innerHTML = '';

      // --- Modal de detalles (creado una vez) ---
      let productModal = document.getElementById('product-detail-modal');
      if(!productModal){
        productModal = document.createElement('div');
        productModal.id = 'product-detail-modal';
        productModal.style.position = 'fixed';
        productModal.style.left = '0';
        productModal.style.top = '0';
        productModal.style.width = '100%';
        productModal.style.height = '100%';
        productModal.style.display = 'none';
        productModal.style.alignItems = 'center';
        productModal.style.justifyContent = 'center';
        productModal.style.background = 'rgba(0,0,0,0.6)';
        productModal.style.zIndex = '9999';

        const inner = document.createElement('div');
        inner.style.background = '#fff';
        inner.style.padding = '18px';
        inner.style.borderRadius = '8px';
        inner.style.width = 'min(800px, 95%)';
        inner.style.maxHeight = '90%';
        inner.style.overflow = 'auto';
        inner.id = 'product-detail-inner';

        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Cerrar';
        closeBtn.style.float = 'right';
        closeBtn.style.marginLeft = '8px';
        closeBtn.addEventListener('click', ()=>{ productModal.style.display = 'none'; });

        inner.appendChild(closeBtn);
        productModal.appendChild(inner);
        document.body.appendChild(productModal);
      }
      const products = data.products || [];
      if(products.length === 0){
        container.innerHTML = '<p>No products found.</p>';
        // visual debug badge so it's obvious on the page
        showProductsDebugBadge(0);
        return;
      }
      products.forEach(p=>{
        const card = document.createElement('div');
        card.className = 'stripe-product-card';
        card.style.border = '1px solid #eee';
        card.style.padding = '12px';
        card.style.width = '220px';
        card.style.boxSizing = 'border-box';
        card.style.borderRadius = '6px';
        card.style.background = '#fff';
        card.style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)';

        const img = document.createElement('img');
        img.src = (p.images && p.images[0]) || '/logo.png';
        img.alt = p.name || '';
        img.style.width = '100%';
        img.style.height = '140px';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '4px';

  const title = document.createElement('h3');
        title.textContent = p.name || 'Unnamed';
        title.style.fontSize = '16px';
        title.style.margin = '8px 0 6px';

        const desc = document.createElement('div');
        desc.innerHTML = p.description || '';
        desc.style.fontSize = '13px';
        desc.style.marginBottom = '8px';

        const priceList = document.createElement('ul');
        priceList.style.padding = '0';
        priceList.style.listStyle = 'none';
        priceList.style.margin = '0';
        // Helper: function to initiate checkout for a given price id and button
        const doCheckout = async (priceId, btn) => {
          try{
            btn.disabled = true;
            const originalText = btn.textContent;
            btn.textContent = 'Redirigiendo...';
            const checkoutCanonical = '/api/create-checkout-session';
            const checkoutFallback = '/api/create-checkout-session.js';
            let res = await fetch(checkoutCanonical, {
              method: 'POST',
              headers: {'Content-Type':'application/json'},
              body: JSON.stringify({price_id: priceId, quantity: 1, use_test: isTest})
            });
            if(res.status === 404){
              res = await fetch(checkoutFallback, {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({price_id: priceId, quantity: 1, use_test: isTest})
              });
            }
            if(!res.ok) throw new Error('HTTP '+res.status);
            const j = await res.json();
            if(j.url){ window.location = j.url; return; }
            throw new Error(j.error || 'No redirect URL');
          }catch(err){
            console.error('Checkout error', err);
            btn.disabled = false;
            btn.textContent = 'Añadir al carrito';
            alert('Error al iniciar el pago: '+ (err.message||err));
          }
        };

        (p.prices||[]).forEach(pr=>{
          const li = document.createElement('li');
          const amount = (pr.unit_amount != null) ? (pr.unit_amount/100).toFixed(2) : '—';
          li.textContent = `${amount} ${pr.currency ? pr.currency.toUpperCase() : ''}`;
          li.style.fontWeight = '600';
          li.style.marginBottom = '6px';

          // Add Buy button per price
          const buy = document.createElement('button');
          buy.textContent = 'Añadir al carrito';
          buy.style.marginLeft = '8px';
          buy.style.padding = '6px 10px';
          buy.style.background = '#b63f6d';
          buy.style.color = '#fff';
          buy.style.border = 'none';
          buy.style.borderRadius = '4px';
          buy.style.cursor = 'pointer';
          buy.dataset.priceId = pr.id;

          buy.addEventListener('click', function(){
            // Add to the local cart instead of immediate checkout
            addToCart({
              productId: p.id || p.name || ('prod_' + (Math.random()*100000|0)),
              priceId: pr.id,
              name: p.name || '',
              image: img.src,
              unit_amount: pr.unit_amount != null ? pr.unit_amount : null,
              currency: pr.currency || 'usd',
              quantity: 1
            });
          });

          li.appendChild(buy);
          priceList.appendChild(li);
        });

        // Cart helper functions
        function getCart(){
          try{ return JSON.parse(localStorage.getItem('stripe_cart')||'[]'); }catch(e){return []}
        }
        function saveCart(cart){ localStorage.setItem('stripe_cart', JSON.stringify(cart)); updateCartCount(); }
        function updateCartCount(){
          try{
            const cart = getCart();
            const count = cart.reduce((s,i)=>s+(i.quantity||0),0);
            // find header cart element
            const headerCart = document.querySelector('.sqs-custom-cart .Cart-inner');
            let badge = document.getElementById('cart-count-badge');
            if(!badge){
              badge = document.createElement('span');
              badge.id = 'cart-count-badge';
              badge.style.marginLeft = '8px';
              badge.style.background = '#b63f6d';
              badge.style.color = '#fff';
              badge.style.padding = '2px 6px';
              badge.style.borderRadius = '12px';
              badge.style.fontSize = '13px';
              badge.style.verticalAlign = 'middle';
              if(headerCart) headerCart.appendChild(badge);
            }
            if(badge) badge.textContent = count>0? String(count): '0';
            // add class to anchor for non-zero
            const anchor = document.querySelector('.sqs-custom-cart');
            if(anchor){
              if(count>0) anchor.classList.remove('cart-quantity-zero');
              else anchor.classList.add('cart-quantity-zero');
            }
          }catch(e){/* ignore */}
        }

        function addToCart(item){
          try{
            const cart = getCart();
            const existing = cart.find(x=>x.priceId===item.priceId);
            if(existing){ existing.quantity = (existing.quantity||1) + (item.quantity||1); }
            else cart.push(item);
            saveCart(cart);
            // small visual feedback
            const notice = document.createElement('div');
            notice.textContent = 'Añadido al carrito';
            notice.style.position = 'fixed';
            notice.style.right = '18px';
            notice.style.bottom = '18px';
            notice.style.background = '#222';
            notice.style.color = '#fff';
            notice.style.padding = '10px 14px';
            notice.style.borderRadius = '6px';
            notice.style.zIndex = '99999';
            document.body.appendChild(notice);
            setTimeout(()=>{ try{ notice.remove(); }catch(e){} }, 1400);
          }catch(e){ console.error('Cart add error', e); alert('No se pudo añadir el artículo al carrito'); }
        }

        // expose for console debugging
        window._getCart = getCart;
        window._saveCart = saveCart;
        window._updateCartCount = updateCartCount;

        // ensure header badge is correct on load
        setTimeout(updateCartCount, 60);

        // Abrir modal de detalles cuando se cliquea la imagen
        img.style.cursor = 'pointer';
        img.addEventListener('click', function(){
          try{
            const inner = document.getElementById('product-detail-inner');
            if(!inner) return;
            inner.innerHTML = '';

            const closeBtn2 = document.createElement('button');
            closeBtn2.textContent = 'Cerrar';
            closeBtn2.style.float = 'right';
            closeBtn2.addEventListener('click', ()=>{ productModal.style.display = 'none'; });
            inner.appendChild(closeBtn2);

            const bigImg = document.createElement('img');
            bigImg.src = img.src;
            bigImg.style.width = '100%';
            bigImg.style.maxHeight = '400px';
            bigImg.style.objectFit = 'cover';
            bigImg.style.borderRadius = '6px';
            inner.appendChild(bigImg);

            const h2 = document.createElement('h2');
            h2.textContent = p.name || '';
            inner.appendChild(h2);

            const ddesc = document.createElement('div');
            ddesc.innerHTML = p.description || '';
            inner.appendChild(ddesc);

            const priceBox = document.createElement('div');
            priceBox.style.marginTop = '12px';
            (p.prices||[]).forEach(pr2=>{
              const row = document.createElement('div');
              row.style.display = 'flex';
              row.style.alignItems = 'center';
              row.style.marginBottom = '8px';

              const span = document.createElement('span');
              const amt = (pr2.unit_amount != null) ? (pr2.unit_amount/100).toFixed(2) : '—';
              span.textContent = `${amt} ${pr2.currency ? pr2.currency.toUpperCase() : ''}`;
              span.style.fontWeight = '600';

              const addBtn = document.createElement('button');
              addBtn.textContent = 'Añadir al carrito';
              addBtn.style.marginLeft = '12px';
              addBtn.style.padding = '8px 12px';
              addBtn.style.background = '#b63f6d';
              addBtn.style.color = '#fff';
              addBtn.style.border = 'none';
              addBtn.style.borderRadius = '4px';
              addBtn.style.cursor = 'pointer';
              addBtn.addEventListener('click', ()=> {
                // add from modal
                addToCart({
                  productId: p.id || p.name || ('prod_' + (Math.random()*100000|0)),
                  priceId: pr2.id,
                  name: p.name || '',
                  image: img.src,
                  unit_amount: pr2.unit_amount != null ? pr2.unit_amount : null,
                  currency: pr2.currency || 'usd',
                  quantity: 1
                });
              });

              row.appendChild(span);
              row.appendChild(addBtn);
              priceBox.appendChild(row);
            });
            inner.appendChild(priceBox);

            productModal.style.display = 'flex';
          }catch(e){ console.error('Modal error', e); }
        });

        card.appendChild(img);
        card.appendChild(title);
        card.appendChild(desc);
        card.appendChild(priceList);

        container.appendChild(card);
      });
      // after rendering products, show debug badge with count
      try{ showProductsDebugBadge(products.length); }catch(e){}
    }catch(err){
      console.error('Failed to load products.json', err);
      const container = document.getElementById('stripe-product-list');
      if(container) container.innerHTML = '<p>Failed to load products.</p>';
      // visual debug overlay for errors
      showProductsDebugBadge(-1, String(err && err.message));
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();

// helper: small badge in the bottom-left showing product count or an error
function showProductsDebugBadge(count, message){
  try{
    let b = document.getElementById('products-debug-badge');
    if(!b){
      b = document.createElement('div');
      b.id = 'products-debug-badge';
      b.style.position = 'fixed';
      b.style.left = '12px';
      b.style.bottom = '12px';
      b.style.zIndex = '999999';
      b.style.background = 'rgba(0,0,0,0.7)';
      b.style.color = '#fff';
      b.style.padding = '8px 10px';
      b.style.borderRadius = '8px';
      b.style.fontSize = '13px';
      b.style.fontFamily = 'system-ui, Roboto, Arial';
      document.body.appendChild(b);
    }
    if(count === -1) b.textContent = 'Products loader error: ' + (message||'');
    else b.textContent = 'Products: ' + String(count);
  }catch(e){/* ignore debug failures */}
}