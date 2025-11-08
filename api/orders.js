const { createClient } = require('@supabase/supabase-js');
const stripeSecret = process.env.STRIPE_SECRET_KEY || require('../config/stripe').STRIPE_SECRET_KEY;
const stripe = require('stripe')(stripeSecret);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // If Supabase is configured, try to return persisted rows from pos_orders
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data, error } = await supabase
        .from('pos_orders')
        .select('*')
        .order('session_created', { ascending: false })
        .limit(200);

      if (error) {
        console.error('Error reading pos_orders:', error);
        // fall through to Stripe fallback below
      } else {
        return res.status(200).json({ orders: data || [] });
      }
    } catch (err) {
      console.error('Error in /api/orders supabase branch:', err);
      // fall through to Stripe fallback
    }
  } else {
    console.warn('SUPABASE not configured; falling back to Stripe for orders');
  }

  // Fallback: if Supabase is not available or returned an error, return Stripe checkout sessions
  try {
    const sessions = await stripe.checkout.sessions.list({ limit: 100 });
  const orders = await Promise.all(sessions.data.map(async s => {
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

        if (full.payment_intent && full.payment_intent.charges && full.payment_intent.charges.data && full.payment_intent.charges.data.length) {
          const ch = full.payment_intent.charges.data[0];
          if (ch.payment_method_details && ch.payment_method_details.type) payment_method = ch.payment_method_details.type;
          else if (full.payment_method_types && full.payment_method_types.length) payment_method = full.payment_method_types[0];
        } else if (full.payment_method_types && full.payment_method_types.length) {
          payment_method = full.payment_method_types[0];
        }
      } catch (e) {
        console.warn('Could not fully expand session', s.id, e && e.message);
      }

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

      // helper: try to parse a stringified `checkout_info` JSON blob commonly stored in metadata
      const parseCheckoutInfo = (md) => {
        if (!md) return null;
        const ci = md.checkout_info;
        if (!ci) return null;
        try {
          return (typeof ci === 'string') ? JSON.parse(ci) : ci;
        } catch (e) {
          return null;
        }
      };

      const ci = parseCheckoutInfo(full.metadata);
      const pickRecipient = () => {
        if (full.metadata && (full.metadata.recipient_name || full.metadata.recipient)) return full.metadata.recipient_name || full.metadata.recipient;
        if (ci) {
          // common shapes: rFirst/rLast, rFirstName/rLastName, recipientName, firstName/lastName
          const rFirst = ci.rFirst || ci.rFirstName || ci.rfirst || ci.r_first || ci.rfirstName;
          const rLast = ci.rLast || ci.rLastName || ci.rlast || ci.r_last || ci.rlastName;
          if (rFirst || rLast) return [rFirst, rLast].filter(Boolean).join(' ');
          if (ci.recipientName || ci.recipient) return ci.recipientName || ci.recipient;
          if (ci.firstName || ci.lastName) return [ci.firstName, ci.lastName].filter(Boolean).join(' ');
        }
        return null;
      };

      const pickOrderType = () => {
        if (full.metadata && full.metadata.order_type) return full.metadata.order_type;
        if (ci) return ci.order_type || ci.fulfillmentType || ci.fulfillment_type || null;
        return null;
      };

      return {
        id: s.id,
        created: s.created,
        amount_total: s.amount_total || null,
        currency: s.currency || null,
        payment_status: s.payment_status || (full.payment_intent && full.payment_intent.status) || null,
        payment_method: payment_method || null,
        customer_email: (full.customer_details && full.customer_details.email) || s.customer_email || null,
        customer_name: (full.customer_details && full.customer_details.name) || null,
  recipient: pickRecipient(),
        delivery_address,
        designer: (full.metadata && full.metadata.designer) || null,
  order_type: pickOrderType(),
        bloomsnap: (full.metadata && (full.metadata.bloomsnap || full.metadata.bloomsnap_url)) || null,
        fulfillment_date: (full.metadata && full.metadata.fulfillment_date) || null,
        time_due: (full.metadata && full.metadata.time_due) || null,
        order_status: (full.metadata && full.metadata.order_status) || null,
        line_items,
        metadata: full.metadata || {}
      };
    }));

    return res.status(200).json({ orders });
  } catch (err) {
    console.error('Error listing stripe orders fallback:', err);
    return res.status(500).json({ error: 'Error fetching orders' });
  }
};
