// Server endpoint to list recent Stripe Checkout Sessions (orders)
// Returns simplified orders array for the admin UI.
const secretKey = process.env.STRIPE_SECRET_KEY || require('../config/stripe').STRIPE_SECRET_KEY;
const stripe = require('stripe')(secretKey);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    // List last 100 checkout sessions
    const sessions = await stripe.checkout.sessions.list({ limit: 100 });

    const orders = await Promise.all(sessions.data.map(async s => {
      // Try to expand line items for each session
      let line_items = [];
      try {
        const full = await stripe.checkout.sessions.retrieve(s.id, { expand: ['line_items', 'payment_intent'] });
        if (full.line_items && full.line_items.data) {
          line_items = full.line_items.data.map(li => ({
            description: li.description || (li.price && li.price.product) || '',
            quantity: li.quantity,
            amount_total: li.amount_total
          }));
        }
      } catch (e) {
        // ignore expand errors
      }

      return {
        id: s.id,
        created: s.created,
        amount_total: s.amount_total || null,
        currency: s.currency || null,
        payment_status: s.payment_status || null,
        customer_email: (s.customer_details && s.customer_details.email) || s.customer_email || null,
        customer_name: (s.customer_details && s.customer_details.name) || null,
        line_items,
        metadata: s.metadata || {}
      };
    }));

    res.status(200).json({ orders });
  } catch (err) {
    console.error('Error listing stripe orders:', err);
    res.status(500).json({ error: 'Error obteniendo orders de Stripe' });
  }
};
