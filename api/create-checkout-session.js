const Stripe = require('stripe');

module.exports = async (req, res) => {
  const key = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_KEY;
  if (!key) {
    return res.status(500).json({ error: 'Stripe secret key not configured on server. Set STRIPE_SECRET_KEY in environment.' });
  }

  const stripe = new Stripe(key);

  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    // continue
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  try {
    if (!body || Object.keys(body).length === 0) body = JSON.parse(req.rawBody || '{}');
  } catch (e) {
    // ignore
  }

  const amount = parseInt(body.amount, 10);
  const currency = (body.currency || 'usd').toLowerCase();

  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

  try {
    const origin = req.headers.origin || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency,
            product_data: { name: 'POS Order' },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${origin}/pos.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pos.html?canceled=1`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('create-checkout-session error', err && err.message);
    return res.status(500).json({ error: err && err.message });
  }
};
// Prefer env var (Vercel) but fall back to local config for development
const secretKey = process.env.STRIPE_SECRET_KEY || require('../config/stripe').STRIPE_SECRET_KEY;
const stripe = require('stripe')(secretKey);

module.exports = async function handler(req, res) {
  // Allow CORS from any origin (adjust in production to limit origins)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method === 'POST') {
    try {
      // Support multiple payload forms:
      // - { price_id: 'price_XXX' }
      // - { productId: 'price_XXX' } (legacy)
      // - { items: [{ price_id|priceId: 'price_XXX', quantity: 2 }, ...] }
  const body = req.body || {};
  const { price_id, productId, items, metadata, customer_email } = body;

      let line_items = [];

      if (Array.isArray(items) && items.length > 0) {
        // Normalize items array
        line_items = items.map(it => {
          const price = it.price_id || it.priceId || it.price || it.priceId;
          const quantity = parseInt(it.quantity, 10) || 1;
          return { price: price, quantity: quantity };
        }).filter(li => !!li.price);
      } else {
        const priceToUse = price_id || productId;
        if (priceToUse) {
          line_items = [{ price: priceToUse, quantity: 1 }];
        }
      }

      if (!line_items || line_items.length === 0) {
        return res.status(400).json({ error: 'Missing price_id or items in request body' });
      }

      // Build session params; include optional metadata and customer_email if provided by frontend
      const sessionParams = {
        payment_method_types: ['card'],
        line_items: line_items,
        mode: 'payment',
        // redirect to explicit success.html to ensure static file is served
        success_url: `${req.headers.origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.headers.origin}/cancel`,
      };

      if (metadata && typeof metadata === 'object') {
        sessionParams.metadata = metadata;
      }

      if (customer_email && typeof customer_email === 'string') {
        sessionParams.customer_email = customer_email;
      }

      const session = await stripe.checkout.sessions.create(sessionParams);

      res.status(200).json({ url: session.url });
    } catch (error) {
      console.error('Error:', error);
      // If Stripe returns an error with a status code, forward it where possible
      if (error && error.statusCode) {
        return res.status(error.statusCode).json({ error: error.message || 'Stripe error' });
      }
      res.status(500).json({ error: 'Error al crear la sesión de checkout' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}