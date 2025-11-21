// Simple Stripe-backed orders listing used by admin-orders.html
// Returns an array of `orders` with id, created, amount_total, currency, metadata
// Requires STRIPE_SECRET in env. If missing, returns 501 with instructions.
const Stripe = require('stripe');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const STRIPE_SECRET = process.env.STRIPE_SECRET;
  if (!STRIPE_SECRET) {
    return res.status(501).json({ error: 'STRIPE_SECRET not configured. Set STRIPE_SECRET in env to enable stripe-orders.' });
  }

  const stripe = new Stripe(STRIPE_SECRET, { apiVersion: '2022-11-15' });

  try {
    if (req.method === 'GET') {
      const q = req.query || {};
      const type = q.type || null;
      // We'll list recent Checkout Sessions (or PaymentIntents as fallback)
      // Limit and pagination
      const limit = Math.min(100, Math.max(1, parseInt(q.limit || '100', 10)));

      // Try checkout.sessions first
      let sessions = [];
      try {
        const list = await stripe.checkout.sessions.list({ limit });
        sessions = list.data || [];
      } catch (e) {
        // fallback to payment intents
        const list = await stripe.paymentIntents.list({ limit });
        sessions = (list.data || []).map(pi => ({ id: pi.id, amount_total: pi.amount, currency: pi.currency, metadata: pi.metadata, created: pi.created }));
      }

      // Map sessions to the shape admin-orders.html expects
      const orders = await Promise.all((sessions || []).map(async s => {
        const id = s.id || s.payment_intent || s.paymentIntent || null;
        const created = s.created || s.created_at || null; // unix timestamp (seconds)
        const metadata = s.metadata || {};

        // Normalize amount/currency
        let amount_total = s.amount_total || s.amount || null;
        let currency = s.currency || s.currency || null;
        // If this is a PaymentIntent shape
        if (!amount_total && s.amount) amount_total = s.amount;

        // Infer order_type and other admin fields from metadata first
        const order_type = (metadata && (metadata.order_type || metadata.type)) || null;
        const order_status = metadata.order_status || metadata.status || null;
        const fulfillment_date = metadata.fulfillment_date || metadata.fulfillment || null;
        const time_due = metadata.time_due || metadata.time || null;

        // customer details
        let customer_name = null;
        let customer_email = null;
        try{
          if (s.customer_details) {
            customer_name = s.customer_details.name || null;
            customer_email = s.customer_details.email || null;
          }
        }catch(e){}
        // fallback to metadata
        if (!customer_name && metadata.customer_name) customer_name = metadata.customer_name;
        if (!customer_email && metadata.customer_email) customer_email = metadata.customer_email;

        // delivery address
        let delivery_address = null;
        try {
          if (s.shipping && s.shipping.address) delivery_address = s.shipping.address;
          if (!delivery_address && metadata.delivery_address) delivery_address = metadata.delivery_address;
        } catch(e){}

        // payment method info
        const payment_method = (s.payment_method_types && s.payment_method_types.length) ? s.payment_method_types.join(', ') : (s.payment_method || null);
        const payment_method_details = s.payment_method_details || {};

        // line items: attempt to call stripe to list line items if session object has object='checkout.session'
        let line_items = [];
        try{
          if (s.object === 'checkout.session' && s.id && stripe && stripe.checkout && stripe.checkout.sessions) {
            try{
              // listLineItems may fail on older API versions in list response; ignore failures
              const li = await stripe.checkout.sessions.listLineItems(s.id, { limit: 50 });
              if (li && Array.isArray(li.data)) {
                line_items = li.data.map(it => ({ quantity: it.quantity, description: it.description || it.price && it.price.product || '' }));
                // compute amount_total if missing
                if (!amount_total && li.data.length && li.data[0].amount_total) amount_total = li.data.reduce((acc,it)=> acc + (it.amount_total||0), 0);
              }
            }catch(e){ /* ignore line items failure */ }
          }
        }catch(e){ }

        return {
          id,
          created,
          amount_total: amount_total || null,
          currency: currency || null,
          metadata: metadata || {},
          order_type: order_type || null,
          order_status: order_status || null,
          fulfillment_date: fulfillment_date || null,
          time_due: time_due || null,
          customer_name: customer_name || null,
          customer_email: customer_email || null,
          delivery_address: delivery_address || null,
          payment_method: payment_method || null,
          payment_method_details: payment_method_details || {},
          line_items: line_items || [],
          bloomsnap: metadata && metadata.bloomsnap ? metadata.bloomsnap : null,
          designer: metadata && metadata.designer ? metadata.designer : null
        };
      }));

      // Optionally filter by type (pos/pickup/delivery)
      const filtered = type ? orders.filter(o => (o.order_type||'').toLowerCase() === String(type).toLowerCase()) : orders;
      return res.status(200).json({ orders: filtered });
    }

    res.setHeader('Allow', ['GET','OPTIONS']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (err) {
    console.error('api/stripe-orders unexpected error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
