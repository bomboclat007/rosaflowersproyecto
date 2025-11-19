const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST', 'OPTIONS']);
    return res.status(405).end('Method Not Allowed');
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in env' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = req.body || {};
    const name = body.name; // path within bucket, as returned by upload-cover
    const bucket = body.bucket || (process.env.SUPABASE_BUCKET || 'banners');

    if (!name) return res.status(400).json({ error: 'Missing required field: name' });

    const meta = { name };
    const blob = Buffer.from(JSON.stringify(meta));

    const { data, error } = await supabase.storage.from(bucket).upload('active-banner.json', blob, { upsert: true });
    if (error) {
      console.error('activate-banner upload error', error);
      return res.status(500).json({ error: 'Failed to write active-banner.json', details: error });
    }

    return res.status(200).json({ ok: true, name });
  } catch (err) {
    console.error('api/activate-banner error', err);
    return res.status(500).json({ error: 'Internal server error', details: (err && err.message) || String(err) });
  }
};
