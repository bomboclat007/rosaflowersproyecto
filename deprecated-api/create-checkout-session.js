const Stripe = require('stripe');

// Single handler supporting:
// - { items: [{ price: 'price_XXX' } | { unit_amount: 500, name: 'Item' } , quantity] }
// - { price_id: 'price_XXX' }
module.exports = async function handler(req, res) {
  const key = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_KEY;
  if (!key) return res.status(500).json({ error: 'Stripe secret key not configured on server. Set STRIPE_SECRET_KEY in environment.' });

  const stripe = new Stripe(key);

  // CORS (optional, allow same origin)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body || {};
  try { if (!body || Object.keys(body).length === 0) body = JSON.parse(req.rawBody || '{}'); } catch(e){}

  const { price_id, productId, items, metadata, customer_email, currency = 'usd' } = body;

  try {
    const currencyNorm = (currency || 'usd').toLowerCase();
    let line_items = [];

    if (Array.isArray(items) && items.length > 0) {
      for (const it of items) {
        const qty = parseInt(it.quantity, 10) || 1;
        // If a Stripe price id is provided, use it directly
        if (it.price && typeof it.price === 'string' && it.price.startsWith('price_')) {
          line_items.push({ price: it.price, quantity: qty });
          continue;
        }
        if (it.price_id && typeof it.price_id === 'string') {
          line_items.push({ price: it.price_id, quantity: qty });
          continue;
        }
        // Otherwise, expect unit_amount (in cents) and name to create price_data
        const unit = parseInt(it.unit_amount, 10);
        const name = it.name || 'Item';
        if (!isNaN(unit) && unit > 0) {
          line_items.push({
            price_data: {
              currency: currencyNorm,
              product_data: { name: String(name).slice(0, 100) },
              unit_amount: unit,
            },
            quantity: qty
          });
          continue;
        }
      }
    } else if (price_id || productId) {
      line_items = [{ price: price_id || productId, quantity: 1 }];
    }

    if (!line_items || line_items.length === 0) return res.status(400).json({ error: 'Missing price_id or items in request body' });

    const origin = req.headers.origin || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
    const sessionParams = {
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      success_url: `${origin}/pos.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pos.html?canceled=1`,
    };

    if (metadata && typeof metadata === 'object') sessionParams.metadata = metadata;
    if (customer_email && typeof customer_email === 'string') sessionParams.customer_email = customer_email;

    const session = await stripe.checkout.sessions.create(sessionParams);
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('create-checkout-session error', err && err.message);
    if (err && err.statusCode) return res.status(err.statusCode).json({ error: err.message || 'Stripe error' });
    return res.status(500).json({ error: err && err.message ? err.message : 'Error creating checkout session' });
  }
};
