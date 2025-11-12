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
    const invoice_id = body.invoice_id;
    const file_name = body.file_name;
    const content_type = body.content_type || 'application/octet-stream';
    const base64 = body.base64;
    const bucket = body.bucket || (process.env.SUPABASE_BUCKET || 'invoices');

    if (!invoice_id || !file_name || !base64) {
      return res.status(400).json({ error: 'Missing required fields: invoice_id, file_name, base64' });
    }

    const safeName = file_name.replace(/[^a-z0-9\.\-_]/ig, '');
    const path = `${bucket}/${invoice_id}/${Date.now()}-${safeName}`;

    const buffer = Buffer.from(base64, 'base64');

    const { data, error } = await supabase.storage.from(bucket).upload(path, buffer, { contentType: content_type, upsert: false });
    if (error) {
      console.error('upload-cover: storage.upload error', error);
      return res.status(500).json({ error: 'Storage upload error', details: error });
    }

    // get public url
    const publicObj = supabase.storage.from(bucket).getPublicUrl(path);
    const publicURL = publicObj && (publicObj.publicURL || (publicObj.data && publicObj.data.publicUrl)) || null;

    return res.status(200).json({ path, publicURL });
  } catch (err) {
    console.error('api/upload-cover error', err);
    return res.status(500).json({ error: 'Internal server error', details: (err && err.message) || String(err) });
  }
};
