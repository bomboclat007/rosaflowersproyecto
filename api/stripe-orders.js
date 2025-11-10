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
  let payment_method_details = null;
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

        // try to get a human-friendly payment method type and capture full payment_method_details when available
        if (full.payment_intent && full.payment_intent.charges && full.payment_intent.charges.data && full.payment_intent.charges.data.length) {
          const ch = full.payment_intent.charges.data[0];
          if (ch.payment_method_details) {
            payment_method_details = ch.payment_method_details;
            if (ch.payment_method_details.type) payment_method = ch.payment_method_details.type;
          }
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
      // If stripe didn't provide a shipping object, try to extract address from checkout_info metadata
  if ((!delivery_address || delivery_address.trim()==='') && ci) {
        try {
          if (ci.address) delivery_address = ci.address;
          else if (ci.deliveryAddress) delivery_address = ci.deliveryAddress;
          else {
            const parts = [];
            if (ci.address_line1) parts.push(ci.address_line1);
            if (ci.address_line2) parts.push(ci.address_line2);
            if (ci.city) parts.push(ci.city);
            if (ci.state) parts.push(ci.state);
            if (ci.postal) parts.push(ci.postal);
            if (ci.postal_code) parts.push(ci.postal_code);
            if (parts.length) delivery_address = parts.join(', ');
          }
        } catch (e) {
          // ignore parse errors and leave delivery_address as-is
        }
      }
      // Also check top-level metadata fields (some checkouts store address directly in metadata)
      try {
        if ((!delivery_address || delivery_address.trim()==='') && full.metadata) {
          if (full.metadata.address) delivery_address = full.metadata.address;
          else if (full.metadata.delivery_address) delivery_address = full.metadata.delivery_address;
          else if (full.metadata.shipping_address) delivery_address = full.metadata.shipping_address;
        }
      } catch (e) { /* ignore */ }
      const pickRecipient = () => {
        if (full.metadata && (full.metadata.recipient_name || full.metadata.recipient)) return full.metadata.recipient_name || full.metadata.recipient;
        if (ci) {
          const rFirst = ci.rFirst || ci.rFirstName || ci.rfirst;
          const rLast = ci.rLast || ci.rLastName || ci.rlast;
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
        return s;
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
  payment_method_details: payment_method_details || null,
        customer_email: (full.customer_details && full.customer_details.email) || s.customer_email || null,
        customer_name: (full.customer_details && full.customer_details.name) || null,
  recipient: pickRecipient(),
        delivery_address,
        designer: (full.metadata && full.metadata.designer) || null,
  order_type: (function(){ const t = pickOrderType(); if(t) return t; if(payment_method && /present|terminal|pos|in-?person|card_present/i.test(payment_method)) return 'pos'; try{ if(payment_method_details && (payment_method_details.card_present || payment_method_details.type==='card_present')) return 'pos'; }catch(e){} return null; })(),
        bloomsnap: (full.metadata && (full.metadata.bloomsnap || full.metadata.bloomsnap_url)) || null,
        // Prefer explicit fulfillment_date from metadata, otherwise try pickup date from checkout_info or metadata
        fulfillment_date: (function(){
          try{
            if (full.metadata && full.metadata.fulfillment_date) return full.metadata.fulfillment_date;
            if (ci) {
              if (ci.pickupDate) return ci.pickupDate;
              if (ci.pickup_date) return ci.pickup_date;
              if (ci.pickupDateTime) return ci.pickupDateTime;
            }
            if (full.metadata) {
              if (full.metadata.pickupDate) return full.metadata.pickupDate;
              if (full.metadata.pickup_date) return full.metadata.pickup_date;
            }
          }catch(e){}
          return null;
        })(),
        time_due: (full.metadata && full.metadata.time_due) || null,
        order_status: (full.metadata && full.metadata.order_status) || null,
        line_items,
        metadata: full.metadata || {}
      };
    }));

    res.status(200).json({ orders });
  } catch (err) {
    // Log full error for debugging and return diagnostic info (temporary)
    console.error('Error listing stripe orders:', err && err.stack ? err.stack : err);
    const detail = (err && err.message) ? err.message : String(err);
    // Return error detail and stack to help debug (remove or reduce in production)
    res.status(500).json({ error: 'Error obteniendo orders de Stripe', detail, stack: (err && err.stack) ? err.stack.split('\n').slice(0,10) : undefined });
  }
};
