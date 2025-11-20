const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in env' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { 'x-from-api': 'event-invoice' } }
  });

  try {
    if (req.method === 'GET') {
      const q = req.query || {};
      const page = Math.max(1, parseInt(q.page || '1', 10));
      const page_size = Math.min(200, Math.max(1, parseInt(q.page_size || '20', 10)));
      const from = (page - 1) * page_size;
      const to = from + page_size - 1;

      let query = supabase.from('event_invoices').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(from, to);

      if (q.status) query = query.eq('status', q.status);
      if (q.search) {
        const s = String(q.search).trim();
        // search title or po_number
        query = query.or(`title.ilike.%${s}%,po_number.ilike.%${s}%`);
      }

      const { data, error, count } = await query;
      if (error) {
        console.error('api/event-invoice GET error', error);
        return res.status(500).json({ error: 'Error fetching invoices' });
      }
      return res.status(200).json({ invoices: data || [], count: count || 0, page, page_size });
    }

    if (req.method === 'POST') {
      let body = req.body || {};
      try { if (!body || Object.keys(body).length === 0) body = JSON.parse(req.rawBody || '{}'); } catch(e){}

      // If this is a file metadata action, update the invoice with file info
      if (body.action === 'file' && body.invoice_id) {
        const invoiceId = body.invoice_id;
        const update = {
          cover_image_path: body.cover_image_path || body.storage_path || null,
          cover_image_name: body.cover_image_name || body.file_name || null,
          cover_image_content_type: body.cover_image_content_type || body.content_type || null,
          cover_image_size: body.cover_image_size || body.size || null,
          updated_at: new Date().toISOString()
        };
        const { data, error } = await supabase.from('event_invoices').update(update).eq('id', invoiceId).select().single();
        if (error) {
          console.error('api/event-invoice file update error', error);
          return res.status(500).json({ error: 'Error updating invoice with file metadata' });
        }
        return res.status(200).json({ ok: true, invoice: data });
      }

      // Normal create or update flow: if id present -> update, else insert
      const payload = Object.assign({}, body);
      if (!payload.title) payload.title = payload.po_number || 'Untitled Event';
      payload.updated_at = new Date().toISOString();

      if (payload.id) {
        const id = payload.id;
        delete payload.id;
        const { data, error } = await supabase.from('event_invoices').update(payload).eq('id', id).select().single();
        if (error) {
          console.error('api/event-invoice update error', error);
          return res.status(500).json({ error: 'Error updating invoice' });
        }
        return res.status(200).json({ invoice: data });
      }

      // create new invoice
      payload.created_at = new Date().toISOString();
      const { data, error } = await supabase.from('event_invoices').insert([payload]).select().single();
      if (error) {
        console.error('api/event-invoice POST error', error);
        return res.status(500).json({ error: 'Error creating invoice' });
      }
      return res.status(201).json({ invoice: data });
    }

      if (req.method === 'DELETE') {
        // support DELETE /api/event-invoice?id=<id>
        const q = req.query || {};
        let id = q.id || null;
        // also accept JSON body with id
        if (!id) {
          try {
            const body = req.body || JSON.parse(req.rawBody || '{}');
            id = body && body.id ? body.id : null;
          } catch(e) { id = null; }
        }
        if (!id) return res.status(400).json({ error: 'Missing id for delete' });
        // delete the invoice row
        const { data, error } = await supabase.from('event_invoices').delete().eq('id', id).select().single();
        if (error) {
          console.error('api/event-invoice DELETE error', error);
          return res.status(500).json({ error: 'Error deleting invoice' });
        }
        return res.status(200).json({ ok: true, invoice: data });
      }

    res.setHeader('Allow', ['GET','POST','OPTIONS']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (err) {
    console.error('api/event-invoice unexpected error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
