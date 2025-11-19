const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || require('../config/keys.json').STRIPE_SECRET_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in env' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const stripe = new Stripe(STRIPE_SECRET_KEY);

  try {
    const authHeader = (req.headers.authorization || '') + '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    if (!token) return res.status(401).json({ error: 'Missing Authorization Bearer token' });

    // Get user from token using the service_role key
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData || !userData.user) {
      console.error('supabase auth.getUser error', userErr);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const user = userData.user;
    const email = user.email || (req.body && req.body.email) || null;
    if (!email) return res.status(400).json({ error: 'No email available for user' });

    // Create Stripe customer
    const customer = await stripe.customers.create({ email });

    // Attach stripe customer id to user metadata (admin)
    try {
      await supabase.auth.admin.updateUserById(user.id, { user_metadata: { ...user.user_metadata, stripe_customer_id: customer.id } });
    } catch (uerr) {
      // If update fails, log but still return success (so client has customerId)
      console.error('Failed to update user metadata with stripe id', uerr);
    }

    return res.status(200).json({ customerId: customer.id });
  } catch (err) {
    console.error('create-stripe-customer-supabase error', err);
    return res.status(500).json({ error: 'Error creating Stripe customer' });
  }
};
