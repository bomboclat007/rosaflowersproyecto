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
      // retrieve expanded session to access line_items, payment_intent and customer details
      let full = s;
      let line_items = [];
      let payment_method = null;
      try {
        full = await stripe.checkout.sessions.retrieve(s.id, { expand: ['line_items', 'payment_intent', 'customer'] });

        if (full.line_items && full.line_items.data) {
          line_items = full.line_items.data.map(li => ({
            id: li.id,
            description: li.description || (li.price && li.price.product) || '',
            quantity: li.quantity,
            amount_total: li.amount_total || null
          }));
        }

        // try to get a human-friendly payment method type
        if (full.payment_intent && full.payment_intent.charges && full.payment_intent.charges.data && full.payment_intent.charges.data.length) {
          const ch = full.payment_intent.charges.data[0];
          if (ch.payment_method_details && ch.payment_method_details.type) payment_method = ch.payment_method_details.type;
          else if (full.payment_method_types && full.payment_method_types.length) payment_method = full.payment_method_types[0];
        } else if (full.payment_method_types && full.payment_method_types.length) {
          payment_method = full.payment_method_types[0];
        }
      } catch (e) {
        // ignore expand errors, but keep minimal info from s
        console.warn('Could not fully expand session', s.id, e && e.message);
      }

      // build delivery address string
      let delivery_address = '';
      const addr = (full.shipping || full.shipping_details || (full.customer_details && full.customer_details.address)) || null;
      if (addr) {
        const parts = [];
        if (addr.name) parts.push(addr.name);
        if (addr.line1) parts.push(addr.line1);
        if (addr.line2) parts.push(addr.line2);
        if (addr.city) parts.push(addr.city);
        if (addr.state) parts.push(addr.state);
        if (addr.postal_code) parts.push(addr.postal_code);
        if (addr.country) parts.push(addr.country);
        delivery_address = parts.join(', ');
      }

      return {
        id: s.id,
        created: s.created,
        amount_total: s.amount_total || null,
        currency: s.currency || null,
        payment_status: s.payment_status || (full.payment_intent && full.payment_intent.status) || null,
        payment_method: payment_method || null,
        customer_email: (full.customer_details && full.customer_details.email) || s.customer_email || null,
        customer_name: (full.customer_details && full.customer_details.name) || null,
        recipient: (full.metadata && full.metadata.recipient_name) || null,
        delivery_address,
        designer: (full.metadata && full.metadata.designer) || null,
        order_type: (full.metadata && full.metadata.order_type) || null,
        bloomsnap: (full.metadata && (full.metadata.bloomsnap || full.metadata.bloomsnap_url)) || null,
        fulfillment_date: (full.metadata && full.metadata.fulfillment_date) || null,
        time_due: (full.metadata && full.metadata.time_due) || null,
        order_status: (full.metadata && full.metadata.order_status) || null,
        line_items,
        metadata: full.metadata || {}
      };
    }));

    res.status(200).json({ orders });
  } catch (err) {
    console.error('Error listing stripe orders:', err);
    res.status(500).json({ error: 'Error obteniendo orders de Stripe' });
  }
};
