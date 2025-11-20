const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucketDefault = process.env.SUPABASE_BUCKET || 'banners';

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in env' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // GET /api/upload-cover.js?action=active  => returns active banner meta
  if (req.method === 'GET') {
    try {
      const urlStr = req.url || '';
      const action = (req.query && req.query.action) || (urlStr.indexOf('?')>-1 && new URL('http://x'+urlStr).searchParams.get('action'));
      if (action === 'probe') {
        const name = (req.query && req.query.name) || (urlStr.indexOf('?')>-1 && new URL('http://x'+urlStr).searchParams.get('name'));
        if (!name) return res.status(400).json({ error: 'Missing name for probe' });
        // normalize
        let probeName = String(name || '');
        if (probeName.indexOf(bucketDefault + '/') === 0) probeName = probeName.slice(bucketDefault.length + 1);
        if (probeName.indexOf('/') === 0) probeName = probeName.slice(1);
        const downProbe = await supabase.storage.from(bucketDefault).download(probeName);
        if (downProbe.error) return res.status(200).json({ found: false, error: downProbe.error.message || downProbe.error });
        return res.status(200).json({ found: true, name: probeName });
      }

      if (action !== 'active') return res.status(400).json({ error: 'Unsupported GET action' });

      const down = await supabase.storage.from(bucketDefault).download('active-banner.json');
      if (down.error) return res.status(200).json({ active: null });
      const txt = await down.data.text();
      const meta = JSON.parse(txt || '{}');
      if (!meta || !meta.name) return res.status(200).json({ active: null });

      // Normalize stored name: strip bucket prefix if present so it's relative to the bucket
      let storedName = String(meta.name || '');
      if (storedName.indexOf(bucketDefault + '/') === 0) storedName = storedName.slice(bucketDefault.length + 1);
      if (storedName.indexOf('/') === 0) storedName = storedName.slice(1);

      let publicURL = null;
      try{
        const pub = supabase.storage.from(bucketDefault).getPublicUrl(storedName);
        publicURL = pub && (pub.publicURL || (pub.data && pub.data.publicUrl)) || null;
        if(publicURL && publicURL.data && publicURL.data.publicUrl) publicURL = publicURL.data.publicUrl;
      }catch(e){ publicURL = null; }

      if(!publicURL && storedName){
        publicURL = `${SUPABASE_URL.replace(/\/$/,'')}/storage/v1/object/public/${bucketDefault}/${encodeURIComponent(storedName)}`;
      }

      // Legacy fallback: some earlier uploads accidentally included the bucket
      // name in the object key (e.g. 'banners/banner-manager/...'). If the
      // object isn't present under the normalized key, probe the alt key and
      // return a publicURL that points to the actual stored object if found.
      try{
        const altKey = `${bucketDefault}/${storedName}`;
        const probe = await supabase.storage.from(bucketDefault).download(altKey);
        if (!probe.error) {
          publicURL = `${SUPABASE_URL.replace(/\/$/,'')}/storage/v1/object/public/${bucketDefault}/${encodeURIComponent(altKey)}`;
        }
      }catch(e){ /* ignore */ }

      return res.status(200).json({ active: { name: storedName, publicURL } });
    } catch (err) {
      console.error('api/upload-cover GET error', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // POST handling: either upload (base64) or activate (action=activate)
  if (req.method === 'POST') {
    try {
      const body = req.body || {};

      // activation request: { action: 'activate', path: 'bucket/...', bucket: 'banners' }
      if (body.action === 'activate' && body.path) {
        const bucket = body.bucket || bucketDefault;
        // Normalize provided path: remove bucket prefix if present so we store a path relative to the bucket
        let provided = String(body.path || '');
        if (provided.indexOf(bucket + '/') === 0) provided = provided.slice(bucket.length + 1);
        if (provided.indexOf('/') === 0) provided = provided.slice(1);

        const meta = { name: provided };
        const blob = Buffer.from(JSON.stringify(meta));
        const { data, error } = await supabase.storage.from(bucket).upload('active-banner.json', blob, { upsert: true });
        if (error) { console.error('activate upload error', error); return res.status(500).json({ error: 'Failed to write active-banner.json', details: error }); }
        return res.status(200).json({ ok: true, name: provided });
      }

      // upload request (legacy): expects invoice_id, file_name, base64
      const invoice_id = body.invoice_id;
      const file_name = body.file_name;
      const content_type = body.content_type || 'application/octet-stream';
      const base64 = body.base64;
      const bucket = body.bucket || bucketDefault;

      if (!invoice_id || !file_name || !base64) {
        return res.status(400).json({ error: 'Missing required fields: invoice_id, file_name, base64' });
      }

      const safeName = file_name.replace(/[^a-z0-9\.\-_]/ig, '');
      // store path relative to the bucket (don't prefix with the bucket name)
      const path = `${invoice_id}/${Date.now()}-${safeName}`;

      const buffer = Buffer.from(base64, 'base64');

      const { data, error } = await supabase.storage.from(bucket).upload(path, buffer, { contentType: content_type, upsert: false });
      if (error) { console.error('upload-cover: storage.upload error', error); return res.status(500).json({ error: 'Storage upload error', details: error }); }

      // get public url
      const publicObj = supabase.storage.from(bucket).getPublicUrl(path);
      const publicURL = publicObj && (publicObj.publicURL || (publicObj.data && publicObj.data.publicUrl)) || null;

      return res.status(200).json({ path, publicURL });
    } catch (err) {
      console.error('api/upload-cover POST error', err);
      return res.status(500).json({ error: 'Internal server error', details: (err && err.message) || String(err) });
    }
  }
  
  return res.status(405).end('Method Not Allowed');
};
