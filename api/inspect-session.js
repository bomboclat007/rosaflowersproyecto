// Admin-only helper: retrieve a single Stripe Checkout Session with expansions for debugging
const stripeKey = process.env.STRIPE_SECRET_KEY || require('../config/stripe').STRIPE_SECRET_KEY;
const stripe = require('stripe')(stripeKey);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).end('Method Not Allowed');

  const secret = req.headers['x-admin-secret'] || req.query.secret || req.body && req.body.secret;
  if (!process.env.ADMIN_TRIGGER_SECRET) return res.status(500).json({ error: 'ADMIN_TRIGGER_SECRET not configured on server' });
  if (!secret || secret !== process.env.ADMIN_TRIGGER_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing id query parameter' });

  try {
    const session = await stripe.checkout.sessions.retrieve(id, {
      expand: ['line_items', 'payment_intent', 'payment_intent.charges.data', 'customer', 'customer_details', 'line_items.data.price.product']
    });
    return res.status(200).json({ session });
  } catch (err) {
    console.error('inspect-session error', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Failed to retrieve session', details: String(err && err.message ? err.message : err) });
  }
};
