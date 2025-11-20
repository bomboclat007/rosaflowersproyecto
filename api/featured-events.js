const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_BUCKET || 'banners';
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Server misconfigured' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    if (req.method === 'GET'){
      // Try reading from a dedicated table `featured_events` first
      try{
        const tbl = await supabase.from('featured_events').select('slug');
        if (!tbl.error && Array.isArray(tbl.data)){
          const slugs = tbl.data.map(r=>r.slug).filter(Boolean);
          return res.status(200).json({ slugs });
        }
      }catch(e){ /* ignore table errors, fall back to storage */ }

      // Fallback: read JSON object from storage path 'featured-events.json'
      try{
        const down = await supabase.storage.from(bucket).download('featured-events.json');
        if (!down.error){
          const txt = await down.data.text();
          const j = JSON.parse(txt||'{}');
          return res.status(200).json({ slugs: Array.isArray(j.slugs)? j.slugs : [] });
        }
      }catch(e){ /* ignore */ }

      return res.status(200).json({ slugs: [] });
    }

    if (req.method === 'POST'){
      let body = req.body || {};
      try{ if (!body || Object.keys(body).length===0) body = JSON.parse(req.rawBody||'{}'); }catch(e){}
      const slugs = Array.isArray(body.slugs) ? body.slugs.map(s=>String(s).trim()).filter(Boolean) : [];

      // Try writing to table first
      try{
        // replace all rows: simple approach - delete then insert
        await supabase.from('featured_events').delete().neq('id','');
        if (slugs.length){
          const rows = slugs.map(s=>({ slug: s }));
          const up = await supabase.from('featured_events').insert(rows);
          if (!up.error) return res.status(200).json({ slugs });
        } else {
          return res.status(200).json({ slugs });
        }
      }catch(e){ /* ignore table write errors */ }

      // Fallback: write to storage as JSON
      try{
        const blob = Buffer.from(JSON.stringify({ slugs }));
        const { data, error } = await supabase.storage.from(bucket).upload('featured-events.json', blob, { upsert: true });
        if (error) { console.warn('featured-events storage upload failed', error); return res.status(500).json({ error: 'Failed to save' }); }
        return res.status(200).json({ slugs });
      }catch(e){ console.error('featured-events save error', e); return res.status(500).json({ error: 'Internal' }); }
    }

    res.setHeader('Allow',['GET','POST','OPTIONS']);
    return res.status(405).end('Method Not Allowed');
  }catch(err){ console.error('api/featured-events unexpected', err); return res.status(500).json({ error: 'Internal' }); }
}
