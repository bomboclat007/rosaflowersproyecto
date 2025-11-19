const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in env' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST', 'OPTIONS']);
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const payload = req.body || {};
    const invoice_id = payload.invoice_id;
    const storage_path = payload.storage_path;

    if (!invoice_id || !storage_path) {
      return res.status(400).json({ error: 'Missing required fields: invoice_id and storage_path' });
    }

    const row = {
      invoice_id,
      storage_path,
      file_name: payload.file_name || null,
      content_type: payload.content_type || null,
      size: payload.size || null
    };

    const { data, error } = await supabase.from('event_invoice_files').insert([row]).select('*').single();
    if (error) {
      console.error('Supabase insert error (event_invoice_files):', error);
      return res.status(500).json({ error: 'Error saving file metadata', details: error });
    }

    return res.status(200).json({ file: data });
  } catch (err) {
    console.error('api/event-invoice-file error', err);
    return res.status(500).json({ error: 'Internal server error', details: (err && err.message) || String(err) });
  }
};
