// Admin endpoint: scan pos_orders and mark order_type = 'pos' for rows that match POS heuristics
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  const secret = req.headers['x-admin-secret'] || req.query.secret || req.body && req.body.secret;
  if (!secret || secret !== process.env.ADMIN_TRIGGER_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Supabase admin config missing' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // dry_run=true in body => return candidates but don't update
  const dry = req.body && req.body.dry === true;
  try {
    // fetch rows with null order_type
    const { data: rows, error } = await supabase.from('pos_orders').select('*').is('order_type', null).limit(1000);
    if (error) return res.status(500).json({ error: 'Failed to read pos_orders', details: error.message || error });

    const candidates = [];
    for (const r of rows) {
      // heuristic: if metadata contains fulfillment/pos keywords
      const md = r.metadata || {};
      const metaStr = JSON.stringify(md).toLowerCase();
      const hasMetaFulfillment = /\b(pos|pickup|delivery|fulfillment|fulfillmenttype|fulfillment_type)\b/.test(metaStr);
      if (hasMetaFulfillment && /\bpos\b/.test(metaStr)) {
        candidates.push(r.id);
        continue;
      }

      // check payment_method stored in row (if any)
      const pm = (r.payment_method || '').toLowerCase();
      if (pm && /present|card_present|terminal|pos|in-person|in_person|eftpos/.test(pm)) {
        candidates.push(r.id);
        continue;
      }

      // heuristic: no metadata and no customer_email and paid -> probable POS
      const hasMetadata = md && Object.keys(md).length > 0;
      const email = r.customer_email || null;
      if (!hasMetadata && !email && (r.payment_method === 'card' || (r.payment_status && r.payment_status === 'paid'))) {
        candidates.push(r.id);
        continue;
      }
    }

    if (dry) return res.status(200).json({ candidates, count: candidates.length });

    // perform updates in batches
    let updated = 0;
    for (const id of candidates) {
      const { error: upErr } = await supabase.from('pos_orders').upsert({ id, order_type: 'pos' }, { onConflict: 'id' });
      if (!upErr) updated++;
    }

    return res.status(200).json({ updated, candidates, count: candidates.length });
  } catch (err) {
    console.error('mark-pos-by-heuristic error', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Server error', details: String(err && err.message ? err.message : err) });
  }
};
