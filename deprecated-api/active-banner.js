const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
  if(req.method === 'OPTIONS') return res.status(204).end();
  if(req.method !== 'GET'){ res.setHeader('Allow',['GET','OPTIONS']); return res.status(405).end('Method Not Allowed'); }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Server misconfigured' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const bucket = process.env.SUPABASE_BUCKET || 'banners';

  try{
    // try to download active-banner.json
    const down = await supabase.storage.from(bucket).download('active-banner.json');
    if(down.error) return res.status(200).json({ active: null });
    const txt = await down.data.text();
    const meta = JSON.parse(txt || '{}');
    if(!meta || !meta.name) return res.status(200).json({ active: null });

    // build public url
    let publicURL = null;
    try{
      const pub = supabase.storage.from(bucket).getPublicUrl(meta.name);
      publicURL = pub && (pub.publicURL || (pub.data && pub.data.publicUrl)) || null;
      if(publicURL && publicURL.data && publicURL.data.publicUrl) publicURL = publicURL.data.publicUrl;
    }catch(e){ publicURL = null; }

    // older SDK shape
    if(!publicURL && meta.name){
      publicURL = `${SUPABASE_URL.replace(/\/$/,'')}/storage/v1/object/public/${bucket}/${encodeURIComponent(meta.name)}`;
    }

    return res.status(200).json({ active: { name: meta.name, publicURL } });
  }catch(err){
    console.error('api/active-banner error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
