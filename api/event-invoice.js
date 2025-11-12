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

  // Support GET (list & detail) and POST (create)
  if (req.method === 'GET') {
    // GET /api/event-invoice -> list with pagination and optional search
    const q = req.query || {};
    // If an id is provided, return single invoice (use service role to bypass RLS)
    if (q.id) {
      try {
        const { data, error } = await supabase.from('event_invoices').select('*').eq('id', q.id).single();
        if (error) {
          console.error('Supabase get by id error:', error);
          return res.status(500).json({ error: 'Error fetching invoice', details: error });
        }
        // compute public url for cover image if present
        try{
          const bucket = process.env.SUPABASE_BUCKET || 'invoices';
          const row = data;
          const p = row.cover_image_path && String(row.cover_image_path).trim();
          if (p){
            let path = p;
            const prefix = bucket + '/';
            if (path.indexOf(prefix) === 0) path = path.slice(prefix.length);
            if (path.indexOf(bucket + '/') === 0) path = path.split('/').slice(1).join('/');
            const publicObj = supabase.storage.from(bucket).getPublicUrl(path);
            const publicURL = publicObj && (publicObj.publicURL || (publicObj.data && publicObj.data.publicUrl)) || null;
            row.cover_image_public_url = publicURL;
          } else {
            data.cover_image_public_url = null;
          }
        }catch(e){ console.warn('Could not compute cover_image_public_url for invoice', e); data.cover_image_public_url = null; }

        return res.status(200).json({ invoice: data });
      } catch (err) {
        console.error('api/event-invoice GET by id error', err);
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
    const page = Math.max(parseInt(q.page || '1', 10), 1);
    const page_size = Math.min(Math.max(parseInt(q.page_size || '20', 10), 1), 200);
    const offset = (page - 1) * page_size;

    try {
      let builder = supabase
        .from('event_invoices')
        .select('*', { count: 'exact' })
        .order('event_start', { ascending: false })
        .range(offset, offset + page_size - 1);

      // simple status filter
      if (q.status) builder = builder.eq('status', q.status);

      // simple text search across title and po_number (basic)
      if (q.search) {
        const s = q.search;
        // use ilike for simple partial match
        builder = builder.or(`title.ilike.%${s}%,po_number.ilike.%${s}%`);
      }

      const { data, error, count } = await builder;
      if (error) {
        console.error('Supabase list error:', error);
        return res.status(500).json({ error: 'Error fetching event invoices' });
      }

      // If cover image paths exist, attempt to compute a public URL using Storage
      try {
        const bucket = process.env.SUPABASE_BUCKET || 'invoices';

        async function findWorkingPublicUrl(rawPath){
          if (!rawPath) return null;
          const p = String(rawPath).trim();
          const tried = new Set();
          const candidates = [];
          // candidate: strip leading bucket/ if present
          const prefix = bucket + '/';
          if (p.indexOf(prefix) === 0) candidates.push(p.slice(prefix.length));
          // candidate: raw
          candidates.push(p);
          // candidate: ensure bucket/ + raw (in case stored path lacked expected structure)
          if (p.indexOf(prefix) !== 0) candidates.push(prefix + p);

          for (const cand of candidates){
            if (!cand || tried.has(cand)) continue;
            tried.add(cand);
            try{
              const publicObj = supabase.storage.from(bucket).getPublicUrl(cand);
              const publicURL = publicObj && (publicObj.publicURL || (publicObj.data && publicObj.data.publicUrl)) || null;
              if (!publicURL) continue;
              // check that it actually resolves
              try{
                const r = await fetch(publicURL, { method: 'HEAD' });
                if (r && (r.status === 200 || r.status === 204)) return publicURL;
              }catch(e){
                // continue trying other candidates
              }
            }catch(e){ /* ignore and continue */ }
          }
          // last-resort: return the first getPublicUrl result even if HEAD failed
          try{
            const publicObj = supabase.storage.from(bucket).getPublicUrl(p);
            return publicObj && (publicObj.publicURL || (publicObj.data && publicObj.data.publicUrl)) || null;
          }catch(e){ return null; }
        }

        for (const row of (data || [])){
          try{
            const p = row.cover_image_path && String(row.cover_image_path).trim();
            if (!p) { row.cover_image_public_url = null; continue; }
            row.cover_image_public_url = await findWorkingPublicUrl(p);
          }catch(e){ row.cover_image_public_url = null; }
        }
      } catch(e) { console.warn('Could not compute cover image public urls', e); }

      return res.status(200).json({ invoices: data || [], count: count || 0, page, page_size });
    } catch (err) {
      console.error('api/event-invoice GET error', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const payload = req.body || {};

    // If this POST is for file metadata insertion (action=file), handle separately
    const q = req.query || {};
    if (q.action === 'file' || payload.action === 'file') {
      // require invoice_id and storage_path
      const invoice_id = payload.invoice_id;
      const storage_path = payload.storage_path;
      if (!invoice_id || !storage_path) {
        return res.status(400).json({ error: 'Missing required fields for file insert: invoice_id and storage_path' });
      }

      const fileRow = {
        invoice_id,
        storage_path,
        file_name: payload.file_name || null,
        content_type: payload.content_type || null,
        size: payload.size || null
      };

      // If cover metadata provided, update the invoice record's cover fields first
      try {
        const coverUpdate = {};
        if (payload.cover_image_path) coverUpdate.cover_image_path = payload.cover_image_path;
        if (payload.cover_image_name) coverUpdate.cover_image_name = payload.cover_image_name;
        if (payload.cover_image_content_type) coverUpdate.cover_image_content_type = payload.cover_image_content_type;
        if (payload.cover_image_size) coverUpdate.cover_image_size = payload.cover_image_size;
        if (Object.keys(coverUpdate).length > 0) {
          const { data: updData, error: updErr } = await supabase.from('event_invoices').update(coverUpdate).eq('id', invoice_id).select('*').single();
          if (updErr) {
            console.error('Supabase update error (event_invoices):', updErr);
            return res.status(500).json({ error: 'Error updating invoice cover metadata', details: updErr });
          }
        }
      } catch (uErr) {
        console.error('Error updating cover metadata', uErr);
        return res.status(500).json({ error: 'Error updating invoice cover metadata', details: (uErr && uErr.message) || String(uErr) });
      }

      const { data: fdata, error: ferror } = await supabase.from('event_invoice_files').insert([fileRow]).select('*').single();
      if (ferror) {
        console.error('Supabase insert error (event_invoice_files):', ferror);
        return res.status(500).json({ error: 'Error saving file metadata', details: ferror });
      }

      return res.status(200).json({ file: fdata });
    }

    // If payload includes an id, perform an update (handled server-side to avoid RLS issues)
    if (payload.id) {
      const id = payload.id;
      // Build row for update (only allow certain fields to be updated)
      const upd = {
        title: payload.title || null,
        po_number: payload.po_number || null,
        customer: payload.customer || null,
        event_start: payload.event_start || null,
        event_end: payload.event_end || null,
        venue: payload.venue || null,
        note_to_customer: payload.note_to_customer || null,
        sections: payload.sections || null,
        products: payload.products || null,
        ingredients: payload.ingredients || null,
        totals: payload.totals || null,
        status: payload.status || 'draft'
      };

      const { data: udata, error: uerror } = await supabase.from('event_invoices').update(upd).eq('id', id).select('*').single();
      if (uerror) {
        console.error('Supabase update error (event_invoices):', uerror);
        return res.status(500).json({ error: 'Error updating event invoice', details: uerror });
      }
      return res.status(200).json({ invoice: udata });
    }

    // minimal validation for invoice create
    if (!payload.title && !payload.customer) {
      return res.status(400).json({ error: 'Missing required fields: title or customer' });
    }

    // Build row for insertion
    const row = {
      title: payload.title || null,
      po_number: payload.po_number || null,
      customer: payload.customer || null,
      event_start: payload.event_start || null,
      event_end: payload.event_end || null,
      venue: payload.venue || null, // JSON object
      note_to_customer: payload.note_to_customer || null,
      sections: payload.sections || null, // JSON blob with sections/products/recipe etc
      products: payload.products || null,
      ingredients: payload.ingredients || null,
      totals: payload.totals || null,
      status: payload.status || 'draft'
    };

    const { data, error } = await supabase
      .from('event_invoices')
      .insert([row])
      .select('*')
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      // Return error details for debugging (remove in production)
      return res.status(500).json({ error: 'Error saving event invoice', details: error });
    }

    return res.status(200).json({ invoice: data });
  } catch (err) {
    console.error('api/event-invoice error', err);
    return res.status(500).json({ error: 'Internal server error', details: (err && err.message) || String(err) });
  }
};
