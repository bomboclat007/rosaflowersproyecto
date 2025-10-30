// Simple loader: fetch /products.json and render cards into #stripe-product-list
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
  const canonicalUrl = apiBase + '/api/products' + (isTest ? '?use_test=1' : '');
  const fallbackUrl = apiBase + '/api/products.js' + (isTest ? '?use_test=1' : '');
  let productsUrl = canonicalUrl;
  let res = await fetch(productsUrl, {cache: 'no-store'});
      if(res.status === 404){
        // try fallback (some deployments expose functions as /api/<name>.js)
        res = await fetch(fallbackUrl, {cache: 'no-store'});
      }
      if(!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      const container = document.getElementById('stripe-product-list');
      if(!container) return;
      container.innerHTML = '';
      const products = data.products || [];
      if(products.length === 0){
        container.innerHTML = '<p>No products found.</p>';
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
        (p.prices||[]).forEach(pr=>{
          const li = document.createElement('li');
          const amount = (pr.unit_amount != null) ? (pr.unit_amount/100).toFixed(2) : '—';
          li.textContent = `${amount} ${pr.currency ? pr.currency.toUpperCase() : ''}`;
          li.style.fontWeight = '600';
          li.style.marginBottom = '6px';

          // Add Buy button per price
          const buy = document.createElement('button');
          buy.textContent = 'Comprar';
          buy.style.marginLeft = '8px';
          buy.style.padding = '6px 10px';
          buy.style.background = '#b63f6d';
          buy.style.color = '#fff';
          buy.style.border = 'none';
          buy.style.borderRadius = '4px';
          buy.style.cursor = 'pointer';
          buy.dataset.priceId = pr.id;

          buy.addEventListener('click', async function(){
            try{
              buy.disabled = true;
              buy.textContent = 'Redirigiendo...';
              // try relative canonical endpoint first, then fallback to .js variant if 404
              const checkoutCanonical = '/api/create-checkout-session';
              const checkoutFallback = '/api/create-checkout-session.js';
              let res = await fetch(checkoutCanonical, {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({price_id: pr.id, quantity: 1, use_test: isTest})
              });
              if(res.status === 404){
                res = await fetch(checkoutFallback, {
                  method: 'POST',
                  headers: {'Content-Type':'application/json'},
                  body: JSON.stringify({price_id: pr.id, quantity: 1, use_test: isTest})
                });
              }
              if(!res.ok) throw new Error('HTTP '+res.status);
              const j = await res.json();
              if(j.url){
                window.location = j.url;
                return;
              }
              throw new Error(j.error || 'No redirect URL');
            }catch(err){
              console.error('Checkout error', err);
              buy.disabled = false;
              buy.textContent = 'Comprar';
              alert('Error al iniciar el pago: '+ (err.message||err));
            }
          });

          li.appendChild(buy);
          priceList.appendChild(li);
        });

        card.appendChild(img);
        card.appendChild(title);
        card.appendChild(desc);
        card.appendChild(priceList);

        container.appendChild(card);
      });
    }catch(err){
      console.error('Failed to load products.json', err);
      const container = document.getElementById('stripe-product-list');
      if(container) container.innerHTML = '<p>Failed to load products.</p>';
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
