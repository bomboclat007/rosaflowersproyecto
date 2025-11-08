const { createClient } = require('@supabase/supabase-js');

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
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in env' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Return last 200 orders from pos_orders
    const { data, error } = await supabase
      .from('pos_orders')
      .select('*')
      .order('session_created', { ascending: false })
      .limit(200);

    if (error) {
      console.error('Error reading pos_orders:', error);
      return res.status(500).json({ error: 'Error fetching orders from Supabase' });
    }

    return res.status(200).json({ orders: data || [] });
  } catch (err) {
    console.error('Error in /api/orders:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
