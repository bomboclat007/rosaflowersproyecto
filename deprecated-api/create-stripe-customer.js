// Creates a Stripe customer for a given email. Idempotency is not enforced here —
// in production you should persist mapping (user -> customer) in your DB to avoid duplicates.
const Stripe = require('stripe');
const secret = process.env.STRIPE_SECRET_KEY || require('../config/stripe').STRIPE_SECRET_KEY;
const stripe = new Stripe(secret);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const body = req.body || {};
    const email = (body.email || '').trim();
    if (!email) return res.status(400).json({ error: 'Missing email' });

    // Create a Stripe customer
    const customer = await stripe.customers.create({ email });
    return res.status(200).json({ customerId: customer.id });
  } catch (err) {
    console.error('create-stripe-customer error', err);
    return res.status(500).json({ error: 'Error creating Stripe customer' });
  }
};
