// Admin-only endpoint to import recent Stripe Checkout Sessions into Supabase `pos_orders`.
// Protect by passing ?secret=ADMIN_TRIGGER_SECRET or header x-admin-secret
const stripeSecret = process.env.STRIPE_SECRET_KEY || require('../config/stripe').STRIPE_SECRET_KEY;
const stripe = require('stripe')(stripeSecret);
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  const secret = req.headers['x-admin-secret'] || req.query.secret || req.body && req.body.secret;
  if (!secret || secret !== process.env.ADMIN_TRIGGER_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase admin config missing' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // list recent sessions (first page); for larger volumes we could paginate
    const sessions = await stripe.checkout.sessions.list({ limit: 200 });
    let count = 0;
    for (const s of sessions.data) {
      try {
        const full = await stripe.checkout.sessions.retrieve(s.id, { expand: ['line_items', 'payment_intent', 'customer'] });

        // build line items
        const items = (full.line_items && full.line_items.data) ? full.line_items.data : [];
        const line_items = items.map(li => ({
          id: li.id,
          description: li.description || (li.price && li.price.product && li.price.product.name) || null,
          quantity: li.quantity || 1,
          amount_total: li.amount_total != null ? li.amount_total : (li.price && li.price.unit_amount ? li.price.unit_amount * (li.quantity || 1) : null)
        }));

        // parse checkout_info if present
        const parseCheckoutInfo = (md) => {
          if (!md) return null;
          const ci = md.checkout_info;
          if (!ci) return null;
          try { return (typeof ci === 'string') ? JSON.parse(ci) : ci; } catch (e) { return null; }
        };
        const ci = parseCheckoutInfo(full.metadata);
        const recipient = (full.metadata && (full.metadata.recipient_name || full.metadata.recipient)) || (ci && ((ci.rFirst || ci.firstName) ? [ci.rFirst || ci.firstName, ci.rLast || ci.lastName].filter(Boolean).join(' ') : (ci.recipientName || ci.recipient))) || null;
        const order_type = (full.metadata && full.metadata.order_type) || (ci && (ci.order_type || ci.fulfillmentType || ci.fulfillment_type)) || null;

        const addrObj = (full.shipping || full.shipping_details || (full.customer_details && full.customer_details.address)) || null;
        const addrParts = [];
        if (addrObj) {
          if (addrObj.name) addrParts.push(addrObj.name);
          if (addrObj.line1) addrParts.push(addrObj.line1);
          if (addrObj.line2) addrParts.push(addrObj.line2);
          if (addrObj.city) addrParts.push(addrObj.city);
          if (addrObj.state) addrParts.push(addrObj.state);
          if (addrObj.postal_code) addrParts.push(addrObj.postal_code);
          if (addrObj.country) addrParts.push(addrObj.country);
        }
        const delivery_address = addrParts.join(', ');

        const orderRow = {
          id: full.id,
          session_created: full.created || null,
          amount_total: full.amount_total || null,
          currency: full.currency || null,
          payment_status: full.payment_status || (full.payment_intent && full.payment_intent.status) || null,
          payment_method: null,
          customer_name: (full.customer_details && full.customer_details.name) || null,
          customer_email: (full.customer_details && full.customer_details.email) || full.customer_email || null,
          recipient: recipient,
          delivery_address: delivery_address || null,
          designer: (full.metadata && full.metadata.designer) || null,
          order_type: order_type,
          bloomsnap: (full.metadata && (full.metadata.bloomsnap || full.metadata.bloomsnap_url)) || null,
          fulfillment_date: (full.metadata && full.metadata.fulfillment_date) || null,
          time_due: (full.metadata && full.metadata.time_due) || null,
          order_status: (full.metadata && full.metadata.order_status) || null,
          line_items,
          metadata: full.metadata || {}
        };

        // upsert
        await supabase.from('pos_orders').upsert(orderRow, { onConflict: 'id' });
        count++;
      } catch (e) {
        console.warn('error importing session', s.id, e && e.message ? e.message : e);
      }
    }

    return res.status(200).json({ imported: count });
  } catch (err) {
    console.error('Error importing stripe sessions:', err);
    return res.status(500).json({ error: 'Import failed', details: String(err && err.message ? err.message : err) });
  }
};
