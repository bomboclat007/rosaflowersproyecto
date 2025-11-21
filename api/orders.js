const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(501).json({ error: 'SUPABASE not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    if (req.method === 'GET') {
      const q = req.query || {};
      const type = q.type || null;
      // Basic pagination
      const limit = Math.min(500, Math.max(1, parseInt(q.limit || '100', 10)));
      let query = supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(limit);
      if (type) query = query.eq('order_type', type);

      const { data, error } = await query;
      if (error) {
        console.error('api/orders GET error', error);
        return res.status(500).json({ error: 'Error fetching orders from Supabase' });
      }
      return res.status(200).json({ orders: data || [] });
    }

    res.setHeader('Allow', ['GET','OPTIONS']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (err) {
    console.error('api/orders unexpected error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
