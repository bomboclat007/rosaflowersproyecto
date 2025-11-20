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
      // Try reading from a dedicated table `featured_events` first (if it exists)
      try{
        const tbl = await supabase.from('featured_events').select('event_id,slug');
        if (!tbl.error && Array.isArray(tbl.data)){
          const items = tbl.data.map(r => ({ id: r.event_id || null, slug: r.slug || null })).filter(x=>x.id||x.slug);
          const slugs = items.map(i=>i.slug).filter(Boolean);
          return res.status(200).json({ slugs, items });
        }
      }catch(e){ /* ignore table errors, fall back to storage */ }

      // Fallback: read JSON object from storage path 'featured-events.json'
      try{
        const down = await supabase.storage.from(bucket).download('featured-events.json');
        if (!down.error){
          const txt = await down.data.text();
          const j = JSON.parse(txt||'{}');
          // prior format may have only slugs array; new format may have items array
          const items = Array.isArray(j.items) ? j.items : (Array.isArray(j.slugs) ? j.slugs.map(s=>({ id: null, slug: s })) : []);
          const slugs = items.map(i=>i.slug).filter(Boolean);
          return res.status(200).json({ slugs, items });
        }
      }catch(e){ /* ignore */ }

      return res.status(200).json({ slugs: [], items: [] });
    }

    if (req.method === 'POST'){
      let body = req.body || {};
      try{ if (!body || Object.keys(body).length===0) body = JSON.parse(req.rawBody||'{}'); }catch(e){}

      // Accept both old format (array of strings under `slugs`) and new format (array of objects under `items`)
      const rawSlugs = Array.isArray(body.slugs) ? body.slugs : [];
      const rawItems = Array.isArray(body.items) ? body.items : [];

      // normalize into items: { id, slug }
      const items = [];
      rawItems.forEach(it => { try{ const id = it && it.id ? String(it.id).trim() : null; const slug = it && it.slug ? String(it.slug).trim() : null; if (id||slug) items.push({ id: id||null, slug: slug||null }); }catch(e){} });
      rawSlugs.forEach(s => { try{ const v = String(s).trim(); if (!v) return; // v might be id or slug; detect uuid
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)){
          // uuid -> add as id
          items.push({ id: v, slug: null });
        } else {
          items.push({ id: null, slug: v });
        }
      }catch(e){} });

      // dedupe by preferring id then slug
      const seen = new Set();
      const deduped = [];
      items.forEach(it => {
        const key = it.id ? `id:${it.id}` : `slug:${(it.slug||'')}`;
        if (!seen.has(key)) { seen.add(key); deduped.push(it); }
      });

      // Try writing to table first: table expected columns event_id, slug
      try{
        // clear table
        await supabase.from('featured_events').delete().neq('id','');
        if (deduped.length){
          const rows = deduped.map(it => ({ event_id: it.id || null, slug: it.slug || null }));
          const up = await supabase.from('featured_events').insert(rows);
          if (!up.error) return res.status(200).json({ slugs: deduped.map(i=>i.slug).filter(Boolean), items: deduped });
        } else {
          return res.status(200).json({ slugs: [], items: [] });
        }
      }catch(e){ /* ignore table write errors */ }

      // Fallback: write to storage as JSON with both slugs and items
      try{
        const payload = { items: deduped, slugs: deduped.map(i=>i.slug).filter(Boolean) };
        const blob = Buffer.from(JSON.stringify(payload));
        const { data, error } = await supabase.storage.from(bucket).upload('featured-events.json', blob, { upsert: true });
        if (error) { console.warn('featured-events storage upload failed', error); return res.status(500).json({ error: 'Failed to save' }); }
        return res.status(200).json({ slugs: payload.slugs, items: payload.items });
      }catch(e){ console.error('featured-events save error', e); return res.status(500).json({ error: 'Internal' }); }
    }

    res.setHeader('Allow',['GET','POST','OPTIONS']);
    return res.status(405).end('Method Not Allowed');
  }catch(err){ console.error('api/featured-events unexpected', err); return res.status(500).json({ error: 'Internal' }); }
}
