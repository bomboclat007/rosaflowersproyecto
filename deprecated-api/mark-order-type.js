// Admin-only helper: set order_type for a pos_orders row (idempotent)
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  const secret = req.headers['x-admin-secret'] || req.query.secret || req.body && req.body.secret;
  if (!secret || secret !== process.env.ADMIN_TRIGGER_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const { id, order_type } = req.body || {};
  if (!id || !order_type) return res.status(400).json({ error: 'Missing id or order_type in body' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Supabase admin config missing' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  try {
    const upd = { id, order_type };
    const { error } = await supabase.from('pos_orders').upsert(upd, { onConflict: 'id' });
    if (error) return res.status(500).json({ error: 'Failed to update', details: error.message || error });
    return res.status(200).json({ ok: true, id, order_type });
  } catch (err) {
    console.error('mark-order-type error', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Server error', details: String(err && err.message ? err.message : err) });
  }
};
