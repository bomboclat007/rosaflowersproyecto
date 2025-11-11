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

    // minimal validation
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
      return res.status(500).json({ error: 'Error saving event invoice' });
    }

    return res.status(200).json({ invoice: data });
  } catch (err) {
    console.error('api/event-invoice error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
