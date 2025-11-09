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

  // Read optional filter param (type=pos|pickup|delivery)
  const q = req.query || {};
  const typeFilter = q.type ? String(q.type).toLowerCase().trim() : null;

  // If Supabase is configured, try to return persisted rows from pos_orders
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      let query = supabase
        .from('pos_orders')
        .select('*')
        .order('session_created', { ascending: false })
        .limit(200);
      if (typeFilter) {
        // filter rows where order_type equals the requested type
        query = query.eq('order_type', typeFilter);
      }
      const { data, error } = await query;

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
        // expand payment_intent and its charges so we can inspect payment method details for POS detection
        full = await stripe.checkout.sessions.retrieve(s.id, { expand: ['line_items', 'payment_intent', 'payment_intent.charges.data', 'customer'] });
        if (full.line_items && full.line_items.data) {
          line_items = full.line_items.data.map(li => ({
            id: li.id,
            description: li.description || (li.price && li.price.product) || '',
            quantity: li.quantity,
            amount_total: li.amount_total || null
          }));
        }

        if (full.payment_intent) {
          const pi = full.payment_intent;
          const pmTypes = Array.isArray(pi.payment_method_types) ? pi.payment_method_types.join(' ') : '';
          const charge = (pi.charges && pi.charges.data && pi.charges.data[0]) || {};
          const pmDetails = (charge.payment_method_details) || (pi.payment_method_details) || {};
          if (pmDetails && pmDetails.type) payment_method = pmDetails.type;
          else if (pmTypes) payment_method = pmTypes.split(' ')[0];
        } else if (full.payment_method_types && full.payment_method_types.length) {
          payment_method = full.payment_method_types[0];
        } else if (s.payment_method_types && s.payment_method_types.length) {
          // fallback to non-expanded session list shape
          payment_method = s.payment_method_types[0];
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

      const normalizeOrderType = (v) => {
        if (!v) return null;
        const s = String(v).toLowerCase().trim();
        if (!s) return null;
        if (s.includes('deliv') || s === 'delivery') return 'delivery';
        if (s.includes('pick')) return 'pickup';
        if (s.includes('pos') || s.includes('in-person') || s.includes('in person') || s.includes('store') || s.includes('in_store')) return 'pos';
        return s; // fallback: return normalized string
      };

      const pickOrderType = () => {
        const raw = (full.metadata && (full.metadata.order_type || full.metadata.fulfillment)) || (ci && (ci.order_type || ci.fulfillment || ci.fulfillmentType || ci.fulfillment_type)) || null;
        return normalizeOrderType(raw);
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
  order_type: (function(){
          const t = pickOrderType();
          if (t) return t;
          // check expanded payment intent / charge details
          try {
            const pi = full.payment_intent || {};
            const charge = (pi.charges && pi.charges.data && pi.charges.data[0]) || {};
            const pmDetails = (charge.payment_method_details) || (pi.payment_method_details) || {};
            const pmType = pmDetails.type || null;
            const pmTypes = Array.isArray(pi.payment_method_types) ? pi.payment_method_types.join(' ') : (full.payment_method_types && full.payment_method_types.join ? full.payment_method_types.join(' ') : null) || (s.payment_method_types && s.payment_method_types.join ? s.payment_method_types.join(' ') : null);
            // POS indicators
            if (pmType && /present|card_present|terminal|pos|in-person|in_person|eftpos/i.test(pmType)) return 'pos';
            if (pmTypes && /present|card_present|terminal|pos|in-person|in_person|eftpos/i.test(pmTypes)) return 'pos';
            if (pmDetails && pmDetails.card_present) return 'pos';
          } catch (e) {}
          if (payment_method && /present|terminal|pos|in-person|card_present/i.test(payment_method)) return 'pos';
          // heuristic: no metadata and no customer email often indicates POS (tickets/terminal). Use cautiously.
          const hasMeta = full.metadata && Object.keys(full.metadata).length;
          const email = (full.customer_details && full.customer_details.email) || s.customer_email || null;
          if (!hasMeta && !email && (payment_method === 'card' || payment_method === null)) return 'pos';
          return null;
        })(),
        bloomsnap: (full.metadata && (full.metadata.bloomsnap || full.metadata.bloomsnap_url)) || null,
        fulfillment_date: (full.metadata && full.metadata.fulfillment_date) || null,
        time_due: (full.metadata && full.metadata.time_due) || null,
        order_status: (full.metadata && full.metadata.order_status) || null,
        line_items,
        metadata: full.metadata || {}
      };
    }));

    // If a typeFilter is provided, filter the computed orders client-side as well
    const filtered = typeFilter ? orders.filter(o => (o.order_type && String(o.order_type).toLowerCase() === typeFilter)) : orders;

    return res.status(200).json({ orders: filtered });
  } catch (err) {
    console.error('Error listing stripe orders fallback:', err);
    return res.status(500).json({ error: 'Error fetching orders' });
  }
};
